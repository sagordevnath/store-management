import type { PlanTier, Subscription, BillingCycle, PayMethod } from "../types";
import { round2 } from "./helpers";

/* ============================ Plan matrix ============================ */

export type FeatureKey =
  | "categories_nested"
  | "categories_report"
  | "bulk_recategorize"
  | "ai_suggest"
  | "dashboard_widgets"
  | "target_progress"
  | "cashflow_forecast"
  | "ai_insight"
  | "compare_period"
  | "whatsapp_orders"
  | "delivery_tracking"
  | "e_signature"
  | "voice_entry"
  | "support_chat"
  /* --- Phase 4 --- */
  | "price_tiers"
  | "returns"
  | "smart_reorder"
  | "expiry_tracking"
  | "branches"
  | "loyalty"
  | "credit_sales"
  /* --- Phase 6: growth suite --- */
  | "storefront"
  | "wallet_qr"
  | "messages_hub"
  | "marketing_campaigns"
  | "team_access"
  | "recycle_bin"
  | "barcode_tools";

export interface PlanLimits {
  products: number; // Infinity = unlimited
  staff: number;
  branches: number;
}

export interface PlanDef {
  tier: PlanTier;
  name: string;
  blurb: string;
  monthly: number;
  yearly: number; // billed once per year
  features: FeatureKey[];
  limits: PlanLimits;
  accent: string; // tailwind classes for card highlight
}

export const PLANS: Record<Exclude<PlanTier, "trial">, PlanDef> = {
  basic: {
    tier: "basic",
    name: "Basic",
    blurb: "Everything a single shop needs to run daily sales.",
    monthly: 12,
    yearly: 120,
    accent: "from-sky-500 to-sky-600",
    features: ["categories_nested", "target_progress", "compare_period", "voice_entry", "returns", "expiry_tracking", "loyalty", "credit_sales", "wallet_qr", "barcode_tools", "recycle_bin"],
    limits: { products: 300, staff: 2, branches: 1 },
  },
  pro: {
    tier: "pro",
    name: "Pro",
    blurb: "Advanced analytics, AI insights and delivery tools.",
    monthly: 29,
    yearly: 290,
    accent: "from-brand-500 to-brand-600",
    features: [
      "price_tiers",
      "smart_reorder",
      "branches",
      "returns",
      "expiry_tracking",
      "loyalty",
      "credit_sales",
      "wallet_qr",
      "barcode_tools",
      "recycle_bin",
      "storefront",
      "messages_hub",
      "marketing_campaigns",
      "team_access",
      "categories_nested",
      "categories_report",
      "bulk_recategorize",
      "ai_suggest",
      "dashboard_widgets",
      "target_progress",
      "cashflow_forecast",
      "ai_insight",
      "compare_period",
      "whatsapp_orders",
      "delivery_tracking",
      "e_signature",
      "voice_entry",
    ],
    limits: { products: 5000, staff: 10, branches: 3 },
  },
  enterprise: {
    tier: "enterprise",
    name: "Enterprise",
    blurb: "Unlimited scale, every module, priority support.",
    monthly: 79,
    yearly: 790,
    accent: "from-violet-500 to-violet-600",
    features: [
      "categories_nested",
      "categories_report",
      "bulk_recategorize",
      "ai_suggest",
      "dashboard_widgets",
      "target_progress",
      "cashflow_forecast",
      "ai_insight",
      "compare_period",
      "whatsapp_orders",
      "delivery_tracking",
      "e_signature",
      "voice_entry",
      "support_chat",
      "price_tiers",
      "returns",
      "smart_reorder",
      "expiry_tracking",
      "branches",
      "loyalty",
      "credit_sales",
      "storefront",
      "wallet_qr",
      "messages_hub",
      "marketing_campaigns",
      "team_access",
      "recycle_bin",
      "barcode_tools",
    ],
    limits: { products: Infinity, staff: Infinity, branches: Infinity },
  },
};

export const PLAN_ORDER: PlanTier[] = ["trial", "basic", "pro", "enterprise"];

/** Lowest plan that includes a feature (for "X plan required" labels). */
export function minimumTierForFeature(key: FeatureKey): Exclude<PlanTier, "trial"> {
  for (const tier of ["basic", "pro", "enterprise"] as const) {
    if (PLANS[tier].features.includes(key)) return tier;
  }
  return "enterprise";
}

