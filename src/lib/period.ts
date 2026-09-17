import type { DB } from "../types";
import { round2, startOfDay } from "./helpers";

/** Dashboard period selector: today / weekly / monthly / yearly / all time. */
export type PeriodKey = "today" | "weekly" | "monthly" | "yearly" | "all";

export const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "all", label: "All time" },
];

/** "Today's" / "This week's" … for card labels like "Today's sales". */
export function periodLabel(key: PeriodKey): string {
  switch (key) {
    case "today":
      return "Today's";
    case "weekly":
      return "This week's";
    case "monthly":
      return "This month's";
    case "yearly":
      return "This year's";
    case "all":
      return "All-time";
  }
}

/** Human name of the period: "today", "this week", … */
export function periodName(key: PeriodKey): string {
  switch (key) {
    case "today":
      return "today";
    case "weekly":
      return "this week";
    case "monthly":
      return "this month";
    case "yearly":
      return "this year";
    case "all":
      return "all time";
  }
}

/** Approximate day-count for helpers that take a `days` argument. */
export function periodDays(key: PeriodKey): number {
  const now = new Date();
  switch (key) {
    case "today":
      return 1;
    case "weekly":
      return 7;
    case "monthly":
      return now.getDate();
    case "yearly": {
      const jan1 = new Date(now.getFullYear(), 0, 1);
      return Math.max(1, Math.ceil((now.getTime() - jan1.getTime()) / 86400000));
    }
    case "all":
      return 3650;
  }
}

export interface PeriodRange {
  start: Date;
  end: Date;
  prevStart: Date | null;
  prevEnd: Date | null;
  /** Inclusive text for subtitles, e.g. "Sep 1 – Sep 17, 2026". */
  text: string;
}

export function periodRange(key: PeriodKey, now = new Date()): PeriodRange {
  const start = startOfDay(new Date(now));
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  if (key === "today") {
    const p = startOfDay(new Date(now));
    p.setDate(p.getDate() - 1);
    const prevEnd = new Date(p.getTime() + 86400000 - 1);
    return { start, end: now, prevStart: p, prevEnd: prevEnd, text: fmt(p) };
  }

  if (key === "weekly") {
    start.setDate(start.getDate() - 6);
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = startOfDay(new Date(prevEnd));
    prevStart.setDate(prevStart.getDate() - 6);
    return { start, end: now, prevStart, prevEnd, text: `${fmt(start)} – ${fmt(now)}` };
  }

  if (key === "monthly") {
    start.setDate(1);
    const dom = now.getDate();
    const pm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const daysInPrev = new Date(pm.getFullYear(), pm.getMonth() + 1, 0).getDate();
    const prevStart = startOfDay(new Date(pm));
    const prevEnd = new Date(pm);
    prevEnd.setDate(Math.min(dom, daysInPrev));
    prevEnd.setHours(23, 59, 59, 999);
    return { start, end: now, prevStart, prevEnd, text: `${fmt(start)} – ${fmt(now)}` };
  }

  if (key === "yearly") {
    start.setMonth(0, 1);
    const prevStart = new Date(now.getFullYear() - 1, 0, 1);
    const prevEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
    return { start, end: now, prevStart, prevEnd, text: `${now.getFullYear()}` };
  }

  // all time — a generous fixed start; filtering handles the rest
  return { start: new Date(2000, 0, 1), end: now, prevStart: null, prevEnd: null, text: "All time" };
}

