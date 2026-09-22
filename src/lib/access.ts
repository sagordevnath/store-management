import type { ModuleKey, Perm, PresetRole, StaffAccount } from "../types";

/**
 * Access control — every module is gated through one function.
 * Hierarchy: view < edit < all (all = edit + delete).
 */
export const ALL_MODULES: ModuleKey[] = [
  "dashboard", "pos", "sales", "purchases", "returns", "products", "categories",
  "customers", "suppliers", "staff", "expenses", "reports", "tools", "storefront",
  "wallet", "messages", "recycle", "audit", "access", "billing", "settings",
];

export type ModulePermSet = Record<ModuleKey, Perm>;

const NONE: Perm = "none";

function set(perms: Partial<Record<ModuleKey, Perm>>): ModulePermSet {
  const out = {} as ModulePermSet;
  for (const m of ALL_MODULES) out[m] = perms[m] ?? NONE;
  return out;
}

/** Role → default per-module permissions. Owner always gets "all". */
export function rolePerms(role: PresetRole): ModulePermSet {
  switch (role) {
    case "owner":
      return set(Object.fromEntries(ALL_MODULES.map((m) => [m, "all"])) as Partial<Record<ModuleKey, Perm>>);
    case "manager":
      return set({
        dashboard: "all", pos: "all", sales: "all", purchases: "all", returns: "all",
        products: "all", categories: "all", customers: "all", suppliers: "all",
        staff: "view", expenses: "all", reports: "all", tools: "all", storefront: "all",
        wallet: "edit", messages: "all", recycle: "all", audit: "view",
        access: "view", billing: "view", settings: "edit",
      });
    case "cashier":
      return set({
        dashboard: "view", pos: "all", sales: "view", returns: "edit",
        products: "view", categories: "view", customers: "edit",
        expenses: "none", reports: "none", purchases: "none", suppliers: "view",
        staff: "none", tools: "edit", storefront: "none", wallet: "none",
        messages: "none", recycle: "none", audit: "none", access: "none",
        billing: "none", settings: "none",
      });
    case "accountant":
      return set({
        dashboard: "view", pos: "none", sales: "view", purchases: "view",
        returns: "view", products: "view", categories: "none", customers: "view",
        suppliers: "view", staff: "none", expenses: "all", reports: "all",
        tools: "view", storefront: "none", wallet: "all", messages: "none",
        recycle: "none", audit: "view", access: "none", billing: "none", settings: "none",
      });
    default:
      return set({});
  }
}

/** Effective permission for an account (custom roles read their own matrix). */
export function permFor(acct: StaffAccount | null, module: ModuleKey): Perm {
  if (!acct) return "none";
  if (acct.role === "owner" || acct.isOwner) return "all";
  if (acct.role === "custom") return acct.perms[module] ?? NONE;
  return rolePerms(acct.role)[module];
}

export const canView = (a: StaffAccount | null, m: ModuleKey) => permFor(a, m) !== "none";
export const canEdit = (a: StaffAccount | null, m: ModuleKey) => {
  const p = permFor(a, m);
  return p === "edit" || p === "all";
};
export const canDelete = (a: StaffAccount | null, m: ModuleKey) => permFor(a, m) === "all";

export const ROLE_LABELS: Record<PresetRole, string> = {
  owner: "Owner",
  manager: "Manager",
  cashier: "Cashier",
  accountant: "Accountant",
  custom: "Custom",
};

export const ROLE_HINTS: Record<PresetRole, string> = {
  owner: "Full control of everything, including billing.",
  manager: "Runs the shop day-to-day; no billing or access changes.",
  cashier: "Sells and takes returns only — no costs, reports or settings.",
  accountant: "Money in and out: expenses, wallet, reports.",
  custom: "Pick exactly what this account can view, edit or delete.",
};

/* ---------------- signed-in identity (demo-grade PIN auth) ---------------- */

const AUTH_KEY = "Managix_auth_account";

export function setSignedIn(username: string) {
  sessionStorage.setItem(AUTH_KEY, username);
}
export function signOut() {
  sessionStorage.removeItem(AUTH_KEY);
}
export function signedInUsername(): string | null {
  return sessionStorage.getItem(AUTH_KEY);
}

export function accountFor(accounts: StaffAccount[], username: string | null): StaffAccount | null {
  if (!username) return null;
  return accounts.find((a) => a.username === username && a.active) ?? null;
}

/** Verify credentials against the account list. */
export function verifyLogin(accounts: StaffAccount[], username: string, pin: string): StaffAccount | null {
  const acct = accounts.find((a) => a.username.toLowerCase() === username.trim().toLowerCase());
  return acct && acct.active && acct.pin === pin ? acct : null;
}

export const emptyPermSet = set;
export { NONE };
