import type { Customer, DB, Expense, Product, Supplier, TrashItem } from "../types";
import { uid } from "./helpers";

export const TRASH_RETENTION_DAYS = 30;

export type TrashKind = TrashItem["kind"];

/** Capture the entity into the trash and remove it from its collection. */
export function softDelete(db: DB, kind: TrashKind, id: string, by: string): DB {
  const at = new Date().toISOString();
  let label = "";
  let sub = "";
  let payload: TrashItem["payload"] | undefined;

  const next: DB = { ...db };

  if (kind === "product") {
    const p = db.products.find((x) => x.id === id);
    if (!p) return db;
    payload = p;
    label = p.name;
    sub = p.sku;
    next.products = db.products.filter((x) => x.id !== id);
  } else if (kind === "customer") {
    const c = db.customers.find((x) => x.id === id);
    if (!c) return db;
    payload = c;
    label = c.name;
    sub = c.phone;
    next.customers = db.customers.filter((x) => x.id !== id);
  } else if (kind === "supplier") {
    const s = db.suppliers.find((x) => x.id === id);
    if (!s) return db;
    payload = s;
    label = s.name;
    sub = s.company || s.phone;
    next.suppliers = db.suppliers.filter((x) => x.id !== id);
  } else if (kind === "expense") {
    const e = db.expenses.find((x) => x.id === id);
    if (!e) return db;
    payload = e;
    label = e.description || e.category;
    sub = e.category;
    next.expenses = db.expenses.filter((x) => x.id !== id);
  } else if (kind === "sale") {
    const s = db.sales.find((x) => x.id === id);
    if (!s) return db;
    payload = s;
    label = s.invoiceNo;
    sub = `${s.items.length} item(s)`;
    next.sales = db.sales.filter((x) => x.id !== id);
  }

  if (!payload) return db;
  const item: TrashItem = {
    id: uid("trash"),
    deletedAt: at,
    deletedBy: by,
    kind,
    label,
    sub,
    payload: payload as Product | Customer | Supplier | Expense | (typeof db)["sales"][number],
  };
  next.trash = [item, ...db.trash];
  return next;
}

/** Return a deleted item to its collection. */
export function restore(db: DB, trashId: string): DB {
  const item = db.trash.find((t) => t.id === trashId);
  if (!item) return db;
  const next: DB = { ...db, trash: db.trash.filter((t) => t.id !== trashId) };
  const p = item.payload as { id: string };

  if (item.kind === "product") {
    if (db.products.some((x) => x.id === p.id)) return db; // already exists
    next.products = [item.payload as Product, ...db.products];
  } else if (item.kind === "customer") {
    if (!db.customers.some((x) => x.id === p.id)) next.customers = [item.payload as Customer, ...db.customers];
  } else if (item.kind === "supplier") {
    if (!db.suppliers.some((x) => x.id === p.id)) next.suppliers = [item.payload as Supplier, ...db.suppliers];
  } else if (item.kind === "expense") {
    if (!db.expenses.some((x) => x.id === p.id)) next.expenses = [item.payload as Expense, ...db.expenses];
  } else if (item.kind === "sale") {
    if (!db.sales.some((x) => x.id === p.id)) next.sales = [item.payload as (typeof db)["sales"][number], ...db.sales];
  }
  return next;
}

/** Permanently delete one trash item. */
export function purge(db: DB, trashId: string): DB {
  return { ...db, trash: db.trash.filter((t) => t.id !== trashId) };
}

/** Empty the bin of everything older than the retention window (call on load). */
export function purgeExpired(db: DB): DB {
  const cutoff = Date.now() - TRASH_RETENTION_DAYS * 86400000;
  const keep = db.trash.filter((t) => new Date(t.deletedAt).getTime() >= cutoff);
  return keep.length === db.trash.length ? db : { ...db, trash: keep };
}

export function daysLeft(deletedAt: string): number {
  return Math.max(0, TRASH_RETENTION_DAYS - Math.floor((Date.now() - new Date(deletedAt).getTime()) / 86400000));
}

export const KIND_ICON: Record<TrashKind, string> = {
  product: "📦",
  customer: "👤",
  supplier: "🏭",
  expense: "💸",
  sale: "🧾",
};

export const KIND_LABEL: Record<TrashKind, string> = {
  product: "Product",
  customer: "Customer",
  supplier: "Supplier",
  expense: "Expense",
  sale: "Sale",
};
