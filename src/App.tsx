import React, { useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { DB } from "./types";
import { loadDB, saveDB, resetDB, computeKpis } from "./lib/store";
import { syncEngine, type SyncSnapshot } from "./lib/sync";
import { tickSubscriptions, daysLeft } from "./lib/billing";
import { planName, subStateSummary, hasFeature } from "./lib/plans";
import { fmtMoney, initials, classNames } from "./lib/helpers";
import { Badge, Button, Card, Modal, ToastProvider, useDarkMode, useToast } from "./ui";
import {
  IcDashboard, IcCart, IcBox, IcSale, IcTruck, IcUsers, IcBuilding, IcWallet,
  IcChart, IcStaff, IcSettings, IcSearch, IcLogout, IcStore, IcAlert,
  IcCategories, IcCrown, IcTools,
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
import SuperAdminPage from "./pages/SuperAdminPage";
import SupportChat from "./pages/SupportChat";
import { LoginPage } from "./pages/LoginPage";

export type PageKey =
  | "dashboard" | "pos" | "products" | "categories" | "sales" | "purchases"
  | "customers" | "suppliers" | "expenses" | "reports" | "staff" | "settings"
  | "billing" | "tools";

const NAV: { key: PageKey; label: string; icon: (p: { size?: number; className?: string }) => React.ReactNode; group: string }[] = [
  { key: "dashboard", label: "Dashboard", icon: IcDashboard, group: "Overview" },
  { key: "pos", label: "Point of Sale", icon: IcCart, group: "Daily Operations" },
  { key: "sales", label: "Sales & Invoices", icon: IcSale, group: "Daily Operations" },
  { key: "purchases", label: "Purchases", icon: IcTruck, group: "Daily Operations" },
  { key: "products", label: "Products & Stock", icon: IcBox, group: "Catalog" },
  { key: "categories", label: "Categories", icon: IcCategories, group: "Catalog" },
  { key: "customers", label: "Customers", icon: IcUsers, group: "People" },
  { key: "suppliers", label: "Suppliers", icon: IcBuilding, group: "People" },
  { key: "staff", label: "Staff", icon: IcStaff, group: "People" },
  { key: "expenses", label: "Expenses", icon: IcWallet, group: "Finance" },
  { key: "reports", label: "Reports", icon: IcChart, group: "Finance" },
  { key: "tools", label: "Tools & Extras", icon: IcTools, group: "Finance" },
  { key: "billing", label: "Billing & Plan", icon: IcCrown, group: "Account" },
  { key: "settings", label: "Settings", icon: IcSettings, group: "Account" },
];

const NAV_GROUPS = ["Overview", "Daily Operations", "Catalog", "People", "Finance", "Account"];

export interface Ctx {
  db: DB;
  setDB: (db: DB) => void;
  update: (fn: (db: DB) => DB) => void;
  navigate: (p: PageKey) => void;
  currency: string;
  sync: SyncSnapshot;
}

const CtxReact = React.createContext<Ctx | null>(null);
export function useApp(): Ctx {
  const c = useContext(CtxReact);
  if (!c) throw new Error("useApp outside provider");
  return c;
}

export default function App() {
  const [db, setDb] = useState<DB | null>(null);
  const [page, setPage] = useState<PageKey>(() => {
    const h = window.location.hash.replace("#", "");
    return (NAV.some((n) => n.key === h) ? h : "dashboard") as PageKey;
  });
  const [authed, setAuthed] = useState(() => sessionStorage.getItem("Managix_auth") === "1");
  const [superAdmin, setSuperAdmin] = useState(() => window.location.hash === "#superadmin");
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const local = loadDB();
    setDb(local);
    syncEngine.onReplace = (next) => setDb(next);
    void syncEngine.start(local);
  }, []);

  const sync = useSyncExternalStore(syncEngine.subscribe, syncEngine.getSnapshot);

  useEffect(() => {
    if (window.location.hash !== `#${page}`) window.location.hash = page;
  }, [page]);

  useEffect(() => {
    const onHash = () => {
      if (window.location.hash === "#superadmin") {
        setSuperAdmin(true);
        return;
      }
      setSuperAdmin(false);
      const h = window.location.hash.replace("#", "");
      if (NAV.some((n) => n.key === h)) setPage(h as PageKey);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (superAdmin) return <SuperAdminPage />;

  if (!db) return null;

  // Subscription lifecycle tick at boot.
  const ticked = tickSubscriptions(db);
  if (ticked !== db) {
    setDb(ticked);
    saveDB(ticked);
    syncEngine.recordChange(db, ticked);
    return null;
  }

  const update = (fn: (db: DB) => DB) => {
    setDb((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      saveDB(next);
      syncEngine.recordChange(prev, next);
      return next;
    });
  };

  const ctx: Ctx = { db, setDB: setDb, update, navigate: setPage, currency: db.settings.currency, sync };

  return (
    <CtxReact.Provider value={ctx}>
      {!authed ? (
        <LoginPage onLogin={() => { setAuthed(true); sessionStorage.setItem("Managix_auth", "1"); }} shopName={db.settings.shopName} />
      ) : (
        <Shell
          db={db}
          page={page}
          onNavigate={setPage}
          onLogout={() => { setAuthed(false); sessionStorage.removeItem("Managix_auth"); }}
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
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 shadow-lg shadow-brand-500/30">
            <IcStore size={18} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">{db.settings.shopName}</p>
            <p className="truncate text-[11px] text-white/50">{db.settings.tagline}</p>
          </div>
        </div>
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group}>
              <p className="mb-1.5 px-2.5 text-[10px] font-bold uppercase tracking-widest text-white/35">{group}</p>
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
                    <span>{n.label}</span>
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
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/40 text-xs font-bold text-white">
              {initials(db.settings.ownerName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">{db.settings.ownerName}</p>
              <p className="text-[10px] text-white/45">Owner</p>
            </div>
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
              placeholder="Search products, categories, customers, invoices…"
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
              <p className="text-[11px] text-ink-400">Cash on hand</p>
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
              <IcCart size={16} /> New Sale
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
            {page === "customers" && <CustomersPage />}
            {page === "suppliers" && <SuppliersPage />}
            {page === "expenses" && <ExpensesPage />}
            {page === "reports" && <ReportsPage />}
            {page === "staff" && <StaffPage />}
            {page === "tools" && <ToolsPage />}
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
