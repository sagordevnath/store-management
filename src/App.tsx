import React, { useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Session } from "@supabase/supabase-js";
import type { DB } from "./types";
import { createShopDB, loadDBIfPresent, saveDB, resetDB, setDBStorageScope, computeKpis } from "./lib/store";
import { syncEngine, type SyncSnapshot } from "./lib/sync";
import { tickSubscriptions, daysLeft } from "./lib/billing";
import { planName, subStateSummary, hasFeature } from "./lib/plans";
import { fmtMoney, initials, classNames } from "./lib/helpers";
import { getStoredLang, storeLang, makeT, langInfo, type Lang, type TFn } from "./lib/i18n";
import { LanguageMenu } from "./LanguageMenu";
import { Badge, Button, Card, Modal, ToastProvider, useDarkMode, useToast } from "./ui";
import {
  IcDashboard, IcCart, IcBox, IcSale, IcTruck, IcUsers, IcBuilding, IcWallet,
  IcChart, IcStaff, IcSettings, IcSearch, IcLogout, IcStore, IcAlert,
  IcCategories, IcCrown, IcTools, IcRefresh, IcCash, IcGlobe, IcChat, IcShield,
  IcTrashRestore,
} from "./icons";
import DashboardPage from "./pages/DashboardPage";
import PosPage from "./pages/PosPage";
import ProductsPage from "./pages/ProductsPage";
import SalesPage from "./pages/SalesPage";
import PurchasesPage from "./pages/PurchasesPage";
import CustomersPage from "./pages/CustomersPage";
import SuppliersPage from "./pages/SuppliersPage";
import ExpensesPage from "./pages/ExpensesPage";
import ReportsPage from "./pages/ReportsPage";
import StaffPage from "./pages/StaffPage";
import SettingsPage from "./pages/SettingsPage";
import CategoriesPage from "./pages/CategoriesPage";
import BillingPage from "./pages/BillingPage";
import ToolsPage from "./pages/ToolsPage";
import ReturnsPage from "./pages/ReturnsPage";
import DueBookPage from "./pages/DueBookPage";
import StorefrontPage from "./pages/StorefrontPage";
import WalletPage from "./pages/WalletPage";
import MessagesPage from "./pages/MessagesPage";
import AccessPage from "./pages/AccessPage";
import RecyclePage from "./pages/RecyclePage";
import SuperAdminPage from "./pages/SuperAdminPage";
import SupportChat from "./pages/SupportChat";
import { StorefrontPublic } from "./pages/StorefrontPublic";
import { LoginPage } from "./pages/LoginPage";
import { supabase } from "./lib/supabase";

export type PageKey =
  | "dashboard" | "pos" | "products" | "categories" | "sales" | "purchases"
  | "customers" | "suppliers" | "expenses" | "reports" | "staff" | "settings"
  | "billing" | "tools" | "returns" | "dueBook"
  | "storefront" | "wallet" | "messages" | "access" | "recycle";

const NAV: { key: PageKey; label: string; icon: (p: { size?: number; className?: string }) => React.ReactNode; group: string }[] = [
  { key: "dashboard", label: "nav.dashboard", icon: IcDashboard, group: "group.overview" },
  { key: "pos", label: "nav.pos", icon: IcCart, group: "group.daily" },
  { key: "sales", label: "nav.sales", icon: IcSale, group: "group.daily" },
  { key: "purchases", label: "nav.purchases", icon: IcTruck, group: "group.daily" },
  { key: "returns", label: "nav.returns", icon: IcRefresh, group: "group.daily" },
  { key: "products", label: "nav.products", icon: IcBox, group: "group.catalog" },
  { key: "categories", label: "nav.categories", icon: IcCategories, group: "group.catalog" },
  { key: "customers", label: "nav.customers", icon: IcUsers, group: "group.people" },
  { key: "suppliers", label: "nav.suppliers", icon: IcBuilding, group: "group.people" },
  { key: "staff", label: "nav.staff", icon: IcStaff, group: "group.people" },
  { key: "expenses", label: "nav.expenses", icon: IcWallet, group: "group.finance" },
  { key: "dueBook", label: "nav.dueBook", icon: IcCash, group: "group.finance" },
  { key: "reports", label: "nav.reports", icon: IcChart, group: "group.finance" },
  { key: "tools", label: "nav.tools", icon: IcTools, group: "group.finance" },
  { key: "storefront", label: "nav.storefront", icon: IcGlobe, group: "group.growth" },
  { key: "wallet", label: "nav.wallet", icon: IcWallet, group: "group.growth" },
  { key: "messages", label: "nav.messages", icon: IcChat, group: "group.growth" },
  { key: "access", label: "nav.access", icon: IcShield, group: "group.account" },
  { key: "recycle", label: "nav.recycle", icon: IcTrashRestore, group: "group.account" },
  { key: "billing", label: "nav.billing", icon: IcCrown, group: "group.account" },
  { key: "settings", label: "nav.settings", icon: IcSettings, group: "group.account" },
];

