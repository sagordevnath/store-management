import type { Category, DB, Product } from "../types";
import { round2 } from "./helpers";

/* ============================ Constants ============================ */

/** Pseudo-category shown in reports/filters for products with no category. */
export const UNCATEGORIZED_ID = "__uncategorized__";

export interface CategoryNode extends Category {
  depth: number;
  path: string[]; // names root → this node
  childCount: number; // direct children
  productCount: number; // products in this category + descendants
  stockValue: number; // Σ stock × cost (subtree)
  sales30d: number; // revenue last 30 days (subtree)
}

/* ============================ buildTree ============================ */

export function buildTree(db: DB): CategoryNode[] {
  const productsByCat = new Map<string, Product[]>();
  for (const p of db.products) {
    if (!p.categoryId) continue;
    const list = productsByCat.get(p.categoryId) ?? [];
    list.push(p);
    productsByCat.set(p.categoryId, list);
  }

  const hasUncategorized = db.products.some((p) => !p.categoryId);

  const all: Category[] = [
    ...db.categories.map((c) =>
      // reparent orphans/ghost parents to root
      c.parentId && !db.categories.some((x) => x.id === c.parentId)
        ? { ...c, parentId: null }
        : c,
    ),
    ...(hasUncategorized
      ? [
          {
            id: UNCATEGORIZED_ID,
            name: "Uncategorized",
            parentId: null,
            icon: "❓",
            createdAt: new Date(0).toISOString(),
          },
        ]
      : []),
  ];

  const childrenOf = new Map<string | null, Category[]>();
  for (const c of all) {
    const list = childrenOf.get(c.parentId) ?? [];
    list.push(c);
    childrenOf.set(c.parentId, list);
  }

  const out: CategoryNode[] = [];
  const visited = new Set<string>();
  const walk = (parent: string | null, depth: number, path: string[]) => {
    for (const c of childrenOf.get(parent) ?? []) {
      if (visited.has(c.id)) continue; // cycle guard
      visited.add(c.id);
      const own = productsByCat.get(c.id) ?? [];
      const node: CategoryNode = {
        ...c,
        depth,
        path: [...path, c.name],
        childCount: (childrenOf.get(c.id) ?? []).length,
        productCount: own.length,
        stockValue: round2(own.reduce((s, p) => s + p.stock * p.cost, 0)),
        sales30d: 0,
      };
      out.push(node);
      walk(c.id, depth + 1, node.path);
    }
  };
  walk(null, 0, []);

  // Per-node "own" 30-day revenue, then bubble sums up (reverse DFS).
  const since = new Date(Date.now() - 29 * 86_400_000);
  since.setHours(0, 0, 0, 0);
  const ownSales = new Map<string, number>();
  for (const s of db.sales) {
    if (new Date(s.at) < since) continue;
    for (const item of s.items) {
      const p = db.products.find((x) => x.id === item.productId);
      if (!p?.categoryId) continue;
      ownSales.set(p.categoryId, (ownSales.get(p.categoryId) ?? 0) + (item.unitPrice * item.qty - item.discount));
    }
  }
  const byId = new Map(out.map((n) => [n.id, n]));
  for (let i = out.length - 1; i >= 0; i--) {
    const node = out[i];
    node.sales30d = round2(node.sales30d + (ownSales.get(node.id) ?? 0));
    if (node.parentId) {
      const parent = byId.get(node.parentId);
      if (parent) {
        parent.productCount += node.productCount;
        parent.stockValue = round2(parent.stockValue + node.stockValue);
        parent.sales30d = round2(parent.sales30d + node.sales30d);
      }
    }
  }
  return out;
}

/* ============================ Lookups ============================ */

export function subtreeIds(db: DB, rootId: string): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const c of db.categories) {
    if (!c.parentId) continue;
    const list = childrenOf.get(c.parentId) ?? [];
    list.push(c.id);
    childrenOf.set(c.parentId, list);
  }
  const ids = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    if (ids.has(id)) continue;
    ids.add(id);
    for (const child of childrenOf.get(id) ?? []) stack.push(child);
  }
  return ids;
}

export function subtreeNodes(db: DB, rootId: string): Category[] {
  const ids = subtreeIds(db, rootId);
  return db.categories.filter((c) => ids.has(c.id));
}

/** Product ids whose category is in the given subtree. */
export function productsInSubtree(db: DB, rootId: string): Set<string> {
  const ids = subtreeIds(db, rootId);
  return new Set(db.products.filter((p) => p.categoryId && ids.has(p.categoryId)).map((p) => p.id));
}

