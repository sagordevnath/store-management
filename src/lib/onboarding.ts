import type { BusinessPreset, Category, DB, Product } from "../types";
import { uid } from "./helpers";

export interface PresetDef {
  key: Exclude<BusinessPreset, null>;
  label: string;
  emoji: string;
  blurb: string;
  target: number;
  currency?: string;
  categories: { name: string; icon: string; children?: { name: string; icon: string }[] }[];
  products: { name: string; cat: string; price: number; cost: number; unit: string; stock: number }[];
}

export const PRESETS: PresetDef[] = [
  {
    key: "grocery",
    label: "Grocery",
    emoji: "🛒",
    blurb: "Rice, oil, snacks, household goods — sell by piece, kg or dozen.",
    target: 150000,
    categories: [
      { name: "Rice & Grains", icon: "🍚", children: [{ name: "Rice", icon: "🍚" }, { name: "Flour", icon: "🌾" }, { name: "Lentils", icon: "🫘" }] },
      { name: "Oil & Ghee", icon: "🫒" },
      { name: "Snacks", icon: "🍪", children: [{ name: "Biscuits", icon: "🍪" }, { name: "Chips", icon: "🥔" }] },
      { name: "Beverages", icon: "🥤" },
      { name: "Household", icon: "🧹" },
    ],
    products: [
      { name: "Miniket Rice 5kg", cat: "Rice", price: 340, cost: 310, unit: "bag", stock: 24 },
      { name: "Soyabean Oil 2L", cat: "Oil & Ghee", price: 375, cost: 352, unit: "bottle", stock: 18 },
      { name: "Lentil (Masoor) 1kg", cat: "Lentils", price: 128, cost: 112, unit: "kg", stock: 30 },
      { name: "Butter Cookies 120g", cat: "Biscuits", price: 45, cost: 36, unit: "pkt", stock: 60 },
      { name: "Potato Chips 25g", cat: "Chips", price: 12, cost: 9, unit: "pkt", stock: 120 },
      { name: "Soft Drink 1L", cat: "Beverages", price: 90, cost: 78, unit: "bottle", stock: 36 },
      { name: "Dish Wash 500ml", cat: "Household", price: 140, cost: 118, unit: "bottle", stock: 20 },
    ],
  },
  {
    key: "pharmacy",
    label: "Pharmacy",
    emoji: "💊",
    blurb: "Medicines with batch + expiry tracking, OTC and baby care.",
    target: 200000,
    categories: [
      { name: "Tablets", icon: "💊", children: [{ name: "Antibiotic", icon: "💊" }, { name: "Pain Relief", icon: "🤕" }] },
      { name: "Syrup", icon: "🧴" },
      { name: "OTC", icon: "🩹", children: [{ name: "First Aid", icon: "🩹" }, { name: "Vitamins", icon: "🍊" }] },
      { name: "Baby Care", icon: "🍼" },
      { name: "Surgical", icon: "🧤" },
    ],
    products: [
      { name: "Paracetamol 500mg (strip)", cat: "Pain Relief", price: 30, cost: 22, unit: "strip", stock: 80 },
      { name: "Azithro 500 (strip)", cat: "Antibiotic", price: 120, cost: 95, unit: "strip", stock: 40 },
      { name: "Cough Syrup 100ml", cat: "Syrup", price: 110, cost: 88, unit: "bottle", stock: 25 },
      { name: "Vitamin C 500mg", cat: "Vitamins", price: 90, cost: 70, unit: "tube", stock: 35 },
      { name: "Bandage Roll", cat: "First Aid", price: 35, cost: 25, unit: "pc", stock: 50 },
      { name: "Baby Diaper (M)", cat: "Baby Care", price: 320, cost: 290, unit: "pkt", stock: 22 },
      { name: "Hand Gloves (pair)", cat: "Surgical", price: 15, cost: 10, unit: "pair", stock: 100 },
    ],
  },
  {
    key: "electronics",
    label: "Electronics",
    emoji: "🔌",
    blurb: "Gadgets with warranty months and IMEI/serial notes.",
    target: 400000,
    categories: [
      { name: "Mobiles", icon: "📱", children: [{ name: "Smartphones", icon: "📱" }, { name: "Feature Phones", icon: "☎️" }] },
      { name: "Accessories", icon: "🎧", children: [{ name: "Chargers", icon: "🔌" }, { name: "Earbuds", icon: "🎧" }] },
      { name: "Home Appliance", icon: "🧺", children: [{ name: "Fans", icon: "🌀" }, { name: "Irons", icon: "👕" }] },
      { name: "TV & Audio", icon: "📺" },
    ],
    products: [
      { name: "Smartphone 6.6\" 4/64", cat: "Smartphones", price: 15499, cost: 14200, unit: "pc", stock: 8 },
      { name: "Feature Phone Dual SIM", cat: "Feature Phones", price: 2150, cost: 1900, unit: "pc", stock: 15 },
      { name: "Type-C Charger 20W", cat: "Chargers", price: 850, cost: 650, unit: "pc", stock: 30 },
      { name: "TWS Earbuds", cat: "Earbuds", price: 1650, cost: 1250, unit: "box", stock: 20 },
      { name: "Ceiling Fan 56\"", cat: "Fans", price: 3450, cost: 3050, unit: "pc", stock: 12 },
      { name: "Dry Iron 1000W", cat: "Irons", price: 1250, cost: 1050, unit: "pc", stock: 14 },
      { name: "LED TV 32\"", cat: "TV & Audio", price: 22500, cost: 20500, unit: "pc", stock: 5 },
    ],
  },
  {
    key: "fashion",
    label: "Fashion",
    emoji: "👗",
    blurb: "Clothing and shoes with size/color notes and season sales.",
    target: 180000,
    categories: [
      { name: "Men", icon: "👔", children: [{ name: "Shirts", icon: "👔" }, { name: "Pants", icon: "👖" }, { name: "Panjabi", icon: "🧵" }] },
      { name: "Women", icon: "👗", children: [{ name: "Saree", icon: "🥻" }, { name: "Salwar Kameez", icon: "👗" }, { name: "Three Piece", icon: "🧥" }] },
      { name: "Kids", icon: "🧒" },
      { name: "Shoes", icon: "👟" },
      { name: "Accessories", icon: "👜" },
    ],
    products: [
      { name: "Men's Formal Shirt", cat: "Shirts", price: 1450, cost: 1100, unit: "pc", stock: 25 },
      { name: "Cotton Pant", cat: "Pants", price: 1690, cost: 1300, unit: "pc", stock: 20 },
      { name: "Eid Panjabi", cat: "Panjabi", price: 2250, cost: 1750, unit: "pc", stock: 18 },
      { name: "Half Silk Saree", cat: "Saree", price: 2850, cost: 2200, unit: "pc", stock: 12 },
      { name: "Ladies Three Piece", cat: "Three Piece", price: 1980, cost: 1500, unit: "set", stock: 16 },
      { name: "Kids T-Shirt", cat: "Kids", price: 450, cost: 320, unit: "pc", stock: 40 },
      { name: "Sneakers", cat: "Shoes", price: 2350, cost: 1850, unit: "pair", stock: 14 },
    ],
  },
  {
    key: "wholesale",
    label: "Wholesale",
    emoji: "📦",
    blurb: "Bulk cartons, tier pricing for retail/wholesale/distributor buyers.",
    target: 600000,
    categories: [
      { name: "Staples", icon: "🌾", children: [{ name: "Rice", icon: "🍚" }, { name: "Atta", icon: "🌾" }, { name: "Sugar", icon: "🍬" }] },
      { name: "Edible Oil", icon: "🛢️" },
      { name: "Beverages (Crates)", icon: "🥤" },
      { name: "Confectionery", icon: "🍬" },
      { name: "Detergents", icon: "🧴" },
    ],
    products: [
      { name: "Miniket Rice 50kg", cat: "Rice", price: 3350, cost: 3150, unit: "bag", stock: 60 },
      { name: "Atta 25kg", cat: "Atta", price: 1180, cost: 1090, unit: "bag", stock: 45 },
      { name: "Sugar 25kg", cat: "Sugar", price: 3120, cost: 2980, unit: "bag", stock: 30 },
      { name: "Soyabean Oil 16L tin", cat: "Edible Oil", price: 2980, cost: 2840, unit: "tin", stock: 40 },
      { name: "Soft Drink Crate (12×1L)", cat: "Beverages (Crates)", price: 1020, cost: 930, unit: "crate", stock: 55 },
      { name: "Detergent Carton (24)", cat: "Detergents", price: 2280, cost: 2080, unit: "carton", stock: 25 },
      { name: "Candy Jar 60pc", cat: "Confectionery", price: 560, cost: 470, unit: "jar", stock: 48 },
    ],
  },
];

