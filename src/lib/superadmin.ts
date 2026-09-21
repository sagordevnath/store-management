/**
 * Super-admin subscriber registry — device-local demo store (separate from the
 * business DB so admin data never mixes with shop data). In a production
 * deployment this would live server-side (Supabase); the shape is ready for it.
 */

export type AdminPlan = "trial" | "basic" | "pro" | "enterprise";
export type AdminStatus = "active" | "trialing" | "past_due" | "expired" | "suspended";

export interface Subscriber {
  id: string;
  shopName: string;
  ownerName: string;
  phone: string;
  email: string;
  plan: AdminPlan;
  status: AdminStatus;
  joinedAt: string;
  lastActiveAt: string;
  deletedAt: string | null; // soft delete — restorable
}

export interface Announcement {
  id: string;
  text: string;
  at: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  action: string;
  target: string;
  detail: string;
}

export interface Registry {
  subscribers: Subscriber[];
  announcements: Announcement[];
  audit: AuditEntry[];
}

const KEY = "Managix_registry_v1";
export const SA_PASSCODE = "246810";
const DAY = 86_400_000;

function daysAgo(n: number, hour = 9): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, Math.floor(Math.random() * 50), 0, 0);
  return d.toISOString();
}

function seed(): Registry {
  const raw: [string, string, string, string, AdminPlan, AdminStatus, number][] = [
    ["Utshorgo", "Sagor Devnath", "+880 1710 786364", "sagor@utshorgolive.com", "pro", "active", 210],
    ["Sunrise Mini Mart", "Nusrat Jahan", "+1 555 0111", "nusrat@sunrise.shop", "basic", "active", 180],
    ["GreenCart Grocers", "Daniel Osei", "+1 555 0122", "dan@greencart.io", "enterprise", "active", 150],
    ["Metro Daily Bazar", "Priya Nair", "+1 555 0133", "priya@metrodb.com", "pro", "past_due", 120],
    ["Corner Shop 24", "Marcus Webb", "+1 555 0144", "marcus@c24.store", "trial", "trialing", 6],
    ["Fresh Basket", "Sofia Reyes", "+1 555 0155", "sofia@freshbasket.co", "basic", "expired", 95],
    ["City Superstore", "Jonas Lindberg", "+1 555 0166", "jonas@citysuper.se", "enterprise", "active", 88],
    ["Quick Mart", "Aisha Karim", "+1 555 0177", "aisha@quickmart.store", "pro", "suspended", 70],
    ["Village Store", "Tomasz Nowak", "+1 555 0188", "tomasz@village.pl", "basic", "active", 55],
    ["Uptown Provisions", "Grace Mensah", "+1 555 0199", "grace@uptown.shop", "pro", "active", 41],
    ["Harbor Grocery", "Leo Fischer", "+1 555 0210", "leo@harbor.de", "trial", "trialing", 3],
    ["Budget Bazaar", "Hana Sato", "+1 555 0221", "hana@budgetbazaar.jp", "basic", "expired", 28],
  ];
  return {
    subscribers: raw.map(([shopName, ownerName, phone, email, plan, status, joined], i) => ({
      id: `sub_${i + 1}`,
      shopName,
      ownerName,
      phone,
      email,
      plan,
      status,
      joinedAt: daysAgo(joined),
      lastActiveAt: daysAgo(Math.floor(Math.random() * 3), 8 + (i % 10)),
      deletedAt: null,
    })),
    announcements: [
      {
        id: "ann_1",
        text: "Scheduled maintenance this Sunday 02:00–03:00 UTC — syncing may pause briefly.",
        at: daysAgo(2),
      },
    ],
    audit: [
      { id: "aud_1", at: daysAgo(2), action: "announcement", target: "all", detail: "Maintenance notice posted" },
    ],
  };
}

export function loadRegistry(): Registry {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Registry;
      if (parsed && Array.isArray(parsed.subscribers)) return parsed;
    }
  } catch {
    /* fall through */
  }
  const reg = seed();
  saveRegistry(reg);
  return reg;
}

export function saveRegistry(reg: Registry) {
  try {
    localStorage.setItem(KEY, JSON.stringify(reg));
  } catch {
    /* ignore */
  }
}

export function addAudit(reg: Registry, action: string, target: string, detail: string): Registry {
  const entry: AuditEntry = {
    id: `aud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    action,
    target,
    detail,
  };
  return { ...reg, audit: [entry, ...reg.audit].slice(0, 200) };
}

/* ---------------- Derived analytics ---------------- */

const MONTHLY: Record<AdminPlan, number> = { trial: 0, basic: 12, pro: 29, enterprise: 79 };

export function mrr(reg: Registry): number {
  return reg.subscribers
    .filter((s) => !s.deletedAt && (s.status === "active" || s.status === "past_due"))
    .reduce((sum, s) => sum + MONTHLY[s.plan], 0);
}

import { activeLocale, localizeDigits } from "./i18n";

export function signupsByMonth(reg: Registry, months = 6): { label: string; value: number }[] {
  const out: { label: string; value: number }[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const prefix = d.toISOString().slice(0, 7);
    const value = reg.subscribers.filter((s) => s.joinedAt.slice(0, 7) === prefix).length;
    out.push({ label: localizeDigits(d.toLocaleDateString(activeLocale(), { month: "short" })), value });
  }
  return out;
}
