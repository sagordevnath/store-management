import { useMemo, useState } from "react";
import type { Category, Product } from "../types";
import { useApp } from "../App";
import { upsertCategory, deleteCategory, upsertProduct } from "../lib/store";
import {
  buildTree, canMoveUnder, categoryPathLabel, productsInSubtree,
  subtreeNodes, suggestCategory, UNCATEGORIZED_ID,
} from "../lib/categories";
import { hasFeature, limitFor, planName } from "../lib/plans";
import { uid, fmtMoney, classNames } from "../lib/helpers";
import { Badge, Button, Card, CardHeader, Field, LockedCard, Modal, Select, TextInput, useToast } from "../ui";
import { IcPlus, IcTrash, IcEdit, IcDownload } from "../icons";

interface FormState {
  id: string | null;
  name: string;
  parentId: string | null;
  icon: string;
}

export default function CategoriesPage() {
  const { db, update, navigate, currency } = useApp();
  const toast = useToast();
  const sub = db.subscription;

  const [form, setForm] = useState<FormState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Category | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);

  if (!hasFeature(sub, "categories_nested")) {
    return (
      <div className="py-10">
        <LockedCard feature="categories_nested" title="Categories are a Basic feature" onBilling={() => navigate("billing")} />
      </div>
    );
  }

  const tree = useMemo(() => buildTree(db), [db]);
  const canBulk = hasFeature(sub, "bulk_recategorize");
  const canSuggest = hasFeature(sub, "ai_suggest");
  const productLimit = limitFor(sub, "products");
  const overLimit = db.products.length > productLimit;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Categories</h1>
          <p className="text-sm text-ink-500">
            Unlimited nesting · {db.categories.length} categories · {db.products.length} products
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canSuggest ? (
            <Button variant="secondary" size="md" onClick={() => setSuggestOpen(true)}>✨ Auto-assign uncategorized</Button>
          ) : null}
          {canBulk ? (
            <Button variant="secondary" size="md" onClick={() => setBulkOpen(true)}>Bulk re-categorize</Button>
          ) : null}
          <Button variant="primary" size="md" onClick={() => setForm({ id: null, name: "", parentId: null, icon: "📁" })}>
            <IcPlus size={16} /> New category
          </Button>
        </div>
      </div>

      {overLimit ? (
        <Card className="border-amber-200 bg-amber-50">
          <div className="flex flex-wrap items-center gap-3 px-5 py-3.5 text-sm text-amber-800">
            <span>⚠️</span>
            <p className="flex-1">
              {db.products.length} products exceeds the {planName(sub)} limit of {productLimit}. Existing products are safe, but you can't add more until you upgrade.
            </p>
            <Button size="sm" variant="secondary" onClick={() => navigate("billing")}>Compare plans</Button>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Category tree" subtitle="Drag-free editing: use the row actions to add a sub-category, rename, or move." />
          <div className="px-2 py-2">
            {tree.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-400">No categories yet — create your first one.</p>
            ) : (
              <ul>
                {tree.map((n) => (
                  <li
                    key={n.id}
                    className="group flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-ink-50"
                    style={{ paddingLeft: 8 + n.depth * 22 }}
                  >
                    <span className="text-base">{n.icon}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-800">
                      {n.name}
                      {n.id === UNCATEGORIZED_ID ? <span className="ml-2 text-xs text-ink-400">(auto)</span> : null}
                    </span>
                    {n.childCount > 0 ? <Badge>{n.childCount} sub</Badge> : null}
                    <Badge tone="neutral">{n.productCount} products</Badge>
                    <span className="hidden w-24 text-right text-xs text-ink-500 sm:block" title="Stock value incl. sub-categories">
                      {fmtMoney(n.stockValue, currency)}
                    </span>
                    {n.id === UNCATEGORIZED_ID ? null : (
                      <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          className="rounded p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                          title="Add sub-category"
                          onClick={() => setForm({ id: null, name: "", parentId: n.id, icon: "📁" })}
                        >
                          <IcPlus size={15} />
                        </button>
                        <button
                          className="rounded p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                          title="Edit"
                          onClick={() => setForm({ id: n.id, name: n.name, parentId: n.parentId, icon: n.icon })}
                        >
                          <IcEdit size={15} />
                        </button>
                        <button
                          className="rounded p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-600"
                          title="Delete (products become uncategorized)"
                          onClick={() => setConfirmDelete(n)}
                        >
                          <IcTrash size={15} />
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="30-day revenue by root category" />
            <div className="space-y-2.5 px-5 py-4">
              {tree.filter((n) => n.depth === 0 && n.sales30d > 0).slice(0, 6).map((n) => {
                const max = Math.max(...tree.filter((x) => x.depth === 0).map((x) => x.sales30d), 1);
                return (
                  <div key={n.id}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium text-ink-700">{n.icon} {n.name}</span>
                      <span className="text-ink-500">{fmtMoney(n.sales30d, currency)}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max((n.sales30d / max) * 100, 2)}%` }} />
                    </div>
                  </div>
                );
              })}
              {tree.every((n) => n.depth !== 0 || n.sales30d === 0) ? (
                <p className="text-xs text-ink-400">No sales in the last 30 days yet.</p>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Category report" subtitle="Sales, profit, margin and stock value per category" />
            <div className="px-5 py-4">
              <Button variant="secondary" size="sm" onClick={() => navigate("reports")}>
                Open Reports → By Category
              </Button>
              {!canBulk || !canSuggest ? (
                <p className="mt-3 text-xs text-ink-400">
                  Bulk re-categorize and ✨ AI suggest are Pro features — <button className="font-medium text-brand-700 underline" onClick={() => navigate("billing")}>compare plans</button>.
                </p>
              ) : null}
            </div>
          </Card>
        </div>
      </div>

      {/* Create / edit modal */}
      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? "Edit category" : form?.parentId ? "New sub-category" : "New category"}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="md" onClick={() => setForm(null)}>Cancel</Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                if (!form || !form.name.trim()) return;
                const parent = form.parentId ? db.categories.find((c) => c.id === form.parentId) ?? null : null;
                if (form.id && !canMoveUnder(db, form.id, form.parentId)) {
                  toast("Can't nest a category under its own sub-category", "error");
                  return;
                }
                const cat: Category = {
                  id: form.id ?? uid("cat"),
                  name: form.name.trim(),
                  parentId: parent?.id ?? null,
                  icon: form.icon || "📁",
                  createdAt: form.id ? db.categories.find((c) => c.id === form.id)!.createdAt : new Date().toISOString(),
                };
                update((d) => upsertCategory(d, cat));
                toast(form.id ? "Category updated" : `Category "${cat.name}" created`);
                setForm(null);
              }}
            >
              {form?.id ? "Save changes" : "Create"}
            </Button>
          </div>
        }
      >
        {form ? (
          <div className="space-y-4">
            <div className="grid grid-cols-[80px_1fr] gap-3">
              <Field label="Icon">
                <TextInput
                  value={form.icon}
                  onChange={(e) => setForm({ ...form, icon: e.target.value.slice(0, 2) })}
                  className="text-center text-lg"
                />
              </Field>
              <Field label="Name">
                <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Coffee & Tea" />
              </Field>
            </div>
            <Field label="Parent category" hint="Leave empty to create a top-level category. A category can't be moved under its own sub-category.">
              <Select value={form.parentId ?? ""} onChange={(e) => setForm({ ...form, parentId: e.target.value || null })}>
                <option value="">— Top level —</option>
                {tree
                  .filter((n) => n.id !== UNCATEGORIZED_ID && n.id !== form.id)
                  .map((n) => (
                    <option key={n.id} value={n.id} disabled={form.id ? !canMoveUnder(db, form.id, n.id) : false}>
                      {"› ".repeat(n.depth)}{n.name}
                    </option>
                  ))}
              </Select>
            </Field>
          </div>
        ) : null}
      </Modal>

      {/* Delete confirm */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete category?"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="md" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="danger"
              size="md"
              onClick={() => {
                if (!confirmDelete) return;
                const count = productsInSubtree(db, confirmDelete.id).size;
                update((d) => deleteCategory(d, confirmDelete.id));
                toast(
                  count > 0
                    ? `Deleted — ${count} product(s) moved to Uncategorized`
                    : "Category deleted",
                  "info",
                );
                setConfirmDelete(null);
              }}
            >
              Delete
            </Button>
          </div>
        }
      >
        {confirmDelete ? (
          <div className="space-y-3 text-sm text-ink-600">
            <p>
              Delete <strong>{confirmDelete.icon} {confirmDelete.name}</strong>
              {subtreeNodes(db, confirmDelete.id).length > 1
                ? ` and its ${subtreeNodes(db, confirmDelete.id).length - 1} sub-categories`
                : ""}
              ?
            </p>
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Products in this branch are not deleted — they become <strong>Uncategorized</strong> and child categories are re-parented upward.
            </p>
          </div>
        ) : null}
      </Modal>

      <BulkRecategorizeModal open={bulkOpen} onClose={() => setBulkOpen(false)} />
      <SuggestPanel open={suggestOpen} onClose={() => setSuggestOpen(false)} />
    </div>
  );
}

/* ---------------- Bulk re-categorize (Pro) ---------------- */

function BulkRecategorizeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, update } = useApp();
  const toast = useToast();
  const tree = useMemo(() => buildTree(db), [db]);
  const [target, setTarget] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const rows = buildTree(db);
  const options = rows.filter((r) => r.id !== UNCATEGORIZED_ID);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Bulk re-categorize"
      wide
      footer={
        <div className="flex items-center justify-between">
          <span className="text-xs text-ink-500">{selected.size} product(s) selected</span>
          <div className="flex gap-2">
            <Button variant="secondary" size="md" onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              size="md"
              disabled={!target || selected.size === 0}
              onClick={() => {
                const products = db.products.map((p) => (selected.has(p.id) ? { ...p, categoryId: target } : p));
                update((d) => ({ ...d, products }));
                toast(`${selected.size} product(s) moved to ${categoryPathLabel(db, target)}`);
                setSelected(new Set());
                onClose();
              }}
            >
              Move {selected.size || ""} to category
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Move selected products to">
          <Select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Choose a category…</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>{o.path.join(" › ")}</option>
            ))}
          </Select>
        </Field>
        <div className="max-h-72 overflow-y-auto rounded-lg border border-ink-200">
          <table className="w-full">
            <tbody>
              {db.products.map((p) => (
                <tr key={p.id} className={classNames("border-b border-ink-100 last:border-0", selected.has(p.id) && "bg-brand-50/60")}>
                  <td className="w-8 px-3 py-2">
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="accent-brand-600" />
                  </td>
                  <td className="px-2 py-2 text-sm text-ink-800">{p.name}</td>
                  <td className="px-2 py-2 text-right text-xs text-ink-500">{categoryPathLabel(db, p.categoryId)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- ✨ AI auto-assign (Pro) ---------------- */

function SuggestPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, update } = useApp();
  const toast = useToast();
  const [results, setResults] = useState<{ product: Product; suggestion: string | null }[]>([]);
  const [applied, setApplied] = useState(0);

  const run = () => {
    const uncategorized = db.products.filter((p) => !p.categoryId);
    if (uncategorized.length === 0) {
      toast("Every product already has a category", "info");
      onClose();
      return;
    }
    setResults(
      uncategorized.map((p) => ({ product: p, suggestion: suggestCategory(db, p.name) })),
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="✨ AI category suggestions"
      wide
      footer={
        <div className="flex items-center justify-between">
          <span className="text-xs text-ink-500">{results.filter((r) => r.suggestion).length} suggestion(s) ready</span>
          <div className="flex gap-2">
            <Button variant="secondary" size="md" onClick={onClose}>Close</Button>
            <Button
              variant="primary"
              size="md"
              disabled={results.length === 0}
              onClick={() => {
                const map = new Map(results.filter((r) => r.suggestion).map((r) => [r.product.id, r.suggestion]));
                const products = db.products.map((p) => (map.has(p.id) ? { ...p, categoryId: map.get(p.id)! } : p));
                update((d) => ({ ...d, products }));
                setApplied(map.size);
                toast(`${map.size} product(s) categorized by AI`);
                setResults([]);
                onClose();
              }}
            >
              Apply all suggestions
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-500">
          Matches product names against your category vocabulary (category names + existing products) and assigns the deepest best match.
        </p>
        {results.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink-200 px-4 py-8 text-center">
            <Button variant="primary" size="md" onClick={run}>Analyze uncategorized products</Button>
          </div>
        ) : (
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {results.map(({ product, suggestion }) => (
              <div key={product.id} className="flex items-center justify-between gap-3 rounded-lg border border-ink-100 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-800">{product.name}</p>
                  <p className="text-xs text-ink-400">currently uncategorized</p>
                </div>
                {suggestion ? (
                  <Badge tone="green">{categoryPathLabel(db, suggestion)}</Badge>
                ) : (
                  <Badge tone="neutral">no confident match</Badge>
                )}
              </div>
            ))}
          </div>
        )}
        {applied > 0 ? <p className="text-xs text-emerald-600">{applied} applied.</p> : null}
      </div>
    </Modal>
  );
}
