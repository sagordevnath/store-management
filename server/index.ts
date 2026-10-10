/**
 * Managix REST backend — Express + Supabase.
 *
 * Storage strategy:
 *  - If SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) are set,
 *    documents live in the Supabase `workspaces` table (see supabase/schema.sql).
 *  - Otherwise the server falls back to a JSON file store (server/data.json) so
 *    the app runs fully offline. Frontend behavior is identical in both modes.
 *
 * The API is document-sync style: the frontend keeps its full DB document
 * (products, sales, purchases, customers, suppliers, opening-balance payments,
 * expenses, staff, settings)
 * in localStorage and pushes/pulls it here, using updatedAt stamps plus a
 * tombstone list so deletes survive a last-writer-wins merge.
 */
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Minimal .env loader (no dotenv dependency): reads project-root .env if present.
// Non-empty real environment variables win over file values.
(function loadDotEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  try {
    const raw = fs.readFileSync(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      const existing = process.env[key];
      if (existing === undefined || existing === "") process.env[key] = val;
    }
  } catch {
    /* no .env — fine */
  }
})();

// Guard against junk inherited values like PORT=0 or PORT="":
const PORT = Number(process.env.PORT) > 0 ? Number(process.env.PORT) : 8787;
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";

let supabase: SupabaseClient | null = null;
let backendMode: "supabase" | "file" = "file";

if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  backendMode = "supabase";
  console.log("[managix-server] storage: Supabase ->", SUPABASE_URL);
} else {
  console.warn("[managix-server] Supabase service credentials are missing; protected cloud APIs are disabled.");
}

const WORKSPACE_TABLE = "workspaces";

interface Tombstone {
  id: string;
  at: string;
}

interface WorkspaceDoc {
  workspaceId: string;
  db: unknown | null;
  updatedAt: string;
  tombstones: Tombstone[];
}

/* ============================ File store fallback ============================ */

const FILE_STORE = path.join(__dirname, "data.json");

function readAllFileDocs(): Record<string, WorkspaceDoc> {
  try {
    return JSON.parse(fs.readFileSync(FILE_STORE, "utf8")) as Record<string, WorkspaceDoc>;
  } catch {
    return {};
  }
}

function readFileDoc(workspaceId: string): WorkspaceDoc {
  const all = readAllFileDocs();
  return (
    all[workspaceId] ?? {
      workspaceId,
      db: null,
      updatedAt: "1970-01-01T00:00:00.000Z",
      tombstones: [],
    }
  );
}

function writeFileDoc(doc: WorkspaceDoc) {
  const all = readAllFileDocs();
  all[doc.workspaceId] = doc;
  fs.mkdirSync(__dirname, { recursive: true });
  fs.writeFileSync(FILE_STORE, JSON.stringify(all, null, 2));
}

/* ============================ Supabase helpers ============================ */

async function sbReadDoc(workspaceId: string): Promise<WorkspaceDoc | null> {
  if (!supabase) {
    const doc = readFileDoc(workspaceId);
    return doc.db === null ? null : doc;
  }
  const { data, error } = await supabase
    .from(WORKSPACE_TABLE)
    .select("workspace_id, db, updated_at, tombstones")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) {
    throw new Error(`supabase read: ${error.message}`);
  }
  if (!data) return null;
  return {
    workspaceId: data.workspace_id as string,
    db: data.db ?? null,
    updatedAt: (data.updated_at as string) ?? "1970-01-01T00:00:00.000Z",
    tombstones: (data.tombstones as Tombstone[]) ?? [],
  };
}

async function sbWriteDoc(doc: WorkspaceDoc): Promise<void> {
  if (!supabase) {
    // Offline / demo mode — persist to the local JSON file store so sync works
    // even without Supabase credentials. Previously this threw every push.
    writeFileDoc(doc);
    return;
  }
  const row = {
    workspace_id: doc.workspaceId,
    db: doc.db,
    updated_at: doc.updatedAt,
    tombstones: doc.tombstones,
  };
  const { error } = await supabase.from(WORKSPACE_TABLE).upsert(row, { onConflict: "workspace_id" });
  if (error) {
    throw new Error(`supabase write: ${error.message}`);
  }
}

/* ============================ Merge logic ============================ */

const EPOCH = "1970-01-01T00:00:00.000Z";