const NAV_GROUPS = ["group.overview", "group.daily", "group.catalog", "group.people", "group.finance", "group.growth", "group.account"];

export interface Ctx {
  db: DB;
  setDB: (db: DB) => void;
  update: (fn: (db: DB) => DB) => void;
  navigate: (p: PageKey) => void;
  currency: string;
  sync: SyncSnapshot;
  lang: Lang;
  setLang: (l: Lang) => void;
  t: TFn;
}

const CtxReact = React.createContext<Ctx | null>(null);
export function useApp(): Ctx {
  const c = useContext(CtxReact);
  if (!c) throw new Error("useApp outside provider");
  return c;
}

export default function App() {
  return (
    <BootErrorBoundary>
      <AppInner />
    </BootErrorBoundary>
  );
}

/** Last-resort safety net: any boot/render crash shows recovery UI, never a blank page. */
class BootErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(err: unknown) {
    return { error: err instanceof Error ? err.message : "Something went wrong starting the app." };
  }
  componentDidCatch() { /* keep the recovery screen; details already captured */ }
  render() {
    if (!this.state.error) return this.props.children;
    const reset = () => {
      try {
        // Quarantine every Managix key, keep a timestamped backup of the main DB.
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.startsWith("Managix_")) {
            if (k.startsWith("Managix_db_v1")) {
              try {
                const raw = localStorage.getItem(k);
                if (raw) localStorage.setItem(`${k}.corrupt.${Date.now()}`, raw);
              } catch { /* ignore */ }
            }
            localStorage.removeItem(k);
          }
        }
      } catch { /* ignore */ }
      window.location.hash = "";
      window.location.reload();
    };
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 px-6">
        <div className="w-full max-w-md rounded-2xl border border-ink-200 bg-white p-8 text-center shadow-card">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-2xl">⚠️</div>
          <h1 className="text-lg font-bold text-ink-900">Managix couldn't start</h1>
          <p className="mt-2 text-sm text-ink-500">
            Your saved data looks corrupted (often after a failed deploy or full storage). Your data is backed up in this
            browser — resetting loads a fresh demo so you can keep working.
          </p>
          <p className="mt-2 rounded-lg bg-ink-50 px-3 py-2 text-left text-xs text-ink-400">{this.state.error}</p>
          <div className="mt-4 flex gap-2">
            <Button className="flex-1" onClick={() => window.location.reload()}>Try again</Button>
            <Button variant="secondary" className="flex-1" onClick={reset}>Reset to fresh demo</Button>
          </div>
        </div>
      </div>
    );
  }
}

