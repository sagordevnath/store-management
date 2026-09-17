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
import { saveDB } from "./store";

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

function loadMeta(): SyncMeta {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (raw) {
      const m = JSON.parse(raw) as Partial<SyncMeta>;
      if (m.workspaceId) {
        return {
          workspaceId: m.workspaceId,
          lastSyncedAt: m.lastSyncedAt || EPOCH,
          tombstones: m.tombstones || [],
          settingsDirty: !!m.settingsDirty,
          apiBase: m.apiBase || null,
        };
      }
    }
  } catch {
    /* fall through */
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
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
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
  async start(db: DB) {
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

  private async initialSync(base: string) {
    this.emit({ status: "syncing" });
    const remote = await fetchJson<DbResponse>(base, `/db/${this.meta.workspaceId}`);

    if (!remote.found || !remote.db) {
      // Fresh server: upload what we have locally.
      await this.pushNow();
      return;
    }

    const serverUpdated = remote.updatedAt;

    if (this.meta.lastSyncedAt === EPOCH) {
      // First sync on this device: adopt the server document wholesale so a
      // device joining an existing workspace gets exactly its data (no duplicate
      // seed records). Offline-created data that was never pushed would be lost,
      // but by definition it was never synced anywhere.
      this.db = remote.db;
      saveDB(remote.db);
      this.onReplace?.(remote.db);
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
      const merged = mergeDocs(local, remote.db, remoteTomb, this.meta.settingsDirty);
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
      const res = await fetchJson<{ updatedAt: string }>(base, `/db/${this.meta.workspaceId}`, {
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
      const res = await fetchJson<SyncResponse>(
        base,
        `/sync/${this.meta.workspaceId}?since=${encodeURIComponent(this.meta.lastSyncedAt)}`,
      );
      this.emit({ mode: res.mode });
      if (!res.changed) {
        if (this.snapshot.status === "error") this.emit({ status: "synced", error: null });
        if (this.snapshot.pendingPush) await this.pushNow();
        return;
      }
      const remote = await fetchJson<DbResponse>(base, `/db/${this.meta.workspaceId}`);
      if (!remote.found || !remote.db) return;
      const tomb = new Map([...this.meta.tombstones, ...remote.tombstones].map((t) => [t.id, t]));
      const merged = mergeDocs(this.db, remote.db, tomb, this.meta.settingsDirty);
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
