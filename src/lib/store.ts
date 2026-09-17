import type {
  DB,
  Product,
  Sale,
  Purchase,
  Customer,
  Supplier,
  Expense,
  Settings,
  PaymentMethod,
  SaleItem,
  StaffMember,
  Category,
} from "../types";
import { uid, round2, dayKey, startOfDay } from "./helpers";
import { buildSeedDB } from "./seed";
import { subtreeIds } from "./categories";
import { customerLocation, initDelivery, stepDelivery } from "./delivery";

const KEY = "Managix_db_v1";

export function loadDB(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DB;
      if (parsed && Array.isArray(parsed.products) && Array.isArray(parsed.sales)) {
        return migrateDB(parsed);
      }
    }
  } catch {
    /* fall through to seed */
  }
  const db = buildSeedDB();
  saveDB(db);
  return db;
}

const LEGACY_CATEGORY_MAP: Record<string, string> = {
  Groceries: "gro",
  Dairy: "dai",
  Beverages: "bev",
  Snacks: "sn",
  Household: "hou",
  "Personal Care": "pc",
  Electronics: "ele",
};

/**
 * Brings a Phase-1 (or partially synced) document up to the Phase-2 schema:
 * categories, subscription, sub invoices and the extended settings fields.
 * Preserves all existing business data.
 */
export function migrateDB(db: DB): DB {
  const needsCategories = !Array.isArray(db.categories) || db.categories.length === 0;
  const needsSubscription = !db.subscription || !db.subscription.currentPeriodEnd;
  const needsSettings =
    !db.settings || typeof (db.settings as { monthlyTarget?: number }).monthlyTarget !== "number";
  const hasLegacyCategory = db.products.some((p) => (p as unknown as { category?: string }).category);
  const needsProductFields = db.products.some(
    (p) =>
      (p as Partial<Product>).forRetailSale === undefined ||
      (p as Partial<Product>).lowStockAlert === undefined ||
      (p as Partial<Product>).vatIncluded === undefined ||
      (p as Partial<Product>).discountable === undefined
  );

  if (!needsCategories && !needsSubscription && !needsSettings && !hasLegacyCategory && !needsProductFields) return db;

  const seed = buildSeedDB();
  const migrated: DB = {
    ...seed,
    ...db,
    products: db.products.map((p) => {
      const legacy = (p as unknown as { category?: string }).category;
      const withCategory = p.categoryId ? p : { ...p, categoryId: (legacy && LEGACY_CATEGORY_MAP[legacy]) || null };
      return {
        forRetailSale: true,
        lowStockAlert: true,
        vatIncluded: false,
        discountable: true,
        warrantyMonths: 0,
        image: null,
        description: "",
        barcode: "",
        ...withCategory,
      };
    }),
    categories: needsCategories || db.categories.length === 0 ? seed.categories : db.categories,
    subscription: needsSubscription ? seed.subscription : db.subscription,
    subInvoices: Array.isArray(db.subInvoices) ? db.subInvoices : [],
    settings: needsSettings
      ? { ...seed.settings, ...db.settings, monthlyTarget: 6000, branches: db.settings?.branches ?? 1 }
      : db.settings,
  };
  saveDB(migrated);
  return migrated;
}

export function saveDB(db: DB) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* storage full or unavailable */
  }
}

export function resetDB(): DB {
  const db = buildSeedDB();
  saveDB(db);
  return db;
}

/* ---------------- derived metrics ---------------- */

export interface Kpis {
  todayRevenue: number;
  todayProfit: number;
  todayOrders: number;
  monthRevenue: number;
  monthProfit: number;
  inventoryValue: number;
  dueFromCustomers: number;
  dueToSuppliers: number;
  cashOnHand: number;
  lowStockCount: number;
}

