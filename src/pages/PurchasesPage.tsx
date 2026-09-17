import { useMemo, useState } from "react";
import { useApp } from "../App";
import type { Purchase } from "../types";
import { makePurchase, paySupplier, nextRefNo } from "../lib/store";
import { fmtMoney, fmtDateTime, uid } from "../lib/helpers";
import { Badge, Button, Card, Field, Modal, NumberInput, Select, TextArea, TextInput, useToast, Th, Td, EmptyState } from "../ui";
import { IcPlus, IcSearch, IcDownload, IcTrash, IcCash } from "../icons";
import { downloadCSV } from "../lib/helpers";

export default function PurchasesPage() {
  const { db, update, currency } = useApp();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<Purchase | null>(null);
  const [payFor, setPayFor] = useState<Purchase | null>(null);
  const [amount, setAmount] = useState(0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.purchases
      .filter((p) => {
        if (!q) return true;
        const supplier = p.supplierId ? db.suppliers.find((s) => s.id === p.supplierId)?.company ?? "" : "";
        return p.refNo.toLowerCase().includes(q) || supplier.toLowerCase().includes(q);
      })
      .sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [db.purchases, db.suppliers, search]);

  const stats = useMemo(() => {
    const total = db.purchases.reduce((s, p) => s + p.total, 0);
    const due = db.purchases.reduce((s, p) => s + Math.max(0, p.total - p.paidAmount), 0);
    return { total: round2(total), due: round2(due), count: db.purchases.length };
  }, [db.purchases]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Purchases</h1>
          <p className="text-sm text-ink-500">
            {stats.count} orders · {fmtMoney(stats.total, currency)} purchased · {fmtMoney(stats.due, currency)} owed to suppliers
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() =>
              downloadCSV("purchases.csv", [
                ["Ref", "Date", "Supplier", "Items", "Subtotal", "Shipping", "Total", "Paid", "Due"],
                ...db.purchases.map((p) => [
                  p.refNo, p.at.slice(0, 10),
                  p.supplierId ? db.suppliers.find((s) => s.id === p.supplierId)?.company ?? "" : "",
                  p.items.reduce((a, b) => a + b.qty, 0), p.subtotal, p.shipping, p.total, p.paidAmount,
                  round2(p.total - p.paidAmount),
                ]),
              ])
            }
          >
            <IcDownload size={15} /> Export
          </Button>
          <Button onClick={() => setCreating(true)}><IcPlus size={16} /> New purchase</Button>
        </div>
      </div>

      <Card>
        <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-3">
          <div className="relative w-full max-w-xs">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"><IcSearch size={15} /></span>
            <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ref or supplier…" className="pl-9" />
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState title="No purchases yet" subtitle="Record your first stock order from a supplier." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-ink-100 bg-ink-50/50">
                <tr>
                  <Th>Ref</Th><Th>Date</Th><Th>Supplier</Th><Th className="text-right">Items</Th>
                  <Th className="text-right">Total</Th><Th className="text-right">Due</Th><Th>Status</Th><Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {filtered.map((p) => {
                  const due = round2(p.total - p.paidAmount);
                  return (
                    <tr key={p.id} className="cursor-pointer hover:bg-ink-50/60" onClick={() => setDetail(p)}>
                      <Td className="font-medium text-ink-900">{p.refNo}</Td>
                      <Td className="text-ink-500">{fmtDateTime(p.at)}</Td>
                      <Td>{p.supplierId ? db.suppliers.find((s) => s.id === p.supplierId)?.company ?? "—" : <span className="text-ink-400">—</span>}</Td>
                      <Td className="text-right text-ink-500">{p.items.reduce((a, b) => a + b.qty, 0)} units</Td>
                      <Td className="text-right font-semibold text-ink-900">{fmtMoney(p.total, currency)}</Td>
                      <Td className="text-right">
                        {due > 0.009 ? <span className="font-semibold text-red-600">{fmtMoney(due, currency)}</span> : <span className="text-ink-300">—</span>}
                      </Td>
                      <Td><Badge tone={p.payment === "Paid" ? "green" : "amber"}>{p.payment}</Badge></Td>
                      <Td>
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {due > 0.009 ? (
                            <Button size="sm" variant="success" onClick={() => { setPayFor(p); setAmount(round2(due)); }}>
                              <IcCash size={13} /> Pay
                            </Button>
                          ) : null}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <CreatePurchaseModal open={creating} onClose={() => setCreating(false)} />

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `Purchase ${detail.refNo}` : ""}
        wide
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDetail(null)}>Close</Button>
            {detail && detail.total - detail.paidAmount > 0.009 ? (
              <Button variant="success" onClick={() => { setPayFor(detail); setAmount(round2(detail.total - detail.paidAmount)); setDetail(null); }}>
                <IcCash size={15} /> Pay supplier
              </Button>
            ) : null}
          </div>
        }
      >
        {detail ? (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3 rounded-xl bg-ink-50 p-4 sm:grid-cols-4">
              <div><p className="text-[11px] text-ink-400">Date</p><p className="font-medium">{fmtDateTime(detail.at)}</p></div>
              <div><p className="text-[11px] text-ink-400">Supplier</p><p className="font-medium">{detail.supplierId ? db.suppliers.find((s) => s.id === detail.supplierId)?.company ?? "—" : "—"}</p></div>
              <div><p className="text-[11px] text-ink-400">Payment</p><p className="font-medium">{detail.payment}</p></div>
              <div><p className="text-[11px] text-ink-400">Paid</p><p className="font-medium">{fmtMoney(detail.paidAmount, currency)} / {fmtMoney(detail.total, currency)}</p></div>
            </div>
            <div className="overflow-hidden rounded-lg border border-ink-200">
              <table className="w-full">
                <thead className="bg-ink-50"><tr><Th>Item</Th><Th className="text-right">Qty</Th><Th className="text-right">Unit cost</Th><Th className="text-right">Amount</Th></tr></thead>
                <tbody className="divide-y divide-ink-100">
                  {detail.items.map((it, i) => (
                    <tr key={i}>
                      <Td>{it.name}</Td>
                      <Td className="text-right">{it.qty}</Td>
                      <Td className="text-right">{fmtMoney(it.unitCost, currency)}</Td>
                      <Td className="text-right font-medium">{fmtMoney(it.unitCost * it.qty, currency)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="ml-auto w-full max-w-xs space-y-1.5">
              <Row label="Subtotal" value={fmtMoney(detail.subtotal, currency)} />
              <Row label="Shipping" value={fmtMoney(detail.shipping, currency)} />
              <Row label="Total" value={fmtMoney(detail.total, currency)} bold />
              <Row label="Paid" value={fmtMoney(detail.paidAmount, currency)} />
              {detail.total - detail.paidAmount > 0.009 ? <Row label="Due" value={fmtMoney(detail.total - detail.paidAmount, currency)} bold /> : null}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!payFor}
        onClose={() => setPayFor(null)}
        title={`Pay supplier — ${payFor?.refNo ?? ""}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPayFor(null)}>Cancel</Button>
            <Button variant="success" onClick={() => { if (payFor) { update((d) => paySupplier(d, payFor.id, amount)); toast(`Payment recorded for ${payFor.refNo}`); setPayFor(null); } }} disabled={amount <= 0}>
              Record payment
            </Button>
          </div>
        }
      >
        <Field label="Amount paid" hint={`Outstanding: ${fmtMoney(payFor ? payFor.total - payFor.paidAmount : 0, currency)}`}>
          <NumberInput value={amount} min={0} step="0.01" onChange={(e) => setAmount(Number(e.target.value) || 0)} />
        </Field>
      </Modal>
    </div>
  );
}

function CreatePurchaseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, update, currency } = useApp();
  const toast = useToast();
  const [supplierId, setSupplierId] = useState("");
  const [payment, setPayment] = useState<"Paid" | "Due">("Paid");
  const [paidInput, setPaidInput] = useState(0);
  const [shipping, setShipping] = useState(0);
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<{ productId: string; unitCost: number; qty: number }[]>([]);

  const subtotal = round2(lines.reduce((s, l) => s + l.unitCost * l.qty, 0));
  const total = round2(subtotal + shipping);

  const addLine = () => {
    const first = db.products.find((p) => !lines.some((l) => l.productId === p.id));
    if (!first) return;
    setLines((ls) => [...ls, { productId: first.id, unitCost: first.cost, qty: 10 }]);
  };

  const save = () => {
    if (lines.length === 0) return;
    const { db: next, purchase } = makePurchase(db, {
      supplierId: supplierId || null,
      items: lines,
      shipping,
      payment,
      paidAmount: payment === "Paid" ? total : paidInput,
      note,
    });
    update(() => next);
    toast(`Purchase ${purchase.refNo} recorded — stock updated`);
    setLines([]);
    setShipping(0);
    setNote("");
    setPayment("Paid");
    setPaidInput(0);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New purchase order"
      wide
      footer={
        <div className="flex justify-between">
          <span className="text-sm text-ink-500">Next ref: {nextRefNo(db)}</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={lines.length === 0}>Save purchase</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Supplier">
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Select supplier…</option>
              {db.suppliers.map((s) => <option key={s.id} value={s.id}>{s.company}</option>)}
            </Select>
          </Field>
          <Field label="Shipping cost">
            <NumberInput value={shipping} min={0} step="0.01" onChange={(e) => setShipping(Number(e.target.value) || 0)} />
          </Field>
          <Field label="Payment">
            <Select value={payment} onChange={(e) => setPayment(e.target.value as "Paid" | "Due")}>
              <option value="Paid">Paid in full</option>
              <option value="Due">Due (partial ok)</option>
            </Select>
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Items</p>
            <Button variant="secondary" size="sm" onClick={addLine}><IcPlus size={13} /> Add item</Button>
          </div>
          <div className="space-y-2">
            {lines.length === 0 ? (
              <p className="rounded-lg border border-dashed border-ink-200 px-4 py-6 text-center text-sm text-ink-400">
                Add products you are purchasing. Stock and cost price update automatically.
              </p>
            ) : (
              lines.map((l, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-ink-200 p-2">
                  <Select
                    value={l.productId}
                    className="min-w-0 flex-1"
                    onChange={(e) => {
                      const pid = e.target.value;
                      const p = db.products.find((x) => x.id === pid)!;
                      setLines((ls) => ls.map((x, j) => (j === i ? { ...x, productId: pid, unitCost: p.cost } : x)));
                    }}
                  >
                    {db.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                  <NumberInput
                    value={l.unitCost}
                    min={0}
                    step="0.01"
                    className="w-24"
                    onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, unitCost: Number(e.target.value) || 0 } : x)))}
                  />
                  <NumberInput
                    value={l.qty}
                    min={1}
                    className="w-20"
                    onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) || 0 } : x)))}
                  />
                  <span className="w-24 text-right text-sm font-medium">{fmtMoney(l.unitCost * l.qty, currency)}</span>
                  <button className="text-ink-300 hover:text-red-500" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                    <IcTrash size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {payment === "Due" ? (
          <Field label="Amount paid now (rest becomes due)">
            <NumberInput value={paidInput} min={0} max={total} onChange={(e) => setPaidInput(Number(e.target.value) || 0)} />
          </Field>
        ) : null}

        <Field label="Note">
          <TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note" />
        </Field>

        <div className="flex items-center justify-between rounded-xl bg-ink-50 px-4 py-3 text-sm">
          <span className="text-ink-500">Order total</span>
          <span className="text-lg font-bold text-ink-900">{fmtMoney(total, currency)}</span>
        </div>
      </div>
    </Modal>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? "border-t border-dashed border-ink-200 pt-1.5 text-base font-bold text-ink-900" : "text-ink-600"}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}

function round2(x: number) { return Math.round(x * 100) / 100; }
