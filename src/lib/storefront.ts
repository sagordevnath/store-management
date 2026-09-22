import type { DB, Product, StorefrontOrder, StorefrontSettings } from "../types";
import { round2, uid } from "./helpers";

export function shopLink(settings: StorefrontSettings): string {
  const base = window.location.origin + window.location.pathname;
  return `${base}#shop/${settings.slug}`;
}

export function storefrontOpen(db: DB): boolean {
  return db.storefront?.enabled === true;
}

export function catalogFor(db: DB): { product: Product; category: string }[] {
  const cats = new Map(db.categories.map((c) => [c.id, c.name]));
  const visible = db.storefront.visibleCategoryIds;
  return db.products
    .filter((p) => p.forRetailSale !== false && p.stock > 0)
    .filter((p) => !visible || visible.length === 0 || visible.includes(p.categoryId ?? ""))
    .map((p) => ({ product: p, category: p.categoryId ? cats.get(p.categoryId) ?? "Other" : "Other" }));
}

/** Intake a customer order: creates the order record; stock decrements when accepted. */
export function placeStorefrontOrder(db: DB, args: {
  customerName: string;
  phone: string;
  address: string;
  note: string;
  items: { productId: string; qty: number }[];
}): { ok: true; order: StorefrontOrder } | { ok: false; error: string } {
  if (!storefrontOpen(db)) return { ok: false, error: "This shop is not accepting online orders right now." };
  if (!args.customerName.trim() || !args.phone.trim()) return { ok: false, error: "Name and phone are required." };

  const items: StorefrontOrder["items"] = [];
  for (const line of args.items) {
    const p = db.products.find((x) => x.id === line.productId);
    if (!p || line.qty <= 0) continue;
    if (line.qty > p.stock) return { ok: false, error: `Only ${p.stock} ${p.unit} of ${p.name} left in stock.` };
    items.push({ productId: p.id, name: p.name, price: p.price, qty: line.qty });
  }
  if (items.length === 0) return { ok: false, error: "Your cart is empty." };

  const goods = round2(items.reduce((s, it) => s + it.price * it.qty, 0));
  const total = round2(goods + (db.storefront.deliveryFee || 0));

  if (total < (db.storefront.minOrder || 0)) {
    return { ok: false, error: `Minimum order is ${db.storefront.minOrder}.` };
  }

  const order: StorefrontOrder = {
    id: uid("sfo"),
    at: new Date().toISOString(),
    customerName: args.customerName.trim(),
    phone: args.phone.trim(),
    address: args.address.trim(),
    items,
    total,
    status: "New",
    note: args.note,
  };
  return { ok: true, order };
}

/** Owner accepts an order → convert to a real sale (stock + revenue) and mark delivered flow. */
export function acceptStorefrontOrder(db: DB, orderId: string, cashier: string): { db: DB; invoiceNo: string | null } {
  const order = db.storefrontOrders.find((o) => o.id === orderId);
  if (!order || order.status !== "New") return { db, invoiceNo: null };

  const subtotal = round2(order.items.reduce((s, it) => s + it.price * it.qty, 0));
  const costTotal = round2(
    order.items.reduce((s, it) => {
      const p = db.products.find((x) => x.id === it.productId);
      return s + (p?.cost ?? 0) * it.qty;
    }, 0),
  );
  const deliveryFee = round2(order.total - subtotal);
  let max = 1000;
  for (const s of db.sales) {
    const m = /^INV-(\d+)$/.exec(s.invoiceNo);
    if (m) max = Math.max(max, parseInt(m[1]!, 10));
  }

  const sale = {
    id: uid("sale"),
    invoiceNo: `INV-${max + 1}`,
    at: new Date().toISOString(),
    items: order.items.map((it) => ({
      productId: it.productId,
      name: it.name,
      unitPrice: it.price,
      unitCost: db.products.find((x) => x.id === it.productId)?.cost ?? 0,
      qty: it.qty,
      discount: 0,
    })),
    subtotal,
    discount: 0,
    tax: 0,
    shipping: deliveryFee,
    total: order.total,
    costTotal,
    profit: round2(order.total - costTotal),
    payment: "Cash" as const,
    customerId: db.customers.find((c) => c.phone === order.phone)?.id ?? null,
    note: `Online order from ${order.customerName} (${order.phone})`,
    cashier,
    status: "Paid" as const,
    paidAmount: order.total,
    signature: null,
    delivery: null,
  };

  const products = db.products.map((p) => {
    const line = order.items.find((it) => it.productId === p.id);
    return line ? { ...p, stock: Math.max(0, p.stock - line.qty) } : p;
  });

  return {
    db: {
      ...db,
      products,
      sales: [sale, ...db.sales],
      storefrontOrders: db.storefrontOrders.map((o) => (o.id === orderId ? { ...o, status: "Accepted" } : o)),
    },
    invoiceNo: sale.invoiceNo,
  };
}

export function setOrderStatus(db: DB, orderId: string, status: StorefrontOrder["status"]): DB {
  return { ...db, storefrontOrders: db.storefrontOrders.map((o) => (o.id === orderId ? { ...o, status } : o)) };
}
