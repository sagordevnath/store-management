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
 * (products, sales, purchases, customers, suppliers, expenses, staff, settings)
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
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";

let supabase: SupabaseClient | null = null;
let backendMode: "supabase" | "file" = "file";

if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  backendMode = "supabase";
  console.log("[managix-server] storage: Supabase ->", SUPABASE_URL);
} else {
  console.log("[managix-server] storage: local JSON file (set SUPABASE_URL + key to use Supabase)");
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
  ensureFallbackLogged();
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

/**
 * If Supabase is configured but the schema hasn't been applied yet (e.g. the
 * workspaces table is missing), degrade to file storage instead of failing
 * every request with a 500. Logged once with the fix.
 */
let fallbackLogged = false;
function ensureFallbackLogged() {
  if (fallbackLogged) return;
  fallbackLogged = true;
  console.warn(
    "[managix-server] Supabase storage unavailable — falling back to file store. " +
      "Run supabase/schema.sql in your Supabase SQL editor, then restart `npm run server` to re-enable Supabase.",
  );
  backendMode = "file";
  supabase = null;
}

async function sbReadDoc(workspaceId: string): Promise<WorkspaceDoc | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(WORKSPACE_TABLE)
    .select("workspace_id, db, updated_at, tombstones")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) {
    if (/Could not find the table|schema cache|relation .* does not exist/i.test(error.message)) {
      ensureFallbackLogged();
      return readFileDoc(workspaceId);
    }
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
  if (!supabase) return;
  const row = {
    workspace_id: doc.workspaceId,
    db: doc.db,
    updated_at: doc.updatedAt,
    tombstones: doc.tombstones,
  };
  const { error } = await supabase.from(WORKSPACE_TABLE).upsert(row, { onConflict: "workspace_id" });
  if (error) {
    if (/Could not find the table|schema cache|relation .* does not exist/i.test(error.message)) {
      ensureFallbackLogged();
      writeFileDoc(doc);
      return;
    }
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
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// health
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true, mode: backendMode, time: new Date().toISOString() });
});

// pull full document
app.get("/api/db/:workspaceId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = String(req.params.workspaceId);
    const doc = supabase ? await sbReadDoc(workspaceId) : readFileDoc(workspaceId);
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
app.put("/api/db/:workspaceId", async (req: Request, res: Response, next: NextFunction) => {
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

    const current = supabase ? await sbReadDoc(workspaceId) : readFileDoc(workspaceId);
    const now = new Date().toISOString();

    // Client-based guard: if the server moved on after the client last saw it and
    // the client has no newer stamp, we still accept the push (offline-first, LWW)
    // but merge tombstones so deletions are not resurrected.
    const tombstones = normalizeTombstones(incomingTombstones ?? [], current?.tombstones ?? []);

    const doc: WorkspaceDoc = { workspaceId, db: incomingDb, updatedAt: now, tombstones };
    if (supabase) await sbWriteDoc(doc);
    else writeFileDoc(doc);

    res.json({ ok: true, updatedAt: now, mode: backendMode, tombstones });
  } catch (err) {
    next(err);
  }
});

// lightweight poll: did anything change since `since`?
app.get("/api/sync/:workspaceId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = String(req.params.workspaceId);
    const since = String(req.query.since as string) || EPOCH;
    const doc = supabase ? await sbReadDoc(workspaceId) : readFileDoc(workspaceId);
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

// error handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[managix-server] error:", err);
  const message = err instanceof Error ? err.message : "internal error";
  res.status(500).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`[managix-server] listening on http://localhost:${PORT} (mode: ${backendMode})`);
});