export function computeKpis(db: DB): Kpis {
  const today = dayKey(new Date().toISOString());
  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}`;

  let todayRevenue = 0,
    todayProfit = 0,
    todayOrders = 0,
    monthRevenue = 0,
    monthProfit = 0,
    cashOnHand = 0,
    dueFromCustomers = 0,
    dueToSuppliers = 0;

  for (const s of db.sales) {
    const k = dayKey(s.at);
    if (k === today) {
      todayRevenue += s.total;
      todayProfit += s.profit;
      todayOrders += 1;
    }
    if (s.at.startsWith(monthPrefix)) {
      monthRevenue += s.total;
      monthProfit += s.profit;
    }
    const outstanding = s.total - s.paidAmount;
    if (outstanding > 0.009) {
      if (s.payment === "Due") dueFromCustomers += outstanding;
    }
    cashOnHand += s.paidAmount;
  }
  for (const p of db.purchases) {
    const outstanding = p.total - p.paidAmount;
    if (outstanding > 0.009) dueToSuppliers += outstanding;
    cashOnHand -= p.paidAmount;
  }
  for (const e of db.expenses) {
    cashOnHand -= e.amount;
  }

  const inventoryValue = db.products.reduce((s, p) => s + p.stock * p.cost, 0);
  const lowStockCount = db.products.filter((p) => p.stock <= p.lowStockAt).length;

  return {
    todayRevenue: round2(todayRevenue),
    todayProfit: round2(todayProfit),
    todayOrders,
    monthRevenue: round2(monthRevenue),
    monthProfit: round2(monthProfit),
    inventoryValue: round2(inventoryValue),
    dueFromCustomers: round2(dueFromCustomers),
    dueToSuppliers: round2(dueToSuppliers),
    cashOnHand: round2(cashOnHand),
    lowStockCount,
  };
}

export function customerDue(db: DB, customerId: string, openingDue = 0): number {
  let due = openingDue;
  for (const s of db.sales) {
    if (s.customerId === customerId && s.payment === "Due") {
      due += s.total - s.paidAmount;
    }
  }
  return round2(due);
}

export function customerDueList(db: DB, customerId: string) {
  return db.sales
    .filter((s) => s.customerId === customerId && s.payment === "Due" && s.total - s.paidAmount > 0.009)
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

export function supplierDue(db: DB, supplierId: string): number {
  let due = 0;
  for (const p of db.purchases) {
    if (p.supplierId === supplierId && p.payment === "Due") {
      due += p.total - p.paidAmount;
    }
  }
  return round2(due);
}

export function revenueByDay(db: DB, days: number): { label: string; value: number; profit: number }[] {
  const out: { label: string; value: number; profit: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dayKey(d.toISOString());
    const daySales = db.sales.filter((s) => dayKey(s.at) === key);
    out.push({
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value: round2(daySales.reduce((s, x) => s + x.total, 0)),
      profit: round2(daySales.reduce((s, x) => s + x.profit, 0)),
    });
  }
  return out;
}

export function topProducts(db: DB, days: number, limit = 6) {
  const since = startOfDay(new Date(Date.now() - (days - 1) * 86400000));
  const map = new Map<string, { name: string; qty: number; revenue: number; profit: number }>();
  for (const s of db.sales) {
    if (new Date(s.at) < since) continue;
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

export function categoryBreakdown(db: DB, days: number) {
  const since = startOfDay(new Date(Date.now() - (days - 1) * 86400000));
  const byId = new Map(db.products.map((p) => [p.id, p]));
  const cats = new Map(db.categories.map((c) => [c.id, c]));
  const map = new Map<string, number>();
  for (const s of db.sales) {
    if (new Date(s.at) < since) continue;
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

export function expenseBreakdown(db: DB, days: number) {
  const since = startOfDay(new Date(Date.now() - (days - 1) * 86400000));
  const map = new Map<string, number>();
  for (const e of db.expenses) {
    if (new Date(e.at) < since) continue;
    map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
  }
  return [...map.entries()]
    .map(([category, value]) => ({ category, value: round2(value) }))
    .sort((a, b) => b.value - a.value);
}

/* ---------------- action creators ---------------- */

export interface CartLine {
  productId: string;
  name: string;
  unitPrice: number;
  qty: number;
  discount: number;
}

export function makeSale(db: DB, args: {
  items: CartLine[];
  payment: PaymentMethod;
  customerId: string | null;
  discount: number;
  taxRate: number;
  shipping: number;
  paidAmount: number;
  note: string;
  cashier: string;
  signature?: string | null;
}): { db: DB; sale: Sale } {
  const saleItems: SaleItem[] = args.items.map((l) => {
    const p = db.products.find((x) => x.id === l.productId)!;
    return {
      productId: l.productId,
      name: p.name,
      unitPrice: l.unitPrice,
      unitCost: p.cost,
      qty: l.qty,
      discount: l.discount,
    };
  });
  const lineDiscount = saleItems.reduce((s, it) => s + it.discount, 0);
  const subtotal = round2(saleItems.reduce((s, it) => s + it.unitPrice * it.qty, 0));
  const discount = round2(lineDiscount + args.discount);
  const tax = round2(((subtotal - discount) * args.taxRate) / 100);
  const total = round2(subtotal - discount + tax + args.shipping);
  const costTotal = round2(saleItems.reduce((s, it) => s + it.unitCost * it.qty, 0));
  const isDue = args.payment === "Due";
  const paidAmount = isDue ? Math.min(args.paidAmount, total) : total;

  const sale: Sale = {
    id: uid("sale"),
    invoiceNo: nextInvoiceNo(db),
    at: new Date().toISOString(),
    items: saleItems,
    subtotal,
    discount,
    tax,
    shipping: args.shipping,
    total,
    costTotal,
    profit: round2(total - costTotal),
    payment: args.payment,
    customerId: args.customerId,
    note: args.note,
    cashier: args.cashier,
    status: paidAmount >= total - 0.009 ? "Paid" : paidAmount > 0 ? "Partially Paid" : "Unpaid",
    paidAmount,
    signature: args.signature ?? null,
  };

  const products = db.products.map((p) => {
    const line = saleItems.find((it) => it.productId === p.id);
    if (!line) return p;
    return { ...p, stock: Math.max(0, p.stock - line.qty) };
  });

  return { db: { ...db, products, sales: [sale, ...db.sales] }, sale };
}

export function nextInvoiceNo(db: DB): string {
  let max = 1000;
  for (const s of db.sales) {
    const m = /^INV-(\d+)$/.exec(s.invoiceNo);
    if (m) max = Math.max(max, parseInt(m[1]!, 10));
  }
  return `INV-${max + 1}`;
}

export function makePurchase(db: DB, args: {
  supplierId: string | null;
  items: { productId: string; unitCost: number; qty: number }[];
  shipping: number;
  payment: "Paid" | "Due";
  paidAmount: number;
  note: string;
}): { db: DB; purchase: Purchase } {
  const items = args.items.map((l) => {
    const p = db.products.find((x) => x.id === l.productId)!;
    return { productId: p.id, name: p.name, unitCost: l.unitCost, qty: l.qty };
  });
  const subtotal = round2(items.reduce((s, it) => s + it.unitCost * it.qty, 0));
  const total = round2(subtotal + args.shipping);
  const isDue = args.payment === "Due";
  const paidAmount = isDue ? Math.min(args.paidAmount, total) : total;
  const purchase: Purchase = {
    id: uid("po"),
    refNo: nextRefNo(db),
    at: new Date().toISOString(),
    supplierId: args.supplierId,
    items,
    subtotal,
    shipping: args.shipping,
    total,
    payment: args.payment,
    paidAmount,
    note: args.note,
  };
  const products = db.products.map((p) => {
    const line = items.find((it) => it.productId === p.id);
    if (!line) return p;
    return { ...p, cost: line.unitCost, stock: p.stock + line.qty };
  });
  return { db: { ...db, products, purchases: [purchase, ...db.purchases] }, purchase };
}

export function nextRefNo(db: DB): string {
  let max = 5000;
  for (const p of db.purchases) {
    const m = /^PO-(\d+)$/.exec(p.refNo);
    if (m) max = Math.max(max, parseInt(m[1]!, 10));
  }
  return `PO-${max + 1}`;
}

export function collectDue(db: DB, saleId: string, amount: number): DB {
  const sales = db.sales.map((s) => {
    if (s.id !== saleId) return s;
    const paid = round2(Math.min(s.total, s.paidAmount + amount));
    return {
      ...s,
      paidAmount: paid,
      status: paid >= s.total - 0.009 ? "Paid" : paid > 0 ? "Partially Paid" : "Unpaid",
      payment: paid >= s.total - 0.009 ? "Cash" : s.payment,
    } as Sale;
  });
  return { ...db, sales };
}

export function paySupplier(db: DB, purchaseId: string, amount: number): DB {
  const purchases = db.purchases.map((p) => {
    if (p.id !== purchaseId) return p;
    const paid = round2(Math.min(p.total, p.paidAmount + amount));
    return { ...p, paidAmount: paid, payment: paid >= p.total - 0.009 ? "Paid" : "Due" } as Purchase;
  });
  return { ...db, purchases };
}

export function upsertProduct(db: DB, p: Product): DB {
  const exists = db.products.some((x) => x.id === p.id);
  const products = exists ? db.products.map((x) => (x.id === p.id ? p : x)) : [p, ...db.products];
  return { ...db, products };
}

export function deleteProduct(db: DB, id: string): DB {
  return { ...db, products: db.products.filter((p) => p.id !== id) };
}

export function upsertCustomer(db: DB, c: Customer): DB {
  const exists = db.customers.some((x) => x.id === c.id);
  const customers = exists ? db.customers.map((x) => (x.id === c.id ? c : x)) : [c, ...db.customers];
  return { ...db, customers };
}

export function deleteCustomer(db: DB, id: string): DB {
  return { ...db, customers: db.customers.filter((c) => c.id !== id) };
}

export function upsertSupplier(db: DB, s: Supplier): DB {
  const exists = db.suppliers.some((x) => x.id === s.id);
  const suppliers = exists ? db.suppliers.map((x) => (x.id === s.id ? s : x)) : [s, ...db.suppliers];
  return { ...db, suppliers };
}

export function deleteSupplier(db: DB, id: string): DB {
  return { ...db, suppliers: db.suppliers.filter((s) => s.id !== id) };
}

export function addExpense(db: DB, e: Expense): DB {
  return { ...db, expenses: [e, ...db.expenses] };
}

export function deleteExpense(db: DB, id: string): DB {
  return { ...db, expenses: db.expenses.filter((e) => e.id !== id) };
}

export function upsertStaff(db: DB, m: StaffMember): DB {
  const exists = db.staff.some((x) => x.id === m.id);
  const staff = exists ? db.staff.map((x) => (x.id === m.id ? m : x)) : [m, ...db.staff];
  return { ...db, staff };
}

export function deleteStaff(db: DB, id: string): DB {
  return { ...db, staff: db.staff.filter((m) => m.id !== id) };
}

export function updateSettings(db: DB, s: Settings): DB {
  return { ...db, settings: s };
}

export function restock(db: DB, productId: string, qty: number): DB {
  const products = db.products.map((p) => (p.id === productId ? { ...p, stock: p.stock + qty } : p));
  return { ...db, products };
}

/* ---------------- categories ---------------- */

export function upsertCategory(db: DB, c: Category): DB {
  const exists = db.categories.some((x) => x.id === c.id);
  const categories = exists ? db.categories.map((x) => (x.id === c.id ? c : x)) : [...db.categories, c];
  return { ...db, categories };
}

export function deleteCategory(db: DB, id: string): DB {
  // Products in the deleted subtree become uncategorized; children re-parent to the deleted node's parent.
  const ids = subtreeIds(db, id);
  const node = db.categories.find((c) => c.id === id);
  const categories = db.categories
    .filter((c) => !ids.has(c.id))
    .map((c) => (c.parentId && ids.has(c.parentId) ? { ...c, parentId: node?.parentId ?? null } : c));
  const products = db.products.map((p) => (p.categoryId && ids.has(p.categoryId) ? { ...p, categoryId: null } : p));
  return { ...db, categories, products };
}

export function updateSignature(db: DB, saleId: string, signature: string | null): DB {
  const sales = db.sales.map((s) => (s.id === saleId ? { ...s, signature } : s));
  return { ...db, sales };
}

export function startDelivery(db: DB, saleId: string, driver: string): { db: DB; sale: Sale } {
  const sale = db.sales.find((s) => s.id === saleId);
  if (!sale) return { db, sale: db.sales[0]! };
  const track = initDelivery(sale.id);
  track.driver = driver;
  const sales = db.sales.map((s) => (s.id === saleId ? { ...s, delivery: track } : s));
  return { db: { ...db, sales }, sale: { ...sale, delivery: track } };
}

export function advanceDelivery(db: DB, saleId: string): { db: DB; sale: Sale | null } {
  const sale = db.sales.find((s) => s.id === saleId);
  if (!sale?.delivery) return { db, sale: null };
  const target = customerLocation(sale.id);
  const track = stepDelivery(sale.delivery, target);
  const sales = db.sales.map((s) => (s.id === saleId ? { ...s, delivery: track } : s));
  return { db: { ...db, sales }, sale: { ...sale, delivery: track } };
}