function AppInner() {
  // Seed data builds a large demo document — build it lazily so a slow device
  // still paints the loading screen instead of blocking on first paint.
  // If even the seed fails (out of memory), boot with a minimal empty shell.
  const [db, setDb] = useState<DB>(() => {
    try {
      return createShopDB("");
    } catch {
      // Absolute last resort: minimal shell so the app can still render.
      return {
        products: [], categories: [], sales: [], purchases: [], customers: [],
        suppliers: [], duePayments: [], expenses: [], staff: [], subInvoices: [],
        saleReturns: [], purchaseReturns: [], branches: [], accounts: [], audit: [],
        trash: [], wallet: [], walletAccounts: [], threads: [], reminders: [],
        campaigns: [], storefrontOrders: [],
        subscription: { tier: "trial", status: "trialing", billingCycle: "monthly", startedAt: new Date().toISOString(), currentPeriodEnd: new Date(Date.now() + 14 * 86400000).toISOString(), autoRenew: false, paymentMethod: null, couponCode: null, couponRedeemsLeft: 0, canceledAt: null },
        settings: { shopName: "", tagline: "", currency: "$", taxRate: 0, lowStockDefault: 5, ownerName: "", monthlyTarget: 0, branches: 1, loyaltyEnabled: false, loyaltyRate: 1, pointValue: 1 },
        storefront: { enabled: false, slug: "", customDomain: "", theme: { accent: "#1f6a4c", hero: "", banner: null, font: "modern" }, visibleCategoryIds: null, minOrder: 0, deliveryFee: 0 },
        onboarding: null,
      } as DB;
    }
  });
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [lang, setLangState] = useState<Lang>(getStoredLang);
  const t = useMemo(() => makeT(lang), [lang]);
  const setLang = (l: Lang) => {
    setLangState(l);
    storeLang(l);
  };

  // Document language + text direction (Arabic flips to RTL).
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = langInfo(lang).dir;
  }, [lang]);
  // Special routes that bypass the app shell: public storefront + super-admin.
  const [route, setRoute] = useState(() => window.location.hash);
  useEffect(() => {
    const onRoute = () => setRoute(window.location.hash);
    window.addEventListener("hashchange", onRoute);
    return () => window.removeEventListener("hashchange", onRoute);
  }, []);
  const shopSlug = route.startsWith("#shop/") ? decodeURIComponent(route.slice("#shop/".length)) : null;
  const isSuperAdmin = route === "#superadmin";
  const [page, setPage] = useState<PageKey>(() => {
    const h = window.location.hash.replace("#", "");
    return (NAV.some((n) => n.key === h) ? h : "dashboard") as PageKey;
  });
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!supabase) {
      // No hosted auth configured (file/offline mode): boot straight into a
      // local workspace instead of stranding the user on a dead login form.
      // Previously this showed LoginPage with a permanent "not configured"
      // error and no way forward — the #1 blank-wall report.
      setDBStorageScope(null);
      const local = loadDBIfPresent() ?? createShopDB("My Store");
      saveDB(local);
      setDb(local);
      setWorkspaceReady(true);
      setAuthReady(true);
      setAuthError("");
      void syncEngine.start(local, "default", async () => null).catch(() => undefined);
      return;
    }
    let active = true;
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_OUT") setRecovery(false);
      setSession(nextSession);
      setAuthReady(true);
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setAuthError(error.message);
      setSession(data.session);
      setAuthReady(true);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
      syncEngine.stop();
    };
  }, []);

  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!authReady) return;
    // Offline / file mode (no hosted Supabase auth): the boot effect above
    // already loaded a local workspace and started the sync engine. Running
    // this effect in that mode would stop sync, blank the DB back to an empty
    // createShopDB("") and strand the user on the login screen — the exact
    // "blank wall" the offline boot branch exists to prevent. Leave offline
    // mode entirely to the boot effect above.
    if (!supabase) return;
    const authClient = supabase;
    let active = true;
    if (!session) {
      syncEngine.stop();
      setWorkspaceReady(false);
      setDBStorageScope(null);
      setDb(createShopDB(""));
      return () => { active = false; };
    }

    setWorkspaceReady(false);
    setAuthError("");
    syncEngine.onReplace = (next) => {
      if (active) setDb(next);
    };

    void (async () => {
      let cachedWorkspaceId: string | null = null;
      try {
        cachedWorkspaceId = localStorage.getItem(`Managix_workspace_${session.user.id}`);
      } catch { /* blocked storage — no cache, keep going online */ }
      let workspaceId: string | null = null;
      try {
        const { data } = await authClient.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error("Your sign-in session has expired. Please sign in again.");
        const response = await fetch("/api/workspaces/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          const body = await response.text();
          throw new Error(`Workspace setup failed (${response.status}): ${body.slice(0, 180)}`);
        }
        const result = await response.json() as { workspaceId?: string };
        if (!result.workspaceId) throw new Error("Workspace setup returned an invalid response.");
        workspaceId = result.workspaceId;
        try {
          localStorage.setItem(`Managix_workspace_${session.user.id}`, workspaceId);
        } catch { /* ignore */ }
      } catch (error) {
        if (cachedWorkspaceId && error instanceof TypeError) {
          workspaceId = cachedWorkspaceId;
        } else {
          throw error;
        }
      }

      if (!active || !workspaceId) return;
      setDBStorageScope(workspaceId);
      const shopName = String(session.user.user_metadata?.shop_name || "My Store");
      const initialDB = loadDBIfPresent() ?? createShopDB(shopName);
      saveDB(initialDB);
      setDb(initialDB);
      setWorkspaceReady(true);
      await syncEngine.start(initialDB, workspaceId, async () => {
        const { data } = await authClient.auth.getSession();
        return data.session?.access_token ?? null;
      });
    })().catch((error: unknown) => {
      if (active) {
        setAuthError(error instanceof Error ? error.message : "Unable to open this shop.");
        setWorkspaceReady(false);
      }
    });

    return () => {
      active = false;
      syncEngine.stop();
    };
  }, [authReady, userId]);

  const sync = useSyncExternalStore(syncEngine.subscribe, syncEngine.getSnapshot);

  useEffect(() => {
    if (window.location.hash !== `#${page}`) {
      // Don't clobber special routes (#shop/*, #superadmin) — they're handled
      // by the early returns above. Overwriting them bounced public visitors
      // straight back to the login screen.
      const h = window.location.hash;
      if (h.startsWith("#shop/") || h === "#superadmin") return;
      window.location.hash = page;
    }
  }, [page]);

  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace("#", "");
      if (h.startsWith("shop/")) return; // public route — leave it alone
      if (h === "superadmin") return; // admin route — leave it alone
      if (NAV.some((n) => n.key === h)) setPage(h as PageKey);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const update = (fn: (db: DB) => DB) => {
    setDb((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      saveDB(next);
      syncEngine.recordChange(prev, next);
      return next;
    });
  };

  useEffect(() => {
    if (!session) return;
    const ticked = tickSubscriptions(db);
    if (ticked === db) return;
    setDb(ticked);
    saveDB(ticked);
    syncEngine.recordChange(db, ticked);
  }, [db, session]);

  const ctx: Ctx = { db, setDB: setDb, update, navigate: setPage, currency: db.settings.currency, sync, lang, setLang, t };

  // Public storefront needs the shared DB but no login: load the default
  // workspace document directly from localStorage (seeded demo if empty).
  if (shopSlug) {
    return (
      <CtxReact.Provider value={ctx}>
        <PublicShopLoader slug={shopSlug} />
      </CtxReact.Provider>
    );
  }
  if (isSuperAdmin) {
    return (
      <CtxReact.Provider value={ctx}>
        <SuperAdminPage />
      </CtxReact.Provider>
    );
  }

  const offlineReady = !supabase && workspaceReady;

  return (
    <CtxReact.Provider value={ctx}>
      {!authReady || (session && !workspaceReady) ? (
        session ? (
          <div className="flex min-h-full items-center justify-center p-8 text-sm text-ink-500">
            {authError || "Opening your secure shop…"}
            {authError ? (
              <Button className="ml-3" variant="secondary" onClick={() => void supabase?.auth.signOut()}>Sign out</Button>
            ) : null}
          </div>
        ) : <div className="flex min-h-full items-center justify-center text-sm text-ink-500">Loading…</div>
      ) : !session && !offlineReady ? (
        <LoginPage
          onLogin={() => undefined}
          shopName={db.settings.shopName}
          authError={authError || undefined}
          recovery={recovery}
        />
      ) : (
        <Shell
          db={db}
          page={page}
          onNavigate={setPage}
          onLogout={() => { void supabase?.auth.signOut(); }}
          query={query}
          setQuery={setQuery}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          update={update}
          sync={sync}
          onReset={(fresh) => {
            setDb(fresh);
            syncEngine.recordChange(db, fresh);
          }}
        />
      )}
    </CtxReact.Provider>
  );
}

