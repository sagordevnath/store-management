import { useMemo, useState } from "react";
import { useApp } from "../App";
import type { Sale } from "../types";
import { collectDue, customerDueList } from "../lib/store";
import { fmtMoney, fmtDateTime, downloadCSV } from "../lib/helpers";
import { Badge, Button, Card, Field, Modal, NumberInput, Select, TextInput, useToast, Th, Td, EmptyState } from "../ui";
import { IcSearch, IcDownload, IcPrint, IcCash } from "../icons";
import { Receipt } from "./PosPage";

type Filter = "all" | "due" | "paid";

export default function SalesPage() {
  const { db, update, currency } = useApp();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [payMethod, setPayMethod] = useState("All");
  const [detail, setDetail] = useState<Sale | null>(null);
  const [collectFor, setCollectFor] = useState<Sale | null>(null);
  const [amount, setAmount] = useState(0);
  const [receiptFor, setReceiptFor] = useState<Sale | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...db.sales]
      .filter((s) => {
        if (q && !(s.invoiceNo.toLowerCase().includes(q) || (s.customerId && db.customers.find((c) => c.id === s.customerId)?.name.toLowerCase().includes(q)))) return false;
        if (filter === "due" && s.total - s.paidAmount <= 0.009) return false;
        if (filter === "paid" && s.total - s.paidAmount > 0.009) return false;
        if (payMethod !== "All" && s.payment !== payMethod) return false;
        return true;
      })
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, 200);
  }, [db.sales, db.customers, search, filter, payMethod]);

  const openCollect = (s: Sale) => {
    setCollectFor(s);
    setAmount(round2(s.total - s.paidAmount));
  };

  const doCollect = () => {
    if (!collectFor) return;
    update((d) => collectDue(d, collectFor.id, amount));
    toast(`Collected ${fmtMoney(amount, currency)} for ${collectFor.invoiceNo}`);
    setCollectFor(null);
  };

  const stats = useMemo(() => {
    const due = db.sales.reduce((s, x) => s + Math.max(0, x.total - x.paidAmount), 0);
    const revenue = db.sales.reduce((s, x) => s + x.total, 0);
    return { due: round2(due), revenue: round2(revenue), count: db.sales.length };
  }, [db.sales]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Sales & Invoices</h1>
          <p className="text-sm text-ink-500">
            {stats.count} invoices · {fmtMoney(stats.revenue, currency)} lifetime · {fmtMoney(stats.due, currency)} outstanding
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() =>
            downloadCSV("sales.csv", [
              ["Invoice", "Date", "Customer", "Payment", "Status", "Subtotal", "Discount", "Tax", "Total", "Paid", "Due", "Profit"],
              ...db.sales.map((s) => [
                s.invoiceNo, s.at.slice(0, 16).replace("T", " "),
                s.customerId ? db.customers.find((c) => c.id === s.customerId)?.name ?? "" : "Walk-in",
                s.payment, s.status, s.subtotal, s.discount, s.tax, s.total, s.paidAmount,
                round2(s.total - s.paidAmount), s.profit,
              ]),
            ])
          }
        >
          <IcDownload size={15} /> Export CSV
        </Button>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-3">
          <div className="relative w-full max-w-xs">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"><IcSearch size={15} /></span>
            <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search invoice or customer…" className="pl-9" />
          </div>
          <Select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="w-36">
            <option value="all">All sales</option>
            <option value="due">With due</option>
            <option value="paid">Fully paid</option>
          </Select>
          <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="w-40">
            {["All", "Cash", "Card", "Mobile Money", "Due"].map((m) => <option key={m} value={m}>{m === "All" ? "All payments" : m}</option>)}
          </Select>
        </div>

        {filtered.length === 0 ? (
          <EmptyState title="No sales match your filters" subtitle="Try clearing the search or choosing a different period." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-ink-100 bg-ink-50/50">
                <tr>
                  <Th>Invoice</Th><Th>Date</Th><Th>Customer</Th><Th>Items</Th>
                  <Th className="text-right">Total</Th><Th className="text-right">Due</Th><Th>Status</Th><Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {filtered.map((s) => {
                  const due = round2(s.total - s.paidAmount);
                  return (
                    <tr key={s.id} className="cursor-pointer hover:bg-ink-50/60" onClick={() => setDetail(s)}>
                      <Td className="font-medium text-ink-900">{s.invoiceNo}</Td>
                      <Td className="text-ink-500">{fmtDateTime(s.at)}</Td>
                      <Td>{s.customerId ? db.customers.find((c) => c.id === s.customerId)?.name ?? "—" : <span className="text-ink-400">Walk-in</span>}</Td>
                      <Td className="text-ink-500">{s.items.reduce((a, b) => a + b.qty, 0)} items</Td>
                      <Td className="text-right font-semibold text-ink-900">{fmtMoney(s.total, currency)}</Td>
                      <Td className="text-right">
                        {due > 0.009 ? <span className="font-semibold text-red-600">{fmtMoney(due, currency)}</span> : <span className="text-ink-300">—</span>}
                      </Td>
                      <Td>
                        <Badge tone={s.status === "Paid" ? "green" : s.status === "Partially Paid" ? "amber" : "red"}>{s.status}</Badge>
                      </Td>
                      <Td>
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {due > 0.009 ? (
                            <Button size="sm" variant="success" onClick={() => openCollect(s)}><IcCash size={13} /> Collect</Button>
                          ) : null}
                          <Button size="sm" variant="ghost" onClick={() => setReceiptFor(s)}><IcPrint size={14} /></Button>
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

      {/* Detail modal */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `Invoice ${detail.invoiceNo}` : ""}
        wide
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDetail(null)}>Close</Button>
            {detail && detail.total - detail.paidAmount > 0.009 ? (
              <Button variant="success" onClick={() => { openCollect(detail); setDetail(null); }}><IcCash size={15} /> Collect due</Button>
            ) : null}
            <Button onClick={() => { setReceiptFor(detail); setDetail(null); }}><IcPrint size={15} /> Receipt</Button>
          </div>
        }
      >
        {detail ? (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3 rounded-xl bg-ink-50 p-4 sm:grid-cols-4">
              <Info label="Date" value={fmtDateTime(detail.at)} />
              <Info label="Customer" value={detail.customerId ? db.customers.find((c) => c.id === detail.customerId)?.name ?? "—" : "Walk-in"} />
              <Info label="Payment" value={detail.payment} />
              <Info label="Cashier" value={detail.cashier} />
            </div>
            <div className="overflow-hidden rounded-lg border border-ink-200">
              <table className="w-full">
                <thead className="bg-ink-50"><tr><Th>Item</Th><Th className="text-right">Qty</Th><Th className="text-right">Price</Th><Th className="text-right">Amount</Th></tr></thead>
                <tbody className="divide-y divide-ink-100">
                  {detail.items.map((it, i) => (
                    <tr key={i}>
                      <Td>{it.name}</Td>
                      <Td className="text-right">{it.qty}</Td>
                      <Td className="text-right">{fmtMoney(it.unitPrice, currency)}</Td>
                      <Td className="text-right font-medium">{fmtMoney(it.unitPrice * it.qty - it.discount, currency)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="ml-auto w-full max-w-xs space-y-1.5">
              <Row label="Subtotal" value={fmtMoney(detail.subtotal, currency)} />
              {detail.discount > 0 ? <Row label="Discount" value={`− ${fmtMoney(detail.discount, currency)}`} /> : null}
              {detail.tax > 0 ? <Row label="Tax" value={fmtMoney(detail.tax, currency)} /> : null}
              <Row label="Total" value={fmtMoney(detail.total, currency)} bold />
              <Row label="Paid" value={fmtMoney(detail.paidAmount, currency)} />
              {detail.total - detail.paidAmount > 0.009 ? (
                <Row label="Due" value={fmtMoney(detail.total - detail.paidAmount, currency)} bold />
              ) : null}
            </div>
            {detail.note ? <p className="rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600">Note: {detail.note}</p> : null}
          </div>
        ) : null}
      </Modal>

      {/* Collect due */}
      <Modal
        open={!!collectFor}
        onClose={() => setCollectFor(null)}
        title={`Collect due — ${collectFor?.invoiceNo ?? ""}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCollectFor(null)}>Cancel</Button>
            <Button variant="success" onClick={doCollect} disabled={amount <= 0}>Record payment</Button>
          </div>
        }
      >
        <Field label="Amount received" hint={`Outstanding: ${fmtMoney(collectFor ? collectFor.total - collectFor.paidAmount : 0, currency)}`}>
          <NumberInput value={amount} min={0} step="0.01" onChange={(e) => setAmount(Number(e.target.value) || 0)} />
        </Field>
      </Modal>

      {/* Receipt */}
      <Modal open={!!receiptFor} onClose={() => setReceiptFor(null)} title="Receipt" footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setReceiptFor(null)}>Close</Button>
          <Button onClick={() => window.print()}><IcPrint size={15} /> Print</Button>
        </div>
      }>
        {receiptFor ? <Receipt sale={receiptFor} shopName={db.settings.shopName} currency={currency} /> : null}
      </Modal>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div><p className="text-[11px] text-ink-400">{label}</p><p className="text-sm font-medium text-ink-800">{value}</p></div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? "text-base font-bold text-ink-900 border-t border-dashed border-ink-200 pt-1.5" : "text-ink-600"}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}

function round2(x: number) { return Math.round(x * 100) / 100; }
