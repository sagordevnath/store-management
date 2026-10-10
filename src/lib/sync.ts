/**
 * Offline-first sync engine for Managix.
 *
 * - Local localStorage DB remains the source of truth while offline.
 * - On start: probe API, then pull the server doc (if newer) or push local.
 * - Every local `recordChange` schedules a debounced push.
 * - A poll loop pulls remote changes every few seconds.
 * - Deletions are tracked as tombstones (diffed between prev/next DB) so a
 *   last-writer-wins merge never resurrects deleted records.
 * - Works with the Express backend in Supabase mode or file mode — the
 *   frontend does not care which storage the server picked.
 */
import type { DB } from "../types";
import { migrateDB, saveDB } from "./store";

export type SyncStatus = "connecting" | "offline" | "syncing" | "synced" | "error";
export type BackendMode = "unknown" | "supabase" | "file";

export interface SyncSnapshot {
  status: SyncStatus;
  mode: BackendMode;
  lastSyncedAt: string | null;
  error: string | null;
  pendingPush: boolean;
  workspaceId: string;
}

const META_KEY = "Managix_sync_meta_v1";
const API_CANDIDATES = ["/api", "http://localhost:8787/api"];
const EPOCH = "1970-01-01T00:00:00.000Z";
const POLL_MS = 6000;
const PUSH_DEBOUNCE_MS = 1000;

interface Tombstone {
  id: string;
  at: string;
}

interface SyncMeta {
  workspaceId: string;
  lastSyncedAt: string;
  tombstones: Tombstone[];
  settingsDirty: boolean;
  apiBase: string | null;
}

function safeRead<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    // Corrupt / blocked storage must never blank-screen the app.
    // Quarantine the bad value so the next save starts clean.
    try { localStorage.removeItem(key); } catch { /* ignore */ }
    return null;
  }
}

function safeWrite(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / quota — app keeps running in memory */
  }
}

function loadMeta(): SyncMeta {
  const m = safeRead<Partial<SyncMeta>>(META_KEY);
  if (m?.workspaceId) {
    return {
      workspaceId: m.workspaceId,
      lastSyncedAt: m.lastSyncedAt || EPOCH,
      tombstones: m.tombstones || [],
      settingsDirty: !!m.settingsDirty,
      apiBase: m.apiBase || null,
    };
  }
  return {
    // Shared default workspace so multiple devices sync with each other.
    // Override by setting localStorage Managix_sync_meta_v1 manually if needed.
    workspaceId: "default",
    lastSyncedAt: EPOCH,
    tombstones: [],
    settingsDirty: false,
    apiBase: null,
  };
}

function persistMeta(meta: SyncMeta) {
  safeWrite(META_KEY, JSON.stringify(meta));
}