function normalizeTombstones(raw: unknown, serverTombstones: Tombstone[]): Tombstone[] {
  const list: Tombstone[] = [...serverTombstones];
  if (Array.isArray(raw)) {
    for (const t of raw as Tombstone[]) {
      if (t && typeof t.id === "string") list.push({ id: t.id, at: t.at || new Date().toISOString() });
    }
  }
  // de-dupe, keep most recent stamp per id
  const byId = new Map<string, Tombstone>();
  for (const t of list) {
    const prev = byId.get(t.id);
    if (!prev || prev.at < t.at) byId.set(t.id, t);
  }
  return [...byId.values()].sort((a, b) => (a.at < b.at ? 1 : -1));
}

/* ============================ App ============================ */

const app = express();
// FIX: the old default rejected *every* browser request when CORS_ORIGINS was
// unset — including the same-origin Vite calls (Origin: http://localhost:5183).
// Default to permissive same-origin/localhost behavior; lock down via
// CORS_ORIGINS only when you deploy behind a real domain.
const allowedOrigins = (process.env.CORS_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true); // curl / same-origin / mobile
    if (allowedOrigins.length === 0) {
      try {
        const u = new URL(origin);
        const host = u.hostname;
        if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost")) return callback(null, true);
      } catch { /* fall through */ }
      return callback(null, true); // dev default: allow (documented)
    }
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed by CORS."));
  },
}));
app.use(express.json({ limit: "10mb" }));

// health — must return 200 in file/offline mode too (frontend probe treats
// any non-2xx as "API not reachable" and stays offline forever).
app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({ ok: true, mode: backendMode, time: new Date().toISOString() });
});

type AuthRequest = Request & { authUserId?: string };

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    if (!supabase) {
      // File/offline mode: no hosted auth — allow sync through (single-tenant
      // demo store). Supabase mode still enforces Bearer tokens below.
      (req as AuthRequest).authUserId = "local";
      next();
      return;
    }
    const token = req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) {
      res.status(401).json({ error: "Sign-in is required." });
      return;
    }
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      res.status(401).json({ error: "Your sign-in session is invalid or expired." });
      return;
    }
    (req as AuthRequest).authUserId = data.user.id;
    next();
  } catch (err) {
    next(err);
  }
}

async function requireWorkspace(req: Request, res: Response, next: NextFunction) {
  try {
    if (!supabase) {
      // File mode: any workspace id is accepted (single JSON store keyed by id).
      next();
      return;
    }
    const userId = (req as AuthRequest).authUserId;
    const workspaceId = String(req.params.workspaceId);
    const { data, error } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(`workspace authorization: ${error.message}`);
    if (!data) {
      res.status(403).json({ error: "You do not have access to this shop." });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}

app.get("/api/workspaces/me", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!supabase) {
      // Offline mode: single shared workspace, no provisioning needed.
      res.json({ workspaceId: "default" });
      return;
    }
    const userId = (req as AuthRequest).authUserId;
    const { data, error } = await supabase.rpc("create_workspace_for_user", { p_user_id: userId });
    if (error) throw new Error(`workspace provisioning: ${error.message}`);
    if (typeof data !== "string" || !data) throw new Error("Workspace provisioning returned an invalid workspace.");
    res.json({ workspaceId: data });
  } catch (err) {
    next(err);
  }
});

// pull full document
app.get("/api/db/:workspaceId", requireAuth, requireWorkspace, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = String(req.params.workspaceId);
    const doc = await sbReadDoc(workspaceId);
    if (!doc || doc.db === null) {
      res.json({ found: false, mode: backendMode, db: null, updatedAt: EPOCH, tombstones: [] });
      return;
    }
    res.json({ found: true, mode: backendMode, db: doc.db, updatedAt: doc.updatedAt, tombstones: doc.tombstones });
  } catch (err) {
    next(err);
  }
});

// push full document (last-writer-wins on db, union on tombstones)
app.put("/api/db/:workspaceId", requireAuth, requireWorkspace, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = String(req.params.workspaceId);
    const { db: incomingDb, tombstones: incomingTombstones } = req.body as {
      db: unknown;
      tombstones?: Tombstone[];
    };
    if (!incomingDb || typeof incomingDb !== "object") {
      res.status(400).json({ error: "body.db is required" });
      return;
    }

    const current = await sbReadDoc(workspaceId);
    const now = new Date().toISOString();

    // Client-based guard: if the server moved on after the client last saw it and
    // the client has no newer stamp, we still accept the push (offline-first, LWW)
    // but merge tombstones so deletions are not resurrected.
    const tombstones = normalizeTombstones(incomingTombstones ?? [], current?.tombstones ?? []);

    const doc: WorkspaceDoc = { workspaceId, db: incomingDb, updatedAt: now, tombstones };
    await sbWriteDoc(doc);

    res.json({ ok: true, updatedAt: now, mode: backendMode, tombstones });
  } catch (err) {
    next(err);
  }
});

