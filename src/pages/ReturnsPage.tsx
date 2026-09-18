import { useMemo, useState } from "react";
import { useApp } from "../App";
import type { Sale, Purchase, SaleReturn, PurchaseReturn } from "../types";
import { makeSaleReturn, makePurchaseReturn } from "../lib/store";
import { fmtMoney, fmtDateTime, round2 } from "../lib/helpers";
import { hasFeature } from "../lib/plans";
import { Badge, Button, Card, EmptyState, Field, LockedCard, Modal, NumberInput, Select, TextArea, TextInput, useToast, Th, Td } from "../ui";
import { IcRefresh, IcSearch } from "../icons";

type Tab = "sales" | "purchases";

export default function ReturnsPage() {
  const { db, update, currency, navigate } = useApp();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("sales");
  const [search, setSearch] = useState("");
  const [returnFor, setReturnFor] = useState<Sale | null>(null);
  const [returnPo, setReturnPo] = useState<Purchase | null>(null);

  const allowed = hasFeature(db.subscription, "returns");
  if (!allowed) {
    return (
      <div className="py-10">
        <LockedCard feature="returns" title="Returns & refunds" onBilling={() => navigate("billing")} />
      </div>
      );
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = (s: string) => s.toLowerCase().includes(q);
    const saleRows = db.saleReturns.filter((r) => !q || match(r.no) || match(r.invoiceNo));
    const poRows = db.purchaseReturns.filter((r) => !q || match(r.no) || match(r.refNo));
    return { saleRows, poRows };
  }, [db.saleReturns, db.purchaseReturns, search]);

  const totalReturned = useMemo(
    () => round2(db.saleReturns.reduce((s, r) => s + r.amount, 0)),
    [db.saleReturns],
  );
  const totalPReturned = useMemo(
    () => round2(db.purchaseReturns.reduce((s, r) => s + r.amount, 0)),
    [db.purchaseReturns],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Returns & Refunds</h1>
          <p className="text-sm text-ink-500">
            {db.saleReturns.length} customer returns · {fmtMoney(totalReturned, currency)} refunded ·{" "}
            {db.purchaseReturns.length} supplier returns · {fmtMoney(totalPReturned, currency)} credited
          </p>
        </div>
        <div className="relative w-full max-w-xs">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"><IcSearch size={15} /></span>
          <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search return no or invoice…" className="pl-9" />
        </div>
      </div>

      <div className="inline-flex rounded-lg border border-ink-200 bg-ink-50 p-0.5">
        {([["sales", "Customer returns"], ["purchases", "Supplier returns"]] as const).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={
              tab === v
                ? "rounded-md bg-white px-3 py-1.5 text-xs font-medium text-ink-900 shadow-sm"
                : "rounded-md px-3 py-1.5 text-xs font-medium text-ink-500 hover:text-ink-700"
            }
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "sales" ? (
        <Card>
          {filtered.saleRows.length === 0 ? (
            <EmptyState
              icon={<IcRefresh size={20} />}
              title="No customer returns yet"
              subtitle="Open a paid or due invoice from Sales and click “Return items” to start a return."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-ink-100 bg-ink-50/50">
                  <tr><Th>Return</Th><Th>Date</Th><Th>Invoice</Th><Th className="text-right">Items</Th><Th className="text-right">Amount</Th><Th>Refund</Th><Th>Restocked</Th></tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {filtered.saleRows.map((r) => (
                    <tr key={r.id} className="hover:bg-ink-50/60">
                      <Td className="font-medium text-ink-900">{r.no}</Td>
                      <Td className="text-ink-500">{fmtDateTime(r.at)}</Td>
                      <Td>{r.invoiceNo}</Td>
                      <Td className="text-right text-ink-500">{r.items.reduce((a, b) => a + b.qty, 0)}</Td>
                      <Td className="text-right font-semibold text-red-600">{fmtMoney(r.amount, currency)}</Td>
                      <Td><Badge tone={r.refundMethod === "Cash refund" ? "amber" : r.refundMethod === "Store credit" ? "blue" : "violet"}>{r.refundMethod}</Badge></Td>
                      <Td>{r.restock ? <Badge tone="green">Yes</Badge> : <span className="text-ink-300">No</span>}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card>
          {filtered.poRows.length === 0 ? (
            <EmptyState
              icon={<IcRefresh size={20} />}
              title="No supplier returns yet"
              subtitle="Open a purchase order from Purchases and click “Return to supplier”."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-ink-100 bg-ink-50/50">
                  <tr><Th>Return</Th><Th>Date</Th><Th>PO</Th><Th className="text-right">Items</Th><Th className="text-right">Amount</Th><Th>Settlement</Th></tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {filtered.poRows.map((r) => (
                    <tr key={r.id} className="hover:bg-ink-50/60">
                      <Td className="font-medium text-ink-900">{r.no}</Td>
                      <Td className="text-ink-500">{fmtDateTime(r.at)}</Td>
                      <Td>{r.refNo}</Td>
                      <Td className="text-right text-ink-500">{r.items.reduce((a, b) => a + b.qty, 0)}</Td>
                      <Td className="text-right font-semibold text-ink-900">{fmtMoney(r.amount, currency)}</Td>
                      <Td>{r.creditNote ? <Badge tone="blue">Credit note</Badge> : <Badge tone="amber">Cash back</Badge>}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {returnFor ? (
        <SaleReturnModal
          sale={returnFor}
          onClose={() => setReturnFor(null)}
          onDone={(msg) => { toast(msg); setReturnFor(null); }}
        />
      ) : null}
      {returnPo ? (
        <PurchaseReturnModal
          purchase={returnPo}
          onClose={() => setReturnPo(null)}
          onDone={(msg) => { toast(msg); setReturnPo(null); }}
        />
      ) : null}
    </div>
  );
}

/* ====================== Sale return flow ====================== */

export function SaleReturnModal({ sale, onClose, onDone }: { sale: Sale; onClose: () => void; onDone: (msg: string) => void }) {
  const { db, update, currency } = useApp();
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [refundMethod, setRefundMethod] = useState<SaleReturn["refundMethod"]>(sale.payment === "Due" ? "Adjust due" : "Cash refund");
  const [restock, setRestock] = useState(true);
  const [note, setNote] = useState("");

  const lines = sale.items.filter((it) => (qtys[it.productId] ?? 0) > 0);
  const amount = round2(lines.reduce((s, it) => s + it.qty * (qtys[it.productId] ?? 0) * it.unitPrice, 0));

  const submit = () => {
    if (lines.length === 0) return;
    const items = lines.map((it) => ({
      productId: it.productId,
      name: it.name,
      qty: qtys[it.productId] ?? 0,
      unitPrice: it.unitPrice,
      reason: reasons[it.productId] ?? "",
    }));
    const { db: next, ret } = makeSaleReturn(db, { saleId: sale.id, items, refundMethod, restock, note });
    update(() => next);
    onDone(`Return ${ret.no} recorded — ${fmtMoney(ret.amount, currency)} refunded`);
  };

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={`Return items — ${sale.invoiceNo}`}
      footer={
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-500">Refund value: <b className="text-ink-900">{fmtMoney(amount, currency)}</b></span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button variant="danger" disabled={lines.length === 0} onClick={submit}>Record return</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-ink-500">
          Enter the quantity being returned for each item. Stock, dues, and loyalty points adjust automatically.
        </p>
        <div className="overflow-hidden rounded-lg border border-ink-200">
          <table className="w-full">
            <thead className="bg-ink-50"><tr><Th>Item</Th><Th className="text-right">Sold</Th><Th className="text-right w-28">Return qty</Th><Th>Reason</Th></tr></thead>
            <tbody className="divide-y divide-ink-100">
              {sale.items.map((it) => (
                <tr key={it.productId}>
                  <Td>{it.name}</Td>
                  <Td className="text-right text-ink-500">{it.qty}</Td>
                  <Td>
                    <NumberInput
                      value={qtys[it.productId] ?? 0}
                      min={0}
                      max={it.qty}
                      onChange={(e) => setQtys((q) => ({ ...q, [it.productId]: Math.min(Number(e.target.value) || 0, it.qty) }))}
                    />
                  </Td>
                  <Td>
                    <TextInput
                      value={reasons[it.productId] ?? ""}
                      onChange={(e) => setReasons((r) => ({ ...r, [it.productId]: e.target.value }))}
                      placeholder="Damaged / wrong item…"
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Refund method">
            <Select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as SaleReturn["refundMethod"])}>
              {sale.payment === "Due" ? <option value="Adjust due">Adjust due</option> : null}
              <option value="Cash refund">Cash refund</option>
              <option value="Store credit">Store credit</option>
            </Select>
          </Field>
          <Field label="Restock returned items?">
            <Select value={restock ? "yes" : "no"} onChange={(e) => setRestock(e.target.value === "yes")}>
              <option value="yes">Yes — return to stock</option>
              <option value="no">No — damaged/dispose</option>
            </Select>
          </Field>
          <Field label="Note">
            <TextArea rows={1} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

/* ====================== Purchase return flow ====================== */

export function PurchaseReturnModal({ purchase, onClose, onDone }: { purchase: Purchase; onClose: () => void; onDone: (msg: string) => void }) {
  const { db, update, currency } = useApp();
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [creditNote, setCreditNote] = useState(true);
  const [note, setNote] = useState("");

  const lines = purchase.items.filter((it) => (qtys[it.productId] ?? 0) > 0);
  const amount = round2(lines.reduce((s, it) => s + it.qty * (qtys[it.productId] ?? 0) * it.unitCost, 0));

  const submit = () => {
    if (lines.length === 0) return;
    const items = lines.map((it) => ({
      productId: it.productId,
      name: it.name,
      qty: qtys[it.productId] ?? 0,
      unitPrice: it.unitCost,
      reason: reasons[it.productId] ?? "",
    }));
    const { db: next, ret } = makePurchaseReturn(db, { purchaseId: purchase.id, items, creditNote, note });
    update(() => next);
    onDone(`Return ${ret.no} recorded — ${fmtMoney(ret.amount, currency)} ${creditNote ? "credited" : "refunded"}`);
  };

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={`Return to supplier — ${purchase.refNo}`}
      footer={
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-500">Credit value: <b className="text-ink-900">{fmtMoney(amount, currency)}</b></span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button variant="danger" disabled={lines.length === 0} onClick={submit}>Record return</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-ink-500">Stock is reduced automatically. With a credit note, the supplier balance drops by the return value.</p>
        <div className="overflow-hidden rounded-lg border border-ink-200">
          <table className="w-full">
            <thead className="bg-ink-50"><tr><Th>Item</Th><Th className="text-right">Bought</Th><Th className="text-right w-28">Return qty</Th><Th>Reason</Th></tr></thead>
            <tbody className="divide-y divide-ink-100">
              {purchase.items.map((it) => (
                <tr key={it.productId}>
                  <Td>{it.name}</Td>
                  <Td className="text-right text-ink-500">{it.qty}</Td>
                  <Td>
                    <NumberInput
                      value={qtys[it.productId] ?? 0}
                      min={0}
                      max={it.qty}
                      onChange={(e) => setQtys((q) => ({ ...q, [it.productId]: Math.min(Number(e.target.value) || 0, it.qty) }))}
                    />
                  </Td>
                  <Td>
                    <TextInput
                      value={reasons[it.productId] ?? ""}
                      onChange={(e) => setReasons((r) => ({ ...r, [it.productId]: e.target.value }))}
                      placeholder="Damaged in transit…"
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Settlement">
            <Select value={creditNote ? "credit" : "cash"} onChange={(e) => setCreditNote(e.target.value === "credit")}>
              <option value="credit">Credit note — reduce payable</option>
              <option value="cash">Cash refunded by supplier</option>
            </Select>
          </Field>
          <Field label="Note">
            <TextArea rows={1} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
