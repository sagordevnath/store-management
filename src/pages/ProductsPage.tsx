import { useMemo, useRef, useState } from "react";
import { useApp } from "../App";
import type { Product } from "../types";
import { upsertProduct, deleteProduct, restock } from "../lib/store";
import { fmtMoney, uid, round2, downloadCSV, classNames } from "../lib/helpers";
import { hasFeature, limitFor } from "../lib/plans";
import { buildTree, categoryPathLabel, productsInSubtree, suggestCategory, UNCATEGORIZED_ID } from "../lib/categories";
import { Badge, Button, Card, CategoryChips, Field, LockedCard, Modal, NumberInput, Select, TextInput, TextArea, Toggle, useToast, Th, Td } from "../ui";
import { IcPlus, IcSearch, IcEdit, IcTrash, IcDownload, IcBox } from "../icons";

const UNITS = ["pcs", "kg", "g", "litre", "ml", "box", "pack", "bag", "bottle", "dozen", "set", "unit"];

export default function ProductsPage() {
  const { db, update, currency, navigate } = useApp();
  const toast = useToast();
  const sub = db.subscription;
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out">("all");
  const [editing, setEditing] = useState<Product | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null);
  const [restockFor, setRestockFor] = useState<Product | null>(null);
  const [restockQty, setRestockQty] = useState(10);

  const showChips = hasFeature(sub, "categories_nested");
  const allowedIds = useMemo(() => (cat ? productsInSubtree(db, cat) : null), [db, cat]);
  const productLimit = limitFor(sub, "products");
  const atLimit = db.products.length >= productLimit;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.products
      .filter((p) => {
        if (q && !p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q) && !(p.barcode ?? "").toLowerCase().includes(q)) return false;
        if (allowedIds && !allowedIds.has(p.id)) return false;
        if (stockFilter === "low" && !(p.stock > 0 && p.stock <= p.lowStockAt)) return false;
        if (stockFilter === "out" && p.stock > 0) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [db.products, search, allowedIds, stockFilter]);

  if (!showChips) {
    return (
      <div className="py-10">
        <LockedCard feature="categories_nested" title="Catalog is a Basic feature" onBilling={() => navigate("billing")} />
      </div>
    );
  }

  const save = (p: Product) => {
    update((d) => upsertProduct(d, p));
    toast(db.products.some((x) => x.id === p.id) ? "Product updated" : "Product added");
    setEditing(null);
  };

  const openNew = () => {
    if (atLimit) {
      toast(`Plan limit reached — ${productLimit} products on your plan. Upgrade to add more.`, "error");
      navigate("billing");
      return;
    }
    setEditing({
      id: uid("p"),
      name: "",
      sku: `SKU-${String(db.products.length + 1).padStart(4, "0")}`,
      categoryId: null,
      price: 0,
      cost: 0,
      stock: 0,
      lowStockAt: db.settings.lowStockDefault,
      unit: "pcs",
      createdAt: new Date().toISOString(),
      image: null,
      description: "",
      barcode: "",
      warrantyMonths: 0,
      forRetailSale: true,
      lowStockAlert: true,
      vatIncluded: false,
      discountable: true,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Products & Stock</h1>
          <p className="text-sm text-ink-500">
            {db.products.length} / {productLimit === Infinity ? "∞" : productLimit} products ·{" "}
            {db.products.reduce((s, p) => s + p.stock, 0)} units in stock
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() =>
              downloadCSV("products.csv", [
                ["Name", "SKU", "Barcode", "Category", "Sales price", "Purchase price", "Stock", "Unit", "Low stock at", "Warranty (months)", "Retail sale", "Low stock alert", "VAT included", "Discountable", "Stock value"],
                ...db.products.map((p) => [
                  p.name, p.sku, p.barcode ?? "", categoryPathLabel(db, p.categoryId), p.price, p.cost, p.stock, p.unit, p.lowStockAt,
                  p.warrantyMonths ?? 0,
                  p.forRetailSale === false ? "No" : "Yes",
                  p.lowStockAlert === false ? "Off" : "On",
                  p.vatIncluded ? "Yes" : "No",
                  p.discountable === false ? "No" : "Yes",
                  round2(p.stock * p.cost),
                ]),
              ])
            }
          >
            <IcDownload size={15} /> Export
          </Button>
          <Button onClick={openNew}>
            <IcPlus size={16} /> Add product
          </Button>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-3">
          <div className="relative w-full max-w-xs">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"><IcSearch size={15} /></span>
            <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, SKU or barcode…" className="pl-9" />
          </div>
          <Select value={stockFilter} onChange={(e) => setStockFilter(e.target.value as typeof stockFilter)} className="w-36">
            <option value="all">All stock</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </Select>
          <span className="ml-auto text-xs text-ink-400">{filtered.length} shown</span>
        </div>
        <div className="border-b border-ink-100 px-4 py-2.5">
          <CategoryChips db={db} value={cat} onChange={setCat} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-ink-100 bg-ink-50/50">
              <tr>
                <Th>Product</Th><Th>Category</Th><Th className="text-right">Price</Th>
                <Th className="text-right">Cost</Th><Th className="text-right">Margin</Th>
                <Th className="text-center">Stock</Th><Th className="text-right">Stock value</Th><Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {filtered.map((p) => {
                const out = p.stock <= 0;
                const low = !out && p.lowStockAlert !== false && p.stock <= p.lowStockAt;
                const margin = p.price > 0 ? Math.round(((p.price - p.cost) / p.price) * 100) : 0;
                return (
                  <tr key={p.id} className="hover:bg-ink-50/60">
                    <Td>
                      <div className="flex items-center gap-2.5">
                        {p.image ? (
                          <img src={p.image} alt={p.name} className="h-8 w-8 rounded-lg object-cover" />
                        ) : (
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-100 text-ink-400"><IcBox size={15} /></span>
                        )}
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 font-medium text-ink-900">
                            {p.name}
                            {p.vatIncluded ? <Badge tone="green">VAT in</Badge> : null}
                            {p.forRetailSale === false ? <Badge tone="amber">Not for sale</Badge> : null}
                            {p.warrantyMonths ? <Badge tone="blue">{p.warrantyMonths}m warranty</Badge> : null}
                          </p>
                          <p className="text-xs text-ink-400">{p.sku}{p.barcode ? ` · ${p.barcode}` : ""}</p>
                        </div>
                      </div>
                    </Td>
                    <Td><Badge>{categoryPathLabel(db, p.categoryId)}</Badge></Td>
                    <Td className="text-right font-medium">{fmtMoney(p.price, currency)}</Td>
                    <Td className="text-right text-ink-500">{fmtMoney(p.cost, currency)}</Td>
                    <Td className="text-right text-ink-500">{margin}%</Td>
                    <Td className="text-center">
                      <Badge tone={out ? "red" : low ? "amber" : "green"}>{out ? "Out of stock" : low ? `${p.stock} low` : `${p.stock} ${p.unit}`}</Badge>
                    </Td>
                    <Td className="text-right text-ink-500">{fmtMoney(p.stock * p.cost, currency)}</Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => { setRestockFor(p); setRestockQty(10); }}>Restock</Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditing(p)}><IcEdit size={14} /></Button>
                        <Button variant="ghost" size="sm" className="text-red-500 hover:bg-red-50" onClick={() => setConfirmDelete(p)}><IcTrash size={14} /></Button>
                      </div>
                      <Modal
                        open={restockFor?.id === p.id}
                        onClose={() => setRestockFor(null)}
                        title={`Restock ${p.name}`}
                        footer={
                          <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setRestockFor(null)}>Cancel</Button>
                            <Button onClick={() => { update((d) => restock(d, p.id, restockQty)); toast(`${p.name}: +${restockQty} ${p.unit}`); setRestockFor(null); }}>Add stock</Button>
                          </div>
                        }
                      >
                        <Field label="Quantity to add">
                          <NumberInput value={restockQty} min={1} onChange={(e) => setRestockQty(Number(e.target.value) || 0)} />
                        </Field>
                        <p className="mt-2 text-xs text-ink-400">Current stock: {p.stock} · New stock: {p.stock + restockQty}</p>
                      </Modal>
                    </Td>
                  </tr>
                );
              })}
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-ink-400">No products found.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {editing ? <ProductModal product={editing} onClose={() => setEditing(null)} onSave={save} /> : null}

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete product?"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => { update((d) => deleteProduct(d, confirmDelete!.id)); toast("Product deleted", "info"); setConfirmDelete(null); }}>
              Delete
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink-600">
          <span className="font-semibold text-ink-900">{confirmDelete?.name}</span> will be removed from your catalog.
          Past sales records are not affected.
        </p>
      </Modal>
    </div>
  );
}