async function fetchJson<T>(base: string, path: string, init?: RequestInit, timeoutMs = 8000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(base + path, { ...init, signal: ctrl.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 120)}` : ""}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

type CollectionKey =
  | "products"
  | "categories"
  | "sales"
  | "purchases"
  | "customers"
  | "suppliers"
  | "duePayments"
  | "expenses"
  | "staff"
  | "subInvoices";
const COLLECTIONS: CollectionKey[] = [
  "products",
  "categories",
  "sales",
  "purchases",
  "customers",
  "suppliers",
  "duePayments",
  "expenses",
  "staff",
  "subInvoices",
];

function diffTombstones(prev: DB, next: DB): Tombstone[] {
  const out: Tombstone[] = [];
  const now = new Date().toISOString();
  for (const key of COLLECTIONS) {
    const before = new Set((prev[key] as { id: string }[]).map((x) => x.id));
    for (const item of next[key] as { id: string }[]) before.delete(item.id);
    for (const id of before) out.push({ id, at: now });
  }
  return out;
}

function applyTombstones(db: DB, tombstones: Map<string, Tombstone>): DB {
  const next = { ...db } as DB;
  for (const key of COLLECTIONS) {
    (next as Record<CollectionKey, unknown[]>)[key] = (db[key] as { id: string }[]).filter(
      (x) => !tombstones.has(x.id),
    );
  }
  return next;
}

/** Merge remote doc into local: remote wins per record (LWW), offline-created local records kept, deletions honored. */
function mergeDocs(local: DB, remote: DB, tombstones: Map<string, Tombstone>, keepLocalSettings: boolean): DB {
  const merged = applyTombstones(remote, tombstones) as DB;
  for (const key of COLLECTIONS) {
    const remoteIds = new Set((merged[key] as { id: string }[]).map((x) => x.id));
    const localExtras = (local[key] as { id: string }[]).filter((x) => !remoteIds.has(x.id));
    if (localExtras.length) {
      (merged as Record<CollectionKey, unknown[]>)[key] = [
        ...(merged[key] as unknown[]),
        ...localExtras,
      ];
    }
  }
  if (keepLocalSettings) merged.settings = local.settings;
  return merged;
}

/** Newest record timestamp in a doc — used to decide push-vs-adopt on first sync. */
function newestStamp(db: DB): string {
  let newest = EPOCH;
  const lists: { at?: string }[][] = [
    db.sales as unknown as { at?: string }[],
    db.purchases as unknown as { at?: string }[],
    db.expenses as unknown as { at?: string }[],
    db.customers as unknown as { at?: string }[],
  ];
  for (const list of lists) {
    for (const r of list) {
      if (r?.at && r.at > newest) newest = r.at;
    }
  }
  return newest;
}

/** Does the local doc hold real business data (not just demo seed)? */
function localHasBusinessData(db: DB): boolean {
  return (
    db.sales.length > 0 ||
    db.purchases.length > 0 ||
    db.expenses.length > 0 ||
    db.customers.length > 0 ||
    db.products.length > 0
  );
}

interface HealthResponse {
  ok: boolean;
  mode: BackendMode;
}
interface SyncResponse {
  changed: boolean;
  updatedAt: string;
  tombstones: Tombstone[];
  found: boolean;
  mode: BackendMode;
}
interface DbResponse {
  found: boolean;
  db: DB | null;
  updatedAt: string;
  tombstones: Tombstone[];
  mode: BackendMode;
}

class SyncEngine {
  private meta: SyncMeta = loadMeta();
  private listeners = new Set<() => void>();
  private snapshot: SyncSnapshot;
  private db: DB | null = null;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private accessToken: (() => Promise<string | null>) | null = null;

  /** Set by the app so remote merges/adoptions can update React state. */
  onReplace: ((db: DB) => void) | null = null;

  constructor() {
    this.snapshot = {
      status: "connecting",
      mode: "unknown",
      lastSyncedAt: this.meta.lastSyncedAt !== EPOCH ? this.meta.lastSyncedAt : null,
      error: null,
      pendingPush: false,
      workspaceId: this.meta.workspaceId,
    };
  }

  getSnapshot = (): SyncSnapshot => this.snapshot;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private emit(patch: Partial<SyncSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const fn of this.listeners) fn();
  }

  private async authenticatedJson<T>(base: string, path: string, init?: RequestInit): Promise<T> {
    const token = await this.accessToken?.();
    // Offline/file mode has no hosted auth — sync anonymously against the
    // local Express store. Supabase mode still requires the Bearer token.
    if (!token) {
      try {
        return await fetchJson<T>(base, path, init);
      } catch {
        throw new Error("Your sign-in session has expired. Please sign in again.");
      }
    }
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return fetchJson<T>(base, path, { ...init, headers });
  }

  private setMeta(patch: Partial<SyncMeta>) {
    this.meta = { ...this.meta, ...patch };
    persistMeta(this.meta);
    this.emit({ workspaceId: this.meta.workspaceId });
  }

  /** Probe candidate API bases (vite proxy first, then direct port). */
  private async probe(): Promise<string> {
    if (this.meta.apiBase) {
      try {
        await fetchJson<HealthResponse>(this.meta.apiBase, "/health", undefined, 4000);
        return this.meta.apiBase;
      } catch {
        this.setMeta({ apiBase: null });
      }
    }
    for (const base of API_CANDIDATES) {
      try {
        await fetchJson<HealthResponse>(base, "/health", undefined, 4000);
        this.setMeta({ apiBase: base });
        return base;
      } catch {
        /* try next */
      }
    }
    throw new Error("API not reachable");
  }

  /** Called once after the local DB is loaded. */
  async start(db: DB, workspaceId: string, accessToken: () => Promise<string | null>) {
    if (this.started) this.stop();
    // FIX: never reset lastSyncedAt/tombstones here. The previous line wiped
    // the sync cursor on every login/reload, so initialSync() always took the
    // "first sync → adopt server wholesale" branch and discarded same-day
    // local sales made while offline. Keep the persisted cursor; only scope
    // to the new workspace (a workspace switch legitimately needs a resync).
    const prev = loadMeta();
    const switched = prev.workspaceId !== workspaceId;
    this.setMeta({
      workspaceId,
      lastSyncedAt: switched ? EPOCH : prev.lastSyncedAt,
      tombstones: switched ? [] : prev.tombstones,
      settingsDirty: false,
    });
    this.accessToken = accessToken;
    this.db = db;
    if (this.started) return;
    this.started = true;
    this.emit({ status: "connecting" });

    try {
      const base = await this.probe();
      await this.initialSync(base);
      this.pollTimer = setInterval(() => void this.poll(), POLL_MS);
      window.addEventListener("online", this.onOnline);
      document.addEventListener("visibilitychange", this.onVisible);
    } catch (err) {
      this.emit({
        status: "offline",
        mode: "unknown",
        error: err instanceof Error ? err.message : "unreachable",
      });
    }
  }

  stop() {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pushTimer = null;
    this.pollTimer = null;
    window.removeEventListener("online", this.onOnline);
    document.removeEventListener("visibilitychange", this.onVisible);
    this.started = false;
    this.accessToken = null;
    this.db = null;
    this.emit({ status: "offline", pendingPush: false, error: null });
  }

  private async initialSync(base: string) {
    this.emit({ status: "syncing" });
    const remote = await this.authenticatedJson<DbResponse>(base, `/db/${this.meta.workspaceId}`);

    if (!remote.found || !remote.db) {
      // Fresh server: upload what we have locally.
      await this.pushNow();
      return;
    }

    const serverUpdated = remote.updatedAt;

    const remoteDb = migrateDB(remote.db);

    if (this.meta.lastSyncedAt === EPOCH) {
      // First sync on this device: normally adopt the server document so a
      // device joining an existing workspace gets exactly its data.
      // SAFETY: if the local doc actually has business data newer than the
      // server stamp (e.g. sales made offline before first login), merge and
      // push instead of discarding them.
      const localNewest = this.db ? newestStamp(this.db) : EPOCH;
      if (this.db && localHasBusinessData(this.db) && localNewest > serverUpdated) {
        await this.pushNow();
        return;
      }
      this.db = remoteDb;
      saveDB(remoteDb);
      this.onReplace?.(remoteDb);
      this.setMeta({ lastSyncedAt: serverUpdated, settingsDirty: false });
      this.emit({ status: "synced", mode: remote.mode, lastSyncedAt: serverUpdated, error: null });
      return;
    }

    if (serverUpdated <= this.meta.lastSyncedAt) {
      // We already know about the server state; push anything newer locally.
      await this.pushNow();
      return;
    }

    const remoteTomb = new Map(remote.tombstones.map((t) => [t.id, t]));
    const local = this.db;
    if (local) {
      const merged = mergeDocs(local, remoteDb, remoteTomb, this.meta.settingsDirty);
      this.db = merged;
      saveDB(merged);
      this.onReplace?.(merged);
    }
    this.setMeta({ lastSyncedAt: serverUpdated, settingsDirty: false });
    this.emit({ status: "synced", mode: remote.mode, lastSyncedAt: serverUpdated, error: null });
  }

  /** Record a local mutation; diffs deletions and schedules a push. */
  recordChange(prev: DB, next: DB) {
    this.db = next;
    const removed = diffTombstones(prev, next);
    const tombstones = removed.length
      ? [...this.meta.tombstones.filter((t) => !removed.some((r) => r.id === t.id)), ...removed]
      : this.meta.tombstones;
    const settingsDirty = this.meta.settingsDirty || prev.settings !== next.settings;
    if (removed.length || prev.settings !== next.settings) this.setMeta({ tombstones, settingsDirty });

    this.emit({ pendingPush: true });
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => void this.pushNow(), PUSH_DEBOUNCE_MS);
  }

  async pushNow(): Promise<void> {
    if (!this.db) return;
    const base = this.meta.apiBase;
    if (!base) return;
    if (this.pushTimer) {
      clearTimeout(this.pushTimer);
      this.pushTimer = null;
    }
    this.emit({ status: "syncing" });
    try {
      const res = await this.authenticatedJson<{ updatedAt: string }>(base, `/db/${this.meta.workspaceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ db: this.db, tombstones: this.meta.tombstones }),
      });
      this.setMeta({ lastSyncedAt: res.updatedAt, settingsDirty: false });
      this.emit({ status: "synced", pendingPush: false, error: null });
    } catch (err) {
      this.emit({
        status: "error",
        error: err instanceof Error ? err.message : "push failed",
        pendingPush: true,
      });
    }
  }

  private async poll() {
    const base = this.meta.apiBase;
    if (!base || !this.db) return;
    try {
      const res = await this.authenticatedJson<SyncResponse>(
        base,
        `/sync/${this.meta.workspaceId}?since=${encodeURIComponent(this.meta.lastSyncedAt)}`,
      );
      this.emit({ mode: res.mode });
      if (!res.changed) {
        if (this.snapshot.status === "error") this.emit({ status: "synced", error: null });
        if (this.snapshot.pendingPush) await this.pushNow();
        return;
      }
      const remote = await this.authenticatedJson<DbResponse>(base, `/db/${this.meta.workspaceId}`);
      if (!remote.found || !remote.db) return;
      const tomb = new Map([...this.meta.tombstones, ...remote.tombstones].map((t) => [t.id, t]));
      const merged = mergeDocs(this.db, migrateDB(remote.db), tomb, this.meta.settingsDirty);
      this.db = merged;
      saveDB(merged);
      this.onReplace?.(merged);
      this.setMeta({ lastSyncedAt: remote.updatedAt });
      this.emit({ status: "synced", error: null });
    } catch (err) {
      this.emit({ status: "offline", error: err instanceof Error ? err.message : "poll failed" });
    }
  }

  async syncNow(): Promise<void> {
    if (this.snapshot.pendingPush) {
      await this.pushNow();
      await this.poll();
    } else {
      await this.poll();
      if (this.snapshot.pendingPush) await this.pushNow();
    }
  }

  private onOnline = () => void this.syncNow().catch(() => undefined);
  private onVisible = () => {
    if (document.visibilityState === "visible") void this.syncNow().catch(() => undefined);
  };
}

export const syncEngine = new SyncEngine();