export const TRIAL_DAYS = 14;

/* ============================ Feature gating ============================ */

export function featuresFor(sub: Subscription): FeatureKey[] {
  if (isEntitled(sub)) {
    return PLANS[sub.tier as Exclude<PlanTier, "trial">]?.features ?? [];
  }
  return [];
}

/** True when the subscription currently unlocks paid modules (grace counts). */
export function isEntitled(sub: Subscription): boolean {
  if (sub.status === "active") return true;
  if (sub.status === "past_due") return true; // grace period keeps access
  return false;
}

/** Trial access: everything in Pro, without enterprise extras, while trialing. */
export function isTrialActive(sub: Subscription): boolean {
  return sub.status === "trialing" && new Date(sub.currentPeriodEnd).getTime() > Date.now();
}

export function hasFeature(sub: Subscription, key: FeatureKey): boolean {
  if (sub.status === "trialing") return isTrialActive(sub); // trial unlocks Pro features
  return featuresFor(sub).includes(key);
}

export function limitFor(sub: Subscription, key: keyof PlanLimits): number {
  if (sub.status === "trialing") return PLANS.pro.limits[key];
  if (!isEntitled(sub)) return PLANS.basic.limits[key]; // locked/downgraded floor
  return PLANS[sub.tier as Exclude<PlanTier, "trial">]?.limits[key] ?? PLANS.basic.limits[key];
}

export function planName(sub: Subscription): string {
  if (sub.status === "trialing") return "Free Trial";
  if (sub.tier === "trial") return "Free Trial";
  return PLANS[sub.tier as Exclude<PlanTier, "trial">]?.name ?? "Basic";
}

export const GRACE_DAYS = 7;

/* ============================ Coupons ============================ */

export interface Coupon {
  code: string;
  percentOff: number;
  description: string;
}

export const COUPONS: Coupon[] = [
  { code: "LAUNCH25", percentOff: 25, description: "Launch offer — 25% off" },
  { code: "SHOP10", percentOff: 10, description: "10% off any plan" },
  { code: "YEARLY50", percentOff: 50, description: "Half-price first year" },
];

export function findCoupon(code: string): Coupon | null {
  return COUPONS.find((c) => c.code.toLowerCase() === code.trim().toLowerCase()) ?? null;
}

export function priceFor(tier: Exclude<PlanTier, "trial">, cycle: BillingCycle, coupon?: Coupon | null): number {
  const base = PLANS[tier][cycle];
  return coupon ? round2(base * (1 - coupon.percentOff / 100)) : base;
}

export function methodLabel(m: PayMethod): string {
  return m === "bKash" ? "bKash" : m === "Nagad" ? "Nagad" : "Card";
}

/** Human summary of where the subscription stands, for badges and banners. */
export function subStateSummary(sub: Subscription): {
  tone: "green" | "amber" | "red" | "neutral" | "violet";
  label: string;
  detail: string;
} {
  const daysLeft = Math.ceil((new Date(sub.currentPeriodEnd).getTime() - Date.now()) / 86400000);
  if (sub.status === "trialing") {
    return {
      tone: daysLeft <= 3 ? "amber" : "violet",
      label: `Trial · ${daysLeft}d left`,
      detail: daysLeft <= 3 ? "Trial ending soon — pick a plan to keep Pro features." : "All Pro features unlocked during your trial.",
    };
  }
  if (sub.status === "active") {
    return { tone: "green", label: `${planName(sub)} · active`, detail: `Renews ${new Date(sub.currentPeriodEnd).toLocaleDateString()}${sub.autoRenew ? "" : " (auto-renew off)"}` };
  }
  if (sub.status === "past_due") {
    return { tone: "amber", label: "Grace period", detail: `Payment failed — ${daysLeft} day(s) of grace left before modules lock.` };
  }
  if (sub.status === "expired") {
    return { tone: "red", label: "Expired", detail: "Subscription lapsed — premium modules are locked. Renew to restore access." };
  }
  return { tone: "red", label: "Canceled", detail: "Subscription canceled. Choose a plan to reactivate." };
}
