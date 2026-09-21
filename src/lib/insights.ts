import type { DB } from "../types";
import { round2, startOfDay } from "./helpers";
import { activeLocale, localizeDigits } from "./i18n";

/**
 * Rules-based "AI" analytics: daily insight text and a naive cash-flow
 * forecast from recent averages. Deterministic — same data, same insight.
 */

/* ---------------- Daily insight ---------------- */

export function generateInsight(db: DB, target?: number): string {
  const inLast = (days: number) => {
    const s = startOfDay(new Date(Date.now() - (days - 1) * 86400000));
    return db.sales.filter((x) => new Date(x.at) >= s);
  };
  const rev = (list: typeof db.sales) => list.reduce((s, x) => s + x.total, 0);

  const last7 = inLast(7);
  const prev7 = inLast(14).filter((x) => !last7.includes(x));
  const r7 = rev(last7);
  const rp7 = rev(prev7);
  const delta = rp7 > 0 ? ((r7 - rp7) / rp7) * 100 : 0;

  const parts: string[] = [];

  if (rp7 > 0) {
    parts.push(
      delta >= 0
        ? `Revenue is up ${Math.abs(delta).toFixed(0)}% vs last week (${Math.round(r7).toLocaleString()} this week).`
        : `Revenue slipped ${Math.abs(delta).toFixed(0)}% vs last week — worth a look.`,
    );
  }

  // Target pace (if provided)
  if (target && target > 0) {
    const now = new Date();
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const expected = (target * dayOfMonth) / daysInMonth;
    const mtd = db.sales
      .filter((x) => x.at.slice(0, 7) === new Date().toISOString().slice(0, 7))
      .reduce((s, x) => s + x.total, 0);
    if (mtd >= expected) {
      parts.push(`You're on pace for the ${Math.round(target).toLocaleString()} monthly target — ${Math.round(mtd).toLocaleString()} so far.`);
    } else {
      parts.push(`You're ${Math.round(expected - mtd).toLocaleString()} behind target pace for this point in the month.`);
    }
  }

  // Top mover
  const map = new Map<string, number>();
  for (const s of last7) {
    for (const it of s.items) map.set(it.productId, (map.get(it.productId) ?? 0) + it.unitPrice * it.qty - it.discount);
  }
  const topName = [...map.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topName) {
    const p = db.products.find((x) => x.id === topName[0]);
    if (p) parts.push(`"${p.name}" is your best mover this week.`);
  }

  // Low stock
  const low = db.products.filter((p) => p.stock <= p.lowStockAt);
  if (low.length > 0) {
    parts.push(`${low.length} item${low.length === 1 ? " is" : "s are"} low on stock — restock before the weekend rush.`);
  }

  // Dues
  const outstanding = db.sales.reduce((s, x) => s + Math.max(0, x.total - x.paidAmount), 0);
  if (outstanding > 50) {
    parts.push(`${Math.round(outstanding).toLocaleString()} in customer dues is waiting to be collected.`);
  }

  return parts.slice(0, 3).join(" ") || "Not enough data yet — make a few sales and check back tomorrow.";
}

/* ---------------- Cash-flow forecast ---------------- */

export interface ForecastPoint {
  label: string;
  inflow: number;
  outflow: number;
  net: number;
  cum: number;
}

/**
 * Naive 14-day forecast: average daily inflow (sales) and outflow
 * (expenses + purchases) from the last 30 days, applied forward.
 */
export function forecastCashflow(db: DB, days = 14): ForecastPoint[] {
  const since = startOfDay(new Date(Date.now() - 29 * 86400000));

  let inflow = 0;
  for (const s of db.sales) if (new Date(s.at) >= since) inflow += s.paidAmount;
  let outflow = 0;
  for (const e of db.expenses) if (new Date(e.at) >= since) outflow += e.amount;
  for (const p of db.purchases) if (new Date(p.at) >= since) outflow += p.paidAmount;

  const dailyIn = round2(inflow / 30);
  const dailyOut = round2(outflow / 30);

  const out: ForecastPoint[] = [];
  let cum = 0;
  for (let i = 1; i <= days; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const net = round2(dailyIn - dailyOut);
    cum = round2(cum + net);
    out.push({
      label: localizeDigits(d.toLocaleDateString(activeLocale(), { month: "short", day: "numeric" })),
      inflow: dailyIn,
      outflow: dailyOut,
      net,
      cum,
    });
  }
  return out;
}