/* ====================================================================== */
/* Product add / edit modal                                               */
/* ====================================================================== */

function ProductModal({ product, onClose, onSave }: { product: Product; onClose: () => void; onSave: (p: Product) => void }) {
  const { db, navigate } = useApp();
  const toast = useToast();
  const [p, setP] = useState<Product>(product);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof Product, v: unknown) => setP((x) => ({ ...x, [k]: v }));
  const valid = p.name.trim() && p.price >= 0 && p.cost >= 0;
  const canSuggest = hasFeature(db.subscription, "ai_suggest");

  const tree = useMemo(() => buildTree(db).filter((n) => n.id !== UNCATEGORIZED_ID), [db]);
  const suggestion = useMemo(
    () => (p.name.trim().length >= 3 ? suggestCategory(db, p.name) : null),
    [p.name, db],
  );

  const pickImage = (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("Please choose an image file", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      // Downscale to a small square dataURL so localStorage / sync payloads stay light
      const img = new Image();
      img.onload = () => {
        const max = 320;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
        set("image", canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const margin = p.price > 0 ? Math.round(((p.price - p.cost) / p.price) * 100) : 0;

  return (
    <Modal
      open
      onClose={onClose}
      title={product.name ? "Edit product" : "Add product"}
      wide
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!valid} onClick={() => onSave(p)}>Save product</Button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        {/* 1 — Image upload / drag & drop */}
        <div className="col-span-2">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-500">Product image</span>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              pickImage(e.dataTransfer.files?.[0]);
            }}
            onClick={() => fileRef.current?.click()}
            className={classNames(
              "flex cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed px-4 py-4 transition-colors",
              dragOver ? "border-brand-500 bg-brand-50" : "border-ink-200 hover:border-brand-300 hover:bg-ink-50",
            )}
          >
            {p.image ? (
              <img src={p.image} alt="Product" className="h-16 w-16 rounded-lg object-cover" />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-ink-100 text-2xl text-ink-300">🖼️</span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink-800">Upload or drag & drop</p>
              <p className="text-xs text-ink-400">PNG, JPG or WebP — resized to 320px automatically</p>
            </div>
            {p.image ? (
              <Button variant="ghost" size="sm" className="text-red-500 hover:bg-red-50" onClick={(e) => { e.stopPropagation(); set("image", null); }}>
                Remove
              </Button>
            ) : (
              <span className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-ink-600 ring-1 ring-ink-200">Browse</span>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { pickImage(e.target.files?.[0]); e.target.value = ""; }}
          />
        </div>

        {/* 2 — Product name */}
        <div className="col-span-2">
          <Field label="Product name"><TextInput value={p.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Basmati Rice 5kg" /></Field>
        </div>

        {/* 3 — Present stock · 4 — Purchase price · 5 — Sales price */}
        <Field label="Present stock"><NumberInput value={p.stock} min={0} onChange={(e) => set("stock", Number(e.target.value) || 0)} /></Field>
        <Field label="Product unit" hint="How it's sold: pcs, kg, box…">
          <TextInput list="unit-options" value={p.unit} onChange={(e) => set("unit", e.target.value)} placeholder="pcs" />
          <datalist id="unit-options">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
        </Field>
        <Field label="Purchase price" hint={`Margin: ${margin}%`}><NumberInput value={p.cost} min={0} step="0.01" onChange={(e) => set("cost", Number(e.target.value) || 0)} /></Field>
        <Field label="Sales price"><NumberInput value={p.price} min={0} step="0.01" onChange={(e) => set("price", Number(e.target.value) || 0)} /></Field>

        {/* 7 — Category & sub-category */}
        <Field label="Category & sub-category" hint={p.categoryId ? undefined : "Not assigned — shows as Uncategorized"}>
          <div className="flex items-center gap-2">
            <Select value={p.categoryId ?? ""} onChange={(e) => set("categoryId", e.target.value || null)}>
              <option value="">— Uncategorized —</option>
              {tree.map((n) => (
                <option key={n.id} value={n.id}>{n.path.join(" › ")}</option>
              ))}
            </Select>
            {canSuggest ? (
              <button
                type="button"
                title={suggestion ? `Suggested: ${categoryPathLabel(db, suggestion)}` : "Type a name to get a suggestion"}
                disabled={!suggestion}
                onClick={() => {
                  if (!suggestion) return;
                  set("categoryId", suggestion);
                  toast(`✨ Suggested: ${categoryPathLabel(db, suggestion)}`);
                }}
                className={classNames(
                  "shrink-0 rounded-lg px-2.5 py-2 text-sm transition-colors",
                  suggestion ? "bg-violet-50 text-violet-700 ring-1 ring-violet-200 hover:bg-violet-100" : "bg-ink-50 text-ink-300",
                )}
              >
                ✨
              </button>
            ) : null}
          </div>
        </Field>
        <Field label="SKU"><TextInput value={p.sku} onChange={(e) => set("sku", e.target.value)} /></Field>

        {/* 6 — Unit (moved next to stock above) — low stock threshold here */}
        <Field label="Low stock alert at" hint={p.lowStockAlert === false ? "Alerts are off for this product" : undefined}>
          <NumberInput value={p.lowStockAt} min={0} onChange={(e) => set("lowStockAt", Number(e.target.value) || 0)} />
        </Field>
        <Field label="Barcode">
          <TextInput value={p.barcode ?? ""} onChange={(e) => set("barcode", e.target.value)} placeholder="Scan or type barcode" />
        </Field>

        {/* 8 — Description */}
        <div className="col-span-2">
          <Field label="Product description">
            <TextArea value={p.description ?? ""} onChange={(e) => set("description", e.target.value)} rows={3} placeholder="Short description shown on invoices and quick view…" />
          </Field>
        </div>

        {/* 9 — Others: toggles */}
        <div className="col-span-2 mt-1 rounded-xl border border-ink-200 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Others</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Toggle checked={p.forRetailSale !== false} onChange={(v) => set("forRetailSale", v)} label="For retail sale" hint="Show this product in the POS grid" />
            <Toggle checked={p.lowStockAlert !== false} onChange={(v) => set("lowStockAlert", v)} label="Low stock alert" hint="Warn when stock reaches the threshold" />
            <Toggle checked={!!p.vatIncluded} onChange={(v) => set("vatIncluded", v)} label="Include VAT" hint="Sales price already includes VAT" />
            <Toggle
              checked={(p.warrantyMonths ?? 0) > 0}
              onChange={(v) => set("warrantyMonths", v ? 12 : 0)}
              label="Warranty"
              hint={(p.warrantyMonths ?? 0) > 0 ? "Warranty badge shows on invoices" : "No warranty on this item"}
            />
            <Toggle checked={p.discountable !== false} onChange={(v) => set("discountable", v)} label="Discount" hint="Allow discounts on this product" />
            {(p.warrantyMonths ?? 0) > 0 ? (
              <div className="flex items-center gap-2">
                <span className="whitespace-nowrap text-xs font-medium text-ink-500">Warranty length</span>
                <NumberInput value={p.warrantyMonths} min={1} max={120} onChange={(e) => set("warrantyMonths", Number(e.target.value) || 0)} className="w-24" />
                <span className="text-xs text-ink-400">months</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {!canSuggest ? (
        <p className="mt-3 text-xs text-ink-400">
          ✨ AI category suggestions are a Pro feature —{" "}
          <button className="font-medium text-brand-700 underline" onClick={() => navigate("billing")}>compare plans</button>.
        </p>
      ) : null}
    </Modal>
  );
}