export function categoryPathLabel(db: DB, categoryId: string | null): string {
  if (!categoryId) return "Uncategorized";
  if (categoryId === UNCATEGORIZED_ID) return "Uncategorized";
  const rows = buildTree(db);
  const node = rows.find((n) => n.id === categoryId);
  return node ? node.path.join(" › ") : "Uncategorized";
}

/** Re-parent guard: target must not be the node itself or any of its descendants. */
export function canMoveUnder(db: DB, moveId: string, newParentId: string | null): boolean {
  if (newParentId === null) return true;
  if (newParentId === moveId) return false;
  return !subtreeIds(db, moveId).has(newParentId);
}

/* ============================ AI suggestion ============================ */

const tokenize = (s: string): string[] =>
  s
    .toLowerCase()
    .split(/[^a-z0-9à-ɏ\u0980-\u09FF]+/)
    .filter((t) => t.length > 1);

/**
 * Suggest the best category for a product name by matching its tokens against
 * each category's vocabulary (category name + names of products in its subtree).
 * Deepest best-scoring node wins; returns null when nothing matches.
 */
export function suggestCategory(db: DB, name: string): string | null {
  const tree = buildTree(db);
  const tokens = new Set(tokenize(name));
  if (!tokens.size || !tree.length) return null;

  const vocabPerNode = tree.map((node) => {
    const words = new Set<string>(tokenize(node.name));
    for (const p of db.products) {
      if (p.categoryId && subtreeIds(db, node.id).has(p.categoryId)) {
        for (const t of tokenize(p.name)) words.add(t);
      }
    }
    return { node, words };
  });

  let best: { id: string; score: number; depth: number } | null = null;
  for (const { node, words } of vocabPerNode) {
    let score = 0;
    for (const t of tokens) if (words.has(t)) score++;
    if (score === 0) continue;
    if (!best || score > best.score || (score === best.score && node.depth > best.depth)) {
      best = { id: node.id, score, depth: node.depth };
    }
  }
  return best && best.id !== UNCATEGORIZED_ID ? best.id : null;
}

/* ============================ Category report ============================ */

export interface CategoryReportRow {
  id: string;
  label: string; // full path
  icon: string;
  revenue: number;
  cost: number;
  profit: number;
  margin: number; // %
  units: number;
  orders: number;
  stockValue: number;
}

export function categoryReport(
  db: DB,
  sinceDays: number | "all",
  range?: { start: Date; end: Date }
): CategoryReportRow[] {
  const tree = buildTree(db);
  let since: Date;
  let until: Date | null = null;
  if (range) {
    // Explicit calendar range (used by the period-bound Reports page)
    since = range.start;
    until = range.end;
  } else if (sinceDays === "all") {
    since = new Date(0);
  } else {
    const d = new Date(Date.now() - (sinceDays - 1) * 86_400_000);
    d.setHours(0, 0, 0, 0);
    since = d;
  }

  // attribute each sale line to its product's own category
  const stats = new Map<string, { revenue: number; cost: number; units: number; orders: Set<string> }>();
  for (const s of db.sales) {
    if (new Date(s.at) < since) continue;
    if (until && new Date(s.at) > until) continue;
    for (const item of s.items) {
      const p = db.products.find((x) => x.id === item.productId);
      if (!p?.categoryId) continue;
      const cur = stats.get(p.categoryId) ?? { revenue: 0, cost: 0, units: 0, orders: new Set<string>() };
      cur.revenue += item.unitPrice * item.qty - item.discount;
      cur.cost += p.cost * item.qty;
      cur.units += item.qty;
      cur.orders.add(s.id);
      stats.set(p.categoryId, cur);
    }
  }

  const rows: CategoryReportRow[] = tree.map((node) => {
    const st = stats.get(node.id);
    const revenue = round2(st?.revenue ?? 0);
    const cost = round2(st?.cost ?? 0);
    return {
      id: node.id,
      label: node.path.join(" › "),
      icon: node.icon,
      revenue,
      cost,
      profit: round2(revenue - cost),
      margin: revenue > 0 ? Math.round(((revenue - cost) / revenue) * 100) : 0,
      units: st?.units ?? 0,
      orders: st?.orders.size ?? 0,
      stockValue: node.stockValue,
    };
  });
  return rows.filter((r) => r.revenue > 0 || r.units > 0 || r.stockValue > 0).sort((a, b) => b.revenue - a.revenue);
}
