# Managix — Run Doc

Vite + React + TypeScript + Tailwind business manager with an **Express REST sync
backend** (`server/index.ts`). Data lives in `localStorage` (key `Managix_db_v1`),
syncs through the backend, and persists server-side to either **Supabase Postgres**
(`supabase/schema.sql`) or a JSON file fallback (`server/data.json`).

## Reproduce artifacts

1. `npm install` — React 18, Vite 5, TypeScript, Tailwind, Express 5, `tsx`,
   `@supabase/supabase-js` (lockfile: `package-lock.json`). Already installed here.
2. Env files: none required. `.env.example` documents the optional Supabase config —
   copy it to `.env` only if you want Supabase storage; without it the server uses the
   JSON file store automatically. Never commit `.env`.
3. One-time Supabase setup (only if using Supabase): run `supabase/schema.sql` in the
   Supabase SQL editor, then fill `.env` with `SUPABASE_URL` + service role key.
   **Note:** if `.env` has Supabase credentials but the schema was never applied, the
   server logs a one-time warning ("Supabase storage unavailable — falling back to file
   store") and serves everything from `server/data.json` instead of erroring; re-run the
   SQL and restart to go back to Supabase mode.
4. Sanity checks: `npx tsc --noEmit` (covers `src/` and `server/`) or `npm run build`.

## Run the servers

Two processes are needed:

**1. API server (Express, port 8787)** — `npm run server` (`tsx server/index.ts`).
   Storage mode is logged at startup: `storage: local JSON file` or `storage: Supabase`.
   Note: the shell environment in this workspace can carry a junk `PORT=0`; the server
   now guards against that and falls back to 8787.

**2. Web app (Vite, port 5183)** — `npm run dev`. Fixed in `vite.config.ts` with
   `strictPort: true` and `host: true`; it proxies `/api/*` → `http://localhost:8787`
   so the browser talks to the API same-origin.

Windows detached start (PowerShell; stdout and stderr must go to different files):

```
powershell -NoProfile -Command "(Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','server' -RedirectStandardOutput '<log-api>' -RedirectStandardError '<log-api>.err' -WorkingDirectory '<project root>' -WindowStyle Hidden -PassThru).Id"
powershell -NoProfile -Command "(Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev' -RedirectStandardOutput '<log-web>' -RedirectStandardError '<log-web>.err' -WorkingDirectory '<project root>' -WindowStyle Hidden -PassThru).Id"
```

Caveat: these calls can hang the invoking shell even though the process starts (npm.cmd
keeps a handle open). Check whether the ports are already listening before retrying:

```
netstat -ano | grep ":8787" | grep LISTENING   # API
netstat -ano | grep ":5183" | grep LISTENING   # web
```

Ready when:
- API log shows `listening on http://localhost:8787` and
  `curl http://127.0.0.1:8787/api/health` returns `{"ok":true,...}`.
- Web log shows `VITE ready` and `curl http://127.0.0.1:5183/api/health` also returns
  the same JSON (proves the proxy works).

## Sync behavior (what to expect)

- Top bar has a sync pill: `Synced · HH:MM`, `Syncing…`, or `Offline · saved locally`
  (click it to force a sync). Workspace is `default` for all devices; per-workspace id
  can be set via `localStorage.Managix_sync_meta_v1`.
- First connect on a device **adopts the server document wholesale** (devices joining
  an existing workspace don't duplicate seed data). A fresh empty server gets pushed
  the local document.
- Local edits push after a 1 s debounce; the app polls for remote changes every 6 s;
  visibility-change and `online` events trigger an immediate sync. Deletions are
  tombstoned so last-writer-wins merges don't resurrect deleted records.
- Sign-in is demo-only (pre-filled credentials); the session lives in `sessionStorage`,
  so a reload returns to the login screen.
- Reset demo data: clear localStorage (`Managix_db_v1`, `Managix_sync_meta_v1`) and
  reload; to wipe the server copy too, delete `server/data.json` (file mode) or the
  workspace row in Supabase.

## Phase-2 demo notes

- **Subscription:** the seeded shop starts on a 14-day trial with all Pro features.
  Billing page has mock bKash/Nagad/Card checkout, coupons (`LAUNCH25`, `SHOP10`,
  `YEARLY50`), auto-renew, and invoice history. When a plan lapses, premium modules
  show a locked card with a "Go to Billing" action; grace period (`past_due`) keeps
  access for 7 days.
- **Super admin panel:** open `http://127.0.0.1:5183/#superadmin` — passcode `246810`
  (5 wrong attempts → 60 s lockout). Subscribers are a device-local demo registry
  (`Managix_registry_v1`), separate from shop data.
- **Legacy data migration:** a Phase-1 `Managix_db_v1` document (no
  subscription/categories) is auto-migrated on load — old string categories are mapped
  onto the new category tree, nothing is lost.
- Voice entry and e-signature need a browser with Web Speech / pointer support; the
  GPS delivery tracking is a simulation (tap "Advance driver position").

## Phase-6 growth suite notes

- **New pages:** `#storefront` (share link, theme editor, order pipeline), `#wallet`
  (balances, money in/out with auto cash-out fees, invoice Payment-QR), `#messages`
  (due reminders SMS/WhatsApp/call-log, chat threads, bulk campaigns, ad-account fields),
  `#access` (accounts, per-module permission matrix, filterable audit log + CSV),
  `#recycle` (30-day soft-delete bin).
- **Public storefront:** open `http://127.0.0.1:5183/#shop/bright-leaf` in any browser —
  no sign-in. Orders land in `storefrontOrders`; **Accept → invoice** creates a real
  sale (stock reduced, `INV-####`) via `acceptStorefrontOrder`.
- **Deletes are soft now:** products/customers/suppliers/expenses go to the bin
  (`softDelete`), restorable for 30 days; every action is stamped into `db.audit`
  (who/what/when) and viewable under Team & Access → Audit log.
- **QR codes** are generated by the `qrcode` npm package (ECC M) — verified decodable
  with jsQR. Old local documents auto-migrate; if a migrated wallet looks empty,
  delete `Managix_db_v1` (+ `Managix_sync_meta_v1`) and reload to reseed.
- **Onboarding:** first-run modal offers 5 business presets (grocery/pharmacy/
  electronics/fashion/wholesale) that prefill categories + starter products;
  dismissal is remembered in `Managix_onboarding_dismissed`.
- **Barcode scan** in POS: camera scan via Barcode Detection API with manual-entry
  fallback; USB laser scanners also work by typing into the search box + Enter.