export function presetById(key: BusinessPreset): PresetDef | null {
  return PRESETS.find((p) => p.key === key) ?? null;
}

/**
 * Apply a preset: adds categories + products on top of the current DB
 * (idempotent-ish: skips products whose name already exists) and bumps the
 * monthly target. Does NOT touch sales/customers/purchases.
 */
export function applyPreset(db: DB, key: Exclude<BusinessPreset, null>, ownerName: string): DB {
  const def = presetById(key);
  if (!def) return db;

  const byName = new Map(db.categories.map((c) => [c.name, c]));
  const now = new Date().toISOString();

  const nextCats = [...db.categories];
  const ensureCat = (name: string, icon: string, parentId: string | null): string => {
    const found = byName.get(name);
    if (found) return found.id;
    const c: Category = { id: uid("cat"), name, parentId, icon, createdAt: now };
    nextCats.push(c);
    byName.set(name, c);
    return c.id;
  };

  for (const root of def.categories) {
    const rootId = ensureCat(root.name, root.icon, null);
    for (const child of root.children ?? []) ensureCat(child.name, child.icon, rootId);
  }

  const newProducts: Product[] = [];
  for (const p of def.products) {
    if (db.products.some((x) => x.name === p.name)) continue;
    const catId = byName.get(p.cat)?.id ?? null;
    newProducts.push({
      id: uid("p"),
      name: p.name,
      sku: `${key.slice(0, 3).toUpperCase()}-${String(db.products.length + newProducts.length + 1).padStart(4, "0")}`,
      categoryId: catId,
      price: p.price,
      cost: p.cost,
      stock: p.stock,
      lowStockAt: Math.max(3, Math.round(p.stock * 0.15)),
      unit: p.unit,
      createdAt: now,
      forRetailSale: true,
      lowStockAlert: true,
      vatIncluded: false,
      discountable: true,
      warrantyMonths: key === "electronics" ? 12 : 0,
      trackExpiry: key === "pharmacy",
      image: null,
      description: "",
      barcode: "",
    });
  }

  return {
    ...db,
    categories: nextCats,
    products: [...newProducts, ...db.products],
    onboarding: key,
    settings: { ...db.settings, monthlyTarget: def.target, ownerName: db.settings.ownerName || ownerName },
  };
}
