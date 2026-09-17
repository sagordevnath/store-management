import type { BillingCycle, DB, PayMethod, PlanTier, Subscription, SubInvoice } from "../types";
import { uid, round2 } from "./helpers";
import { COUPONS, Coupon, GRACE_DAYS, PLANS, TRIAL_DAYS, findCoupon, priceFor } from "./plans";

const DAY_MS = 86_400_000;
export const CYCLE_DAYS: Record<BillingCycle, number> = { monthly: 30, yearly: 365 };

export function nextSubInvoiceNo(db: DB): string {
  let max = 0;
  for (const inv of db.subInvoices) {
    const m = /^SUB-(\d+)$/.exec(inv.no);
    if (m) max = Math.max(max, parseInt(m[1]!, 10));
  }
  return `SUB-${max + 1}`;
}

function periodEndFromNow(cycle: BillingCycle): string {
  return new Date(Date.now() + CYCLE_DAYS[cycle] * DAY_MS).toISOString();
}

export interface ChargeResult {
  db: DB;
  invoice: SubInvoice;
}

/** Charge a plan change / renewal. Payment is simulated (demo checkout). */
export function chargeSubscription(
  db: DB,
  tier: Exclude<PlanTier, "trial">,
  cycle: BillingCycle,
  method: PayMethod,
  opts?: { couponCode?: string | null },
): ChargeResult {
  const coupon = opts?.couponCode ? findCoupon(opts.couponCode) : null;
  const amount = priceFor(tier, cycle, coupon);
  const invoice: SubInvoice = {
    id: uid("subinv"),
    no: nextSubInvoiceNo(db),
    at: new Date().toISOString(),
    tier,
    cycle,
    amount,
    discountLabel: coupon ? `${coupon.code} · ${coupon.percentOff}% off` : undefined,
    method,
    status: "Paid",
  };
  const subscription: Subscription = {
    ...db.subscription,
    tier,
    status: "active",
    billingCycle: cycle,
    autoRenew: true,
    paymentMethod: method,
    couponCode: coupon?.code ?? null,
    couponRedeemsLeft: coupon ? 1 : db.subscription.couponRedeemsLeft,
    canceledAt: null,
    currentPeriodEnd: periodEndFromNow(cycle),
  };
  return { db: { ...db, subscription, subInvoices: [invoice, ...db.subInvoices] }, invoice };
}

export function cancelSubscription(db: DB): DB {
  const subscription: Subscription = {
    ...db.subscription,
    autoRenew: false,
    canceledAt: new Date().toISOString(),
    // Access continues until the current period ends; tick() lapses it then.
  };
  return { ...db, subscription };
}

export function toggleAutoRenew(db: DB): DB {
  return { ...db, subscription: { ...db.subscription, autoRenew: !db.subscription.autoRenew } };
}

/**
 * Called at app boot and when the tab regains focus. Applies time-based
 * transitions: trial end → expired, auto-renew → renewal invoice, lapse →
 * past_due (grace) → expired. Returns the same reference when nothing changed.
 */
export function tickSubscriptions(db: DB): DB {
  const sub = db.subscription;
  const now = Date.now();
  const end = new Date(sub.currentPeriodEnd).getTime();
  if (!(now > end)) return db;

  // Trial finished
  if (sub.status === "trialing") {
    return { ...db, subscription: { ...sub, status: "expired", autoRenew: false } };
  }

  if (sub.status === "active") {
    if (sub.autoRenew) {
      // Simulated successful renewal charge.
      const tier = (sub.tier === "trial" ? "basic" : sub.tier) as Exclude<PlanTier, "trial">;
      const cycle = sub.billingCycle ?? "monthly";
      const coupon = sub.couponRedeemsLeft > 0 && sub.couponCode ? findCoupon(sub.couponCode) : null;
      const amount = priceFor(tier, cycle, coupon);
      const invoice: SubInvoice = {
        id: uid("subinv"),
        no: nextSubInvoiceNo(db),
        at: new Date().toISOString(),
        tier,
        cycle,
        amount,
        discountLabel: coupon ? `${coupon.code} · ${coupon.percentOff}% off` : undefined,
        method: sub.paymentMethod ?? "Card",
        status: "Paid",
      };
      return {
        ...db,
        subscription: {
          ...sub,
          tier,
          currentPeriodEnd: periodEndFromNow(cycle),
          couponRedeemsLeft: coupon ? sub.couponRedeemsLeft - 1 : sub.couponRedeemsLeft,
          couponCode: coupon ? sub.couponCode : null,
        },
        subInvoices: [invoice, ...db.subInvoices],
      };
    }
    // No auto-renew: grace period starts.
    return {
      ...db,
      subscription: {
        ...sub,
        status: "past_due",
        currentPeriodEnd: new Date(now + GRACE_DAYS * DAY_MS).toISOString(),
      },
    };
  }

  if (sub.status === "past_due") {
    // Grace exhausted → lock.
    return { ...db, subscription: { ...sub, status: "expired" } };
  }

  return db;
}

/** Days left in the current period (negative when lapsed). */
export function daysLeft(sub: Subscription): number {
  return Math.ceil((new Date(sub.currentPeriodEnd).getTime() - Date.now()) / DAY_MS);
}