export function inRange(iso: string, start: Date, end: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

export interface MethodRow {
  method: string;
  amount: number;
  count: number;
}

export interface PeriodMetrics {
  /* Chart label for the period, e.g. "Since Aug 18, 2026" */
  rangeText: string;
  /* Sales */
  salesTotal: number;
  salesCount: number;
  itemsSold: number;
  costTotal: number;
  profit: number;
  marginPct: number;
  avgOrder: number;
  /* Purchases */
  purchasesTotal: number;
  purchasesPaid: number;
  purchasesCount: number;
  purchasesQty: number;
  /* Expenses */
  expensesTotal: number;
  expensesCount: number;
  /* Stock (live snapshot) */
  stockQty: number;
  stockValue: number; // at cost
  stockRetail: number; // at retail price
  lowStock: number;
  outOfStock: number;
  productCount: number;
  /* Dues */
  dueTotal: number; // outstanding customer balance right now (receivable)
  dueCustomers: number; // customers currently owing
  dueIncurred: number; // dues created inside the period
  /* Payables / receivables (period-aware) */
  receivableTotal: number; // outstanding receivable now
  receivableIncurred: number; // new receivables inside the period
  payableTotal: number; // outstanding payable to suppliers now
  payableIncurred: number; // new payables created inside the period
  payableSuppliers: number; // suppliers currently owed
  /* Collections (cash received from sales in period) */
  collectedTotal: number;
  collectedCount: number;
  byMethod: MethodRow[];
  /* Cash flow */
  cashOut: number; // purchases paid + expenses in period
  /* Previous comparable period */
  prev: { salesTotal: number; profit: number; purchasesTotal: number; expensesTotal: number } | null;
}

export function periodMetrics(db: DB, key: PeriodKey): PeriodMetrics {
  const r = periodRange(key, new Date());
  const inP = (iso: string) => inRange(iso, r.start, r.end);
  const fmtD = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  // All-time text uses the earliest record when available.
  const rangeText =
    key === "all"
      ? db.sales.length
        ? `Since ${fmtD(new Date(Math.min(...db.sales.map((s) => new Date(s.at).getTime()))))}`
        : "No sales yet"
      : r.text;

  let salesTotal = 0,
    salesCount = 0,
    itemsSold = 0,
    costTotal = 0,
    collectedTotal = 0,
    collectedCount = 0;
  const methods = new Map<string, MethodRow>();

  for (const s of db.sales) {
    if (!inP(s.at)) continue;
    salesTotal += s.total;
    salesCount += 1;
    costTotal += s.costTotal;
    for (const it of s.items) itemsSold += it.qty;
    collectedTotal += s.paidAmount;
    if (s.paidAmount > 0.009) collectedCount += 1;
    const m = methods.get(s.payment) ?? { method: s.payment, amount: 0, count: 0 };
    m.amount += s.paidAmount;
    m.count += 1;
    methods.set(s.payment, m);
  }

  let purchasesTotal = 0,
    purchasesPaid = 0,
    purchasesCount = 0,
    purchasesQty = 0;
  for (const p of db.purchases) {
    if (!inP(p.at)) continue;
    purchasesTotal += p.total;
    purchasesPaid += p.paidAmount;
    purchasesCount += 1;
    for (const it of p.items) purchasesQty += it.qty;
  }

  let expensesTotal = 0,
    expensesCount = 0;
  for (const e of db.expenses) {
    if (!inP(e.at)) continue;
    expensesTotal += e.amount;
    expensesCount += 1;
  }

  /* Live stock snapshot */
  let stockQty = 0,
    stockValue = 0,
    stockRetail = 0,
    lowStock = 0,
    outOfStock = 0;
  for (const p of db.products) {
    stockQty += p.stock;
    stockValue += p.stock * p.cost;
    stockRetail += p.stock * p.price;
    if (p.stock === 0) outOfStock += 1;
    else if (p.stock <= p.lowStockAt) lowStock += 1;
  }

  /* Dues: outstanding balance now + incurred in period */
  let dueTotal = 0;
  const dueCustIds = new Set<string>();
  let dueIncurred = 0;
  for (const s of db.sales) {
    const out = s.total - s.paidAmount;
    if (out > 0.009 && s.payment === "Due") {
      dueTotal += out;
      if (s.customerId) dueCustIds.add(s.customerId);
      if (inP(s.at)) dueIncurred += out;
    }
  }

  /* Payables: outstanding to suppliers now + incurred in period */
  let payableTotal = 0;
  const payableSupIds = new Set<string>();
  let payableIncurred = 0;
  for (const p of db.purchases) {
    const out = p.total - p.paidAmount;
    if (out > 0.009 && p.payment === "Due") {
      payableTotal += out;
      if (p.supplierId) payableSupIds.add(p.supplierId);
      if (inP(p.at)) payableIncurred += out;
    }
  }

  /* Previous comparable period */
  let prev: PeriodMetrics["prev"] = null;
  if (r.prevStart && r.prevEnd) {
    const inPrev = (iso: string) => inRange(iso, r.prevStart!, r.prevEnd!);
    let pSales = 0,
      pProfit = 0,
      pPurch = 0,
      pExp = 0;
    for (const s of db.sales) {
      if (!inPrev(s.at)) continue;
      pSales += s.total;
      pProfit += s.profit;
    }
    for (const p of db.purchases) if (inPrev(p.at)) pPurch += p.total;
    for (const e of db.expenses) if (inPrev(e.at)) pExp += e.amount;
    prev = {
      salesTotal: round2(pSales),
      profit: round2(pProfit),
      purchasesTotal: round2(pPurch),
      expensesTotal: round2(pExp),
    };
  }

  return {
    rangeText,
    salesTotal: round2(salesTotal),
    salesCount,
    itemsSold,
    costTotal: round2(costTotal),
    profit: round2(salesTotal - costTotal),
    marginPct: salesTotal > 0 ? Math.round(((salesTotal - costTotal) / salesTotal) * 100) : 0,
    avgOrder: salesCount > 0 ? round2(salesTotal / salesCount) : 0,
    purchasesTotal: round2(purchasesTotal),
    purchasesPaid: round2(purchasesPaid),
    purchasesCount,
    purchasesQty,
    expensesTotal: round2(expensesTotal),
    expensesCount,
    stockQty,
    stockValue: round2(stockValue),
    stockRetail: round2(stockRetail),
    lowStock,
    outOfStock,
    productCount: db.products.length,
    dueTotal: round2(dueTotal),
    dueCustomers: dueCustIds.size,
    dueIncurred: round2(dueIncurred),
    receivableTotal: round2(dueTotal),
    receivableIncurred: round2(dueIncurred),
    payableTotal: round2(payableTotal),
    payableIncurred: round2(payableIncurred),
    payableSuppliers: payableSupIds.size,
    collectedTotal: round2(collectedTotal),
    collectedCount,
    byMethod: [...methods.values()].map((m) => ({ ...m, amount: round2(m.amount) })).sort((a, b) => b.amount - a.amount),
    cashOut: round2(purchasesPaid + expensesTotal),
    prev,
  };
}

/** Top products (by profit) whose sales fall inside an explicit range. */
export function topProductsInRange(
  db: DB,
  start: Date,
  end: Date,
  limit = 8
): { name: string; qty: number; revenue: number; profit: number }[] {
  const map = new Map<string, { name: string; qty: number; revenue: number; profit: number }>();
  for (const s of db.sales) {
    if (!inRange(s.at, start, end)) continue;
    for (const it of s.items) {
      const e = map.get(it.productId) ?? { name: it.name, qty: 0, revenue: 0, profit: 0 };
      e.qty += it.qty;
      e.revenue += it.unitPrice * it.qty - it.discount;
      e.profit += (it.unitPrice - it.unitCost) * it.qty - it.discount;
      map.set(it.productId, e);
    }
  }
  return [...map.values()]
    .map((e) => ({ ...e, revenue: round2(e.revenue), profit: round2(e.profit) }))
    .sort((a, b) => b.profit - a.profit)
    .slice(0, limit);
}

/** Expenses grouped by category inside an explicit range. */
export function expenseBreakdownInRange(db: DB, start: Date, end: Date): { category: string; value: number }[] {
  const map = new Map<string, number>();
  for (const e of db.expenses) {
    if (!inRange(e.at, start, end)) continue;
    map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
  }
  return [...map.entries()]
    .map(([category, value]) => ({ category, value: round2(value) }))
    .sort((a, b) => b.value - a.value);
}

/** Revenue by product category (leaf-name rollup) inside an explicit range. */
export function categorySalesInRange(db: DB, start: Date, end: Date): { category: string; value: number }[] {
  const byId = new Map(db.products.map((p) => [p.id, p]));
  const cats = new Map(db.categories.map((c) => [c.id, c]));
  const map = new Map<string, number>();
  for (const s of db.sales) {
    if (!inRange(s.at, start, end)) continue;
    for (const it of s.items) {
      const p = byId.get(it.productId);
      const name = p?.categoryId ? cats.get(p.categoryId)?.name ?? "Other" : "Uncategorized";
      map.set(name, (map.get(name) ?? 0) + it.unitPrice * it.qty - it.discount);
    }
  }
  return [...map.entries()]
    .map(([category, value]) => ({ category, value: round2(value) }))
    .sort((a, b) => b.value - a.value);
}

/** Product performance (units/revenue/profit) inside an explicit range. */
export function productPerformanceInRange(
  db: DB,
  start: Date,
  end: Date,
  limit = 10
): { id: string; name: string; qty: number; revenue: number; profit: number }[] {
  const map = new Map<string, { name: string; qty: number; revenue: number; profit: number }>();
  for (const s of db.sales) {
    if (!inRange(s.at, start, end)) continue;
    for (const it of s.items) {
      const e = map.get(it.productId) ?? { name: it.name, qty: 0, revenue: 0, profit: 0 };
      e.qty += it.qty;
      e.revenue += it.unitPrice * it.qty - it.discount;
      e.profit += (it.unitPrice - it.unitCost) * it.qty - it.discount;
      map.set(it.productId, e);
    }
  }
  return [...map.entries()]
    .map(([id, e]) => ({ id, ...e, revenue: round2(e.revenue), profit: round2(e.profit) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

/** Revenue chart series whose granularity matches the selected period. */
export function revenueSeries(db: DB, key: PeriodKey): { label: string; value: number }[] {
  const r = periodRange(key, new Date());
  const buckets: { label: string; from: number; to: number }[] = [];

  if (key === "today") {
    for (let h = 0; h <= r.end.getHours(); h++) {
      const from = new Date(r.start);
      from.setHours(h, 0, 0, 0);
      buckets.push({
        label: `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`,
        from: from.getTime(),
        to: from.getTime() + 3599999,
      });
    }
  } else if (key === "weekly") {
    for (let i = 0; i < 7; i++) {
      const d = new Date(r.start);
      d.setDate(d.getDate() + i);
      const from = startOfDay(new Date(d));
      buckets.push({
        label: d.toLocaleDateString("en-US", { weekday: "short" }),
        from: from.getTime(),
        to: from.getTime() + 86399999,
      });
    }
  } else if (key === "monthly") {
    const dom = r.end.getDate();
    for (let i = 1; i <= dom; i++) {
      const d = new Date(r.start);
      d.setDate(i);
      const from = startOfDay(new Date(d));
      buckets.push({ label: `${i}`, from: from.getTime(), to: from.getTime() + 86399999 });
    }
  } else if (key === "yearly") {
    for (let m = 0; m <= r.end.getMonth(); m++) {
      const d = new Date(r.start.getFullYear(), m, 1);
      const to = new Date(r.start.getFullYear(), m + 1, 1).getTime() - 1;
      buckets.push({ label: d.toLocaleDateString("en-US", { month: "short" }), from: d.getTime(), to });
    }
  } else {
    let min = Date.now();
    for (const s of db.sales) min = Math.min(min, new Date(s.at).getTime());
    const startM = new Date(min);
    startM.setDate(1);
    startM.setHours(0, 0, 0, 0);
    const nowM = new Date(r.end.getFullYear(), r.end.getMonth(), 1);
    const months: Date[] = [];
    for (let d = new Date(startM); d <= nowM; d.setMonth(d.getMonth() + 1)) months.push(new Date(d));
    for (const d of months.slice(-18)) {
      const to = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() - 1;
      buckets.push({
        label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        from: d.getTime(),
        to,
      });
    }
  }

  return buckets.map((b) => {
    const value = round2(
      db.sales
        .filter((s) => {
          const t = new Date(s.at).getTime();
          return t >= b.from && t <= b.to;
        })
        .reduce((sum, s) => sum + s.total, 0)
    );
    return { label: b.label, value };
  });
}