function Shell({
  db, page, onNavigate, onLogout, query, setQuery, sidebarOpen, setSidebarOpen, update, sync, onReset,
}: {
  db: DB;
  page: PageKey;
  onNavigate: (p: PageKey) => void;
  onLogout: () => void;
  query: string;
  setQuery: (q: string) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (b: boolean) => void;
  update: (fn: (db: DB) => DB) => void;
  sync: SyncSnapshot;
  onReset: (db: DB) => void;
}) {
  const kpis = useMemo(() => computeKpis(db), [db]);
  const [dark, toggleDark] = useDarkMode();
  const [chatOpen, setChatOpen] = useState(false);
  const toast = useToast();
  const { t } = useApp();
  const sub = db.subscription;
  const subState = subStateSummary(sub);

  const lowStock = db.products.filter((p) => p.stock <= p.lowStockAt);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const prod = db.products.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)).slice(0, 4)
      .map((p) => ({ label: p.name, sub: `Product · ${p.sku}`, page: "products" as PageKey }));
    const cats = db.categories.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 2)
      .map((c) => ({ label: c.name, sub: "Category", page: "categories" as PageKey }));
    const cust = db.customers.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q)).slice(0, 3)
      .map((c) => ({ label: c.name, sub: "Customer", page: "customers" as PageKey }));
    const sales = db.sales.filter((s) => s.invoiceNo.toLowerCase().includes(q)).slice(0, 3)
      .map((s) => ({ label: s.invoiceNo, sub: "Invoice", page: "sales" as PageKey }));
    return [...prod, ...cats, ...cust, ...sales];
  }, [query, db]);

  // One-time banner: show until dismissed (per device) and while relevant.
  const [bannerClosed, setBannerClosed] = useState(() => sessionStorage.getItem("Managix_sub_banner") === "1");
  const showBanner = !bannerClosed && (sub.status === "trialing" || sub.status === "past_due" || sub.status === "expired" || sub.status === "canceled");

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className={classNamesSidebar(sidebarOpen)}>
        <div className="flex h-16 items-center gap-2.5 border-b border-white/10 px-5">
          {db.settings.logo ? (
            <img src={db.settings.logo} alt="Logo" className="h-9 w-9 shrink-0 rounded-xl object-cover shadow-lg" />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500 shadow-lg shadow-brand-500/30">
              <IcStore size={18} className="text-white" />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">{db.settings.shopName}</p>
            <p className="truncate text-[11px] text-white/50">{db.settings.tagline}</p>
          </div>
        </div>
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group}>
              <p className="mb-1.5 px-2.5 text-[10px] font-bold uppercase tracking-widest text-white/35">{t(group)}</p>
              <div className="space-y-0.5">
                {NAV.filter((n) => n.group === group).map((n) => (
                  <button
                    key={n.key}
                    onClick={() => { onNavigate(n.key); setSidebarOpen(false); }}
                    className={classNames(
                      "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
                      page === n.key ? "bg-brand-500/90 text-white font-medium shadow" : "text-white/60 hover:bg-white/10 hover:text-white",
                    )}
                  >
                    {n.icon({ size: 17 })}
                    <span>{t(n.label)}</span>
                    {n.key === "products" && kpis.lowStockCount > 0 ? (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400/90 px-1.5 text-[10px] font-bold text-ink-900">
                        {kpis.lowStockCount}
                        <span className="sr-only">low stock items</span>
                      </span>
                    ) : null}
                    {n.key === "billing" ? (
                      <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-white/45">
                        {planName(sub)}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            {db.settings.ownerImage ? (
              <img
                src={db.settings.ownerImage}
                alt={db.settings.ownerName || "Owner"}
                className="h-9 w-9 shrink-0 rounded-full border-2 border-white/25 object-cover shadow"
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500/40 text-xs font-bold text-white">
                {initials(db.settings.ownerName)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">{db.settings.ownerName}</p>
              <p className="text-[10px] text-white/45">{t("common.owner")}</p>
            </div>
            <LanguageMenu variant="dark" placement="top-left" />
            <button
              onClick={toggleDark}
              title={dark ? "Switch to light mode" : "Switch to dark mode"}
              className="rounded-md p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
            >
              {dark ? "☀️" : "🌙"}
            </button>
            <button onClick={onLogout} title="Sign out" className="rounded-md p-1.5 text-white/50 hover:bg-white/10 hover:text-white">
              <IcLogout size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-ink-200/70 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button className="rounded-md p-2 text-ink-500 hover:bg-ink-100 lg:hidden" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>

          <div className="relative w-full max-w-md">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"><IcSearch size={16} /></span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("common.search")}
              className="h-10 w-full rounded-lg border border-ink-200 bg-ink-50/60 pl-9 pr-9 text-sm placeholder-ink-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/25"
            />
            {query ? (
              <div className="absolute left-0 right-0 top-12 z-40 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-pop">
                {results.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-ink-400">No matches</p>
                ) : (
                  results.map((r, i) => (
                    <button
                      key={i}
                      onClick={() => { onNavigate(r.page); setQuery(""); }}
                      className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-ink-50"
                    >
                      <span className="text-sm font-medium text-ink-800">{r.label}</span>
                      <span className="text-xs text-ink-400">{r.sub}</span>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>

          <div className="ml-auto flex items-center gap-2.5">
            <SyncPill sync={sync} />
            <div className="hidden text-right md:block">
              <p className="text-[11px] text-ink-400">{t("common.cashOnHand")}</p>
              <p className="text-sm font-bold text-ink-900">{fmtMoney(kpis.cashOnHand, db.settings.currency)}</p>
            </div>
            {lowStock.length > 0 ? (
              <button
                onClick={() => onNavigate("products")}
                className="relative rounded-lg border border-ink-200 bg-white p-2 text-ink-500 hover:bg-ink-50"
                title={`${lowStock.length} low-stock items`}
              >
                <IcAlert size={17} />
                <span className="absolute -right-1 -top-1 flex h-4.5 w-4.5 min-w-[18px] items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-ink-900">
                  {lowStock.length}
                </span>
              </button>
            ) : null}
            <Button variant="primary" size="md" onClick={() => onNavigate("pos")}>
              <IcCart size={16} /> {t("common.newSale")}
            </Button>
          </div>
        </header>

        {showBanner ? (
          <div className={`flex items-center gap-3 px-4 py-2.5 sm:px-6 ${subState.tone === "red" ? "bg-red-50 text-red-800" : subState.tone === "amber" ? "bg-amber-50 text-amber-800" : "bg-violet-50 text-violet-800"}`}>
            <span className="text-base">{subState.tone === "red" ? "⚠️" : "✨"}</span>
            <p className="min-w-0 flex-1 truncate text-sm">
              <span className="font-semibold">{subState.label}.</span> {subState.detail}
            </p>
            <Button size="sm" variant="secondary" className="!bg-transparent" onClick={() => onNavigate("billing")}>
              {sub.status === "trialing" ? "Choose a plan" : "Manage plan"}
            </Button>
            <button
              onClick={() => { setBannerClosed(true); sessionStorage.setItem("Managix_sub_banner", "1"); }}
              className="rounded p-1 opacity-60 hover:opacity-100"
              aria-label="Dismiss"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        ) : null}

        <main className="flex-1 overflow-y-auto">
          <div key={page} className="page-enter mx-auto max-w-7xl px-4 py-6 sm:px-6">
            {page === "dashboard" && <DashboardPage />}
            {page === "pos" && <PosPage />}
            {page === "products" && <ProductsPage />}
            {page === "categories" && <CategoriesPage />}
            {page === "sales" && <SalesPage />}
            {page === "purchases" && <PurchasesPage />}
            {page === "returns" && <ReturnsPage />}
            {page === "customers" && <CustomersPage />}
            {page === "suppliers" && <SuppliersPage />}
            {page === "expenses" && <ExpensesPage />}
            {page === "dueBook" && <DueBookPage />}
            {page === "reports" && <ReportsPage />}
            {page === "staff" && <StaffPage />}
            {page === "tools" && <ToolsPage />}
            {page === "storefront" && <StorefrontPage />}
            {page === "wallet" && <WalletPage />}
            {page === "messages" && <MessagesPage />}
            {page === "access" && <AccessPage />}
            {page === "recycle" && <RecyclePage />}
            {page === "billing" && <BillingPage />}
            {page === "settings" && (
              <SettingsPage
                onReset={() => {
                  const fresh = resetDB();
                  onReset(fresh);
                  toast("Demo data restored", "info");
                }}
              />
            )}
          </div>
        </main>
      </div>

      {hasFeature(sub, "support_chat") ? <SupportChat open={chatOpen} onOpenChange={setChatOpen} /> : null}
    </div>
  );
}

function classNamesSidebar(open: boolean) {
  return [
    "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-ink-950 transition-transform lg:static lg:translate-x-0",
    open ? "translate-x-0" : "-translate-x-full",
  ].join(" ");
}

function SyncPill({ sync }: { sync: SyncSnapshot }) {
  const { status, mode, lastSyncedAt, pendingPush } = sync;

  const styles: Record<string, string> = {
    synced: "bg-emerald-50 ring-emerald-200/70 text-emerald-700",
    syncing: "bg-amber-50 ring-amber-200/70 text-amber-700",
    connecting: "bg-ink-50 ring-ink-200/70 text-ink-500",
    offline: "bg-ink-50 ring-ink-200/70 text-ink-500",
    error: "bg-red-50 ring-red-200/70 text-red-700",
  };
  const dot: Record<string, string> = {
    synced: "bg-emerald-500",
    syncing: "bg-amber-500 animate-pulse",
    connecting: "bg-ink-400 animate-pulse",
    offline: "bg-ink-400",
    error: "bg-red-500",
  };
  const label =
    status === "synced"
      ? `Synced${lastSyncedAt ? " · " + new Date(lastSyncedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : ""}`
      : status === "syncing"
        ? "Syncing…"
        : status === "connecting"
          ? "Connecting…"
          : status === "offline"
            ? "Offline · saved locally"
            : "Sync error — retry";

  return (
    <button
      onClick={() => void syncEngine.syncNow()}
      title={`${mode === "supabase" ? "Supabase" : mode === "file" ? "Local server" : "No server yet"} · workspace ${sync.workspaceId}${pendingPush ? " · changes queued" : ""}`}
      className={`hidden items-center gap-2 rounded-lg px-3 py-1.5 ring-1 transition-colors sm:flex ${styles[status] ?? styles.connecting}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot[status] ?? dot.connecting}`} />
      <span className="text-xs font-medium">{label}</span>
      {mode === "supabase" ? (
        <span className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-700">Supabase</span>
      ) : null}
    </button>
  );
}

/** Loads the shared shop document for the no-auth public storefront route. */
function PublicShopLoader({ slug }: { slug: string }) {
  const [db, setDb] = useState<DB | null>(null);
  useEffect(() => {
    setDBStorageScope(null);
    let doc = loadDBIfPresent();
    if (!doc) {
      // No local document yet (fresh browser) — the live shop lives on the
      // server, so try the public pull before falling back to demo seed.
      // loadDB() would seed demo data, which is wrong for a real shopper.
      setDb(null);
      void (async () => {
        try {
          const res = await fetch("/api/db/public");
          if (res.ok) {
            const json = (await res.json()) as { db?: DB };
            if (json.db && Array.isArray((json.db as DB).products)) {
              saveDB(json.db as DB);
              setDb(json.db as DB);
              return;
            }
          }
        } catch { /* offline — fall through to demo */ }
        setDb(loadDBIfPresent());
      })();
      return;
    }
    setDb(doc);
  }, []);
  if (!db) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-ink-500">Opening shop…</div>;
  }
  return <StorefrontPublic db={db} slug={slug} />;
}