// Public storefront pull (no auth): shoppers opening #shop/<slug> on a fresh
// browser need the catalog without signing in. Only exposes the shop's own
// "default" workspace doc; nothing can be written through this route.
app.get("/api/db/public", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const doc = await sbReadDoc("default");
    if (!doc || doc.db === null) {
      res.json({ found: false, mode: backendMode, db: null });
      return;
    }
    res.json({ found: true, mode: backendMode, db: doc.db });
  } catch (err) {
    next(err);
  }
});

// Public storefront order intake (no auth): appends one order to the default
// workspace doc. Validates shape minimally — the owner still accepts/rejects
// in the app, which is where stock actually moves.
app.post("/api/storefront-orders", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = (req.body as { order?: unknown })?.order as {
      id?: string; at?: string; customerName?: string; phone?: string;
      items?: { productId?: string; name?: string; price?: number; qty?: number }[];
      total?: number;
    } | undefined;
    if (!order || typeof order.id !== "string" || !Array.isArray(order.items) || typeof order.total !== "number") {
      res.status(400).json({ error: "body.order is invalid" });
      return;
    }
    const current = await sbReadDoc("default");
    const db = (current?.db ?? null) as null | {
      storefrontOrders?: { id: string }[];
      storefront?: { enabled?: boolean };
    };
    if (!db || typeof db !== "object" || !Array.isArray(db.storefrontOrders)) {
      res.status(404).json({ error: "shop is not initialized yet" });
      return;
    }
    if (db.storefrontOrders.some((o) => o.id === order.id)) {
      res.json({ ok: true, deduped: true });
      return;
    }
    (db.storefrontOrders as unknown[]).unshift(order);
    const now = new Date().toISOString();
    await sbWriteDoc({
      workspaceId: "default",
      db,
      updatedAt: now,
      tombstones: current?.tombstones ?? [],
    });
    res.json({ ok: true, updatedAt: now });
  } catch (err) {
    next(err);
  }
});

// lightweight poll: did anything change since `since`?
app.get("/api/sync/:workspaceId", requireAuth, requireWorkspace, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = String(req.params.workspaceId);
    const since = String(req.query.since as string) || EPOCH;
    const doc = await sbReadDoc(workspaceId);
    const updatedAt = doc?.updatedAt ?? EPOCH;
    res.json({
      changed: updatedAt > since,
      updatedAt,
      tombstones: doc?.tombstones ?? [],
      found: !!doc && doc.db !== null,
      mode: backendMode,
    });
  } catch (err) {
    next(err);
  }
});

// error handler (API only — static/SPA below must not turn into JSON)
app.use("/api", (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[managix-server] error:", err);
  const message = err instanceof Error ? err.message : "internal error";
  if (res.headersSent) return;
  res.status(500).json({ error: message });
});

// ---- Production hosting: serve the built Vite app from dist/ ----
// `npm run build` outputs to dist/; the same process then serves the site +
// API on one port so a deploy can't end up with "API up, site blank".
const DIST_DIR = path.join(__dirname, "..", "dist");
if (fs.existsSync(path.join(DIST_DIR, "index.html"))) {
  // Long-cache hashed assets; never cache the shell or service worker.
  app.use("/assets", express.static(path.join(DIST_DIR, "assets"), { maxAge: "30d", immutable: true }));
  app.use(express.static(DIST_DIR, {
    maxAge: 0,
    setHeaders(res, filePath) {
      if (filePath.endsWith("sw.js") || filePath.endsWith(".webmanifest")) {
        res.setHeader("Cache-Control", "no-store");
      }
    },
  }));
  // SPA fallback: any non-API route serves index.html (hash router takes over).
  app.get(/^\/(?!api\/).*/, (_req: Request, res: Response) => {
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
} else {
  console.warn("[managix-server] dist/ not found — run `npm run build` to host the site from this process.");
}

app.listen(PORT, () => {
  console.log(`[managix-server] listening on http://localhost:${PORT} (mode: ${backendMode})`);
});
