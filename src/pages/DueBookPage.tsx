import { Fragment, useMemo, useState } from "react";
import { useApp } from "../App";
import type { DuePayment } from "../types";
import { collectCustomerOpeningDue, collectDue, customerDue, paySupplier, paySupplierOpeningDue, supplierDue } from "../lib/store";
import { downloadCSV, fmtDate, fmtDateTime, fmtMoney, round2 } from "../lib/helpers";
import { Badge, Button, Card, EmptyState, Field, Modal, NumberInput, TextInput, useToast } from "../ui";
import { IcCash, IcDownload, IcSearch, IcUsers, IcWallet } from "../icons";

type Side = "receivable" | "payable";
type Source = "opening" | "invoice";
type DueRow = {
  id: string;
  partyId: string;
  partyName: string;
  phone: string;
  reference: string;
  side: Side;
  source: Source;
  at: string | null;
  total: number;
  paid: number;
  due: number;
};
type DueAccount = {
  key: string;
  partyId: string;
  partyName: string;
  phone: string;
  side: Side;
  rows: DueRow[];
  payments: DuePayment[];
  due: number;
};

function daysSince(at: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(at).getTime()) / 86_400_000));
}

function ageLabel(at: string | null): string {
  if (!at) return "Undated";
  const days = daysSince(at);
  return days < 30 ? "0–29 days" : days < 60 ? "30–59 days" : days < 90 ? "60–89 days" : "90+ days";
}

function ageTone(at: string | null): "green" | "amber" | "red" | "neutral" {
  if (!at) return "neutral";
  const days = daysSince(at);
  return days < 30 ? "green" : days < 60 ? "amber" : "red";
}

export default function DueBookPage() {
  const { db, update, currency, navigate } = useApp();
  const toast = useToast();
  const [side, setSide] = useState<Side>("receivable");
  const [search, setSearch] = useState("");
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const [settling, setSettling] = useState<DueRow | null>(null);
  const [amount, setAmount] = useState(0);

  const rows = useMemo<DueRow[]>(() => {
    const invoices: DueRow[] = [
      ...db.sales.flatMap((sale) => {
        const due = round2(sale.total - sale.paidAmount);
        if (sale.payment !== "Due" || due <= 0.009) return [];
        const customer = db.customers.find((item) => item.id === sale.customerId);
        return [{
          id: sale.id,
          partyId: sale.customerId ?? "",
          partyName: customer?.name ?? "Walk-in customer",
          phone: customer?.phone ?? "",
          reference: sale.invoiceNo,
          side: "receivable" as const,
          source: "invoice" as const,
          at: sale.at,
          total: sale.total,
          paid: sale.paidAmount,
          due,
        }];
      }),
      ...db.purchases.flatMap((purchase) => {
        const due = round2(purchase.total - purchase.paidAmount);
        if (purchase.payment !== "Due" || due <= 0.009) return [];
        const supplier = db.suppliers.find((item) => item.id === purchase.supplierId);
        return [{
          id: purchase.id,
          partyId: purchase.supplierId ?? "",
          partyName: supplier?.company ?? "Supplier",
          phone: supplier?.phone ?? "",
          reference: purchase.refNo,
          side: "payable" as const,
          source: "invoice" as const,
          at: purchase.at,
          total: purchase.total,
          paid: purchase.paidAmount,
          due,
        }];
      }),
      ...db.customers.flatMap((customer) => customer.openingDue > 0.009 ? [{
        id: `opening-customer-${customer.id}`,
        partyId: customer.id,
        partyName: customer.name,
        phone: customer.phone,
        reference: "Opening balance",
        side: "receivable" as const,
        source: "opening" as const,
        at: null,
        total: customer.openingDue + db.duePayments
          .filter((payment) => payment.party === "customer" && payment.partyId === customer.id && payment.source === "opening")
          .reduce((sum, payment) => sum + payment.amount, 0),
        paid: db.duePayments
          .filter((payment) => payment.party === "customer" && payment.partyId === customer.id && payment.source === "opening")
          .reduce((sum, payment) => sum + payment.amount, 0),
        due: customer.openingDue,
      }] : []),
      ...db.suppliers.flatMap((supplier) => supplier.openingDue > 0.009 ? [{
        id: `opening-supplier-${supplier.id}`,
        partyId: supplier.id,
        partyName: supplier.company,
        phone: supplier.phone,
        reference: "Opening balance",
        side: "payable" as const,
        source: "opening" as const,
        at: null,
        total: supplier.openingDue + db.duePayments
          .filter((payment) => payment.party === "supplier" && payment.partyId === supplier.id && payment.source === "opening")
          .reduce((sum, payment) => sum + payment.amount, 0),
        paid: db.duePayments
          .filter((payment) => payment.party === "supplier" && payment.partyId === supplier.id && payment.source === "opening")
          .reduce((sum, payment) => sum + payment.amount, 0),
        due: supplier.openingDue,
      }] : []),
    ];
    return invoices.sort((a, b) => (a.at ?? "").localeCompare(b.at ?? "") || b.due - a.due);
  }, [db]);

  const receivable = db.customers.reduce((sum, customer) => sum + customerDue(db, customer.id, customer.openingDue), 0);
  const payable = db.suppliers.reduce((sum, supplier) => sum + supplierDue(db, supplier.id), 0);
  const selectedRows = rows.filter((row) => row.side === side);
  const query = search.trim().toLowerCase();
  const activeDue = round2(selectedRows.reduce((sum, row) => sum + row.due, 0));
  const agedRows = selectedRows.filter((row) => row.at);
  const aging = [
    { label: "Under 30 days", value: agedRows.filter((row) => daysSince(row.at!) < 30).reduce((sum, row) => sum + row.due, 0) },
    { label: "30–59 days", value: agedRows.filter((row) => daysSince(row.at!) >= 30 && daysSince(row.at!) < 60).reduce((sum, row) => sum + row.due, 0) },
    { label: "60–89 days", value: agedRows.filter((row) => daysSince(row.at!) >= 60 && daysSince(row.at!) < 90).reduce((sum, row) => sum + row.due, 0) },
    { label: "90+ days", value: agedRows.filter((row) => daysSince(row.at!) >= 90).reduce((sum, row) => sum + row.due, 0) },
  ];
  const recentPayments = [...db.duePayments].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10);
  const accounts = useMemo<DueAccount[]>(() => {
    const grouped = new Map<string, DueRow[]>();
    for (const row of selectedRows) {
      const key = row.partyId ? `${row.side}:${row.partyId}` : `${row.side}:unlinked:${row.id}`;
      grouped.set(key, [...(grouped.get(key) ?? []), row]);
    }
    return [...grouped.entries()]
      .map(([key, accountRows]) => {
        const first = accountRows[0]!;
        const payments = db.duePayments
          .filter((payment) => payment.party === (side === "receivable" ? "customer" : "supplier") && payment.partyId === first.partyId)
          .sort((a, b) => b.at.localeCompare(a.at));
        return {
          key,
          partyId: first.partyId,
          partyName: first.partyName,
          phone: first.phone,
          side,
          rows: accountRows.sort((a, b) => (a.at ?? "").localeCompare(b.at ?? "")),
          payments,
          due: round2(accountRows.reduce((sum, row) => sum + row.due, 0)),
        };
      })
      .filter((account) =>
        !query ||
        [account.partyName, account.phone].some((value) => value.toLowerCase().includes(query)) ||
        account.rows.some((row) => row.reference.toLowerCase().includes(query))
      )
      .sort((a, b) => b.due - a.due || a.partyName.localeCompare(b.partyName));
  }, [selectedRows, db.duePayments, side, query]);

  const exportRows = () => downloadCSV(`due-book-${side}.csv`, [
    ["Party", "Phone", "Invoice / reference", "Date", "Age", "Total", "Paid", "Outstanding"],
    ...accounts.flatMap((account) => account.rows.map((row) => [
      account.partyName, account.phone, row.reference, row.at ? row.at.slice(0, 10) : "",
      row.at ? `${daysSince(row.at)} days` : "Undated opening balance",
      row.total, row.paid, row.due,
    ])),
  ]);

  const recordSettlement = () => {
    if (!settling || amount <= 0 || amount > settling.due) return;
    update((current) => {
      if (settling.side === "receivable") {
        return settling.source === "opening"
          ? collectCustomerOpeningDue(current, settling.partyId, amount)
          : collectDue(current, settling.id, amount);
      }
      return settling.source === "opening"
        ? paySupplierOpeningDue(current, settling.partyId, amount)
        : paySupplier(current, settling.id, amount);
    });
    toast(`${settling.side === "receivable" ? "Received" : "Paid"} ${fmtMoney(amount, currency)} · ${settling.reference}`);
    setSettling(null);
  };

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-slate-800/60 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 p-5 text-white shadow-[0_24px_50px_-28px_rgba(99,102,241,0.65)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-indigo-300">Accounts receivable & payable</p>
            <h1 className="mt-1 text-2xl font-bold">Due Book</h1>
            <p className="mt-1 text-sm text-slate-300">A single place to review outstanding invoices and record settlements.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={exportRows} className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white">
              <IcDownload size={15} /> Export view
            </Button>
            <Button onClick={() => navigate(side === "receivable" ? "customers" : "suppliers")} className="bg-indigo-500 text-white hover:bg-indigo-400">
              {side === "receivable" ? "Manage customers" : "Manage suppliers"}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <button onClick={() => setSide("receivable")} className="text-left">
          <Card className={`h-full p-4 transition-colors ${side === "receivable" ? "border-emerald-300 bg-emerald-50/70" : "hover:border-emerald-200"}`}>
            <div className="flex items-center justify-between text-emerald-700"><span className="text-xs font-semibold uppercase tracking-wider">To collect</span><IcCash size={18} /></div>
            <p className="mt-2 text-2xl font-bold text-emerald-700">{fmtMoney(receivable, currency)}</p>
            <p className="mt-1 text-xs text-ink-500">From {db.customers.filter((customer) => customerDue(db, customer.id, customer.openingDue) > 0.009).length} customers</p>
          </Card>
        </button>
        <button onClick={() => setSide("payable")} className="text-left">
          <Card className={`h-full p-4 transition-colors ${side === "payable" ? "border-rose-300 bg-rose-50/70" : "hover:border-rose-200"}`}>
            <div className="flex items-center justify-between text-rose-700"><span className="text-xs font-semibold uppercase tracking-wider">To pay</span><IcWallet size={18} /></div>
            <p className="mt-2 text-2xl font-bold text-rose-700">{fmtMoney(payable, currency)}</p>
            <p className="mt-1 text-xs text-ink-500">To {db.suppliers.filter((supplier) => supplierDue(db, supplier.id) > 0.009).length} suppliers</p>
          </Card>
        </button>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Net open balance</p>
          <p className={`mt-2 text-2xl font-bold ${receivable - payable >= 0 ? "text-ink-900" : "text-red-600"}`}>{fmtMoney(receivable - payable, currency)}</p>
          <p className="mt-1 text-xs text-ink-500">Receivables minus payables</p>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-4 py-3">
          <div className="inline-flex rounded-lg border border-ink-200 bg-ink-50 p-0.5">
            {(["receivable", "payable"] as Side[]).map((value) => (
              <button key={value} onClick={() => setSide(value)} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${side === value ? "bg-white text-ink-900 shadow-sm" : "text-ink-500"}`}>
                {value === "receivable" ? "Receivables" : "Payables"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-ink-500">{fmtMoney(activeDue, currency)} outstanding · {accounts.length} accounts · {selectedRows.length} open items</span>
            <div className="relative w-56 max-w-full">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"><IcSearch size={14} /></span>
              <TextInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or reference…" className="pl-9" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 border-b border-ink-100 bg-ink-50/50 p-3 sm:grid-cols-4">
          {aging.map((bucket) => (
            <div key={bucket.label} className="rounded-lg bg-white px-3 py-2 ring-1 ring-ink-100">
              <p className="text-[10px] text-ink-500">{bucket.label}</p>
              <p className="mt-0.5 text-sm font-semibold text-ink-800">{fmtMoney(bucket.value, currency)}</p>
            </div>
          ))}
        </div>
        <p className="border-b border-ink-100 px-4 py-2 text-[11px] text-ink-400">
          Age is measured from the invoice date, not a contractual due date. Opening balances have no recorded date and are excluded from aging totals.
        </p>

        {accounts.length === 0 ? (
          <EmptyState icon={<IcUsers size={20} />} title={query ? "No matching balances" : "All settled"} subtitle={query ? "Try a different name, phone, or invoice reference." : `There are no outstanding ${side === "receivable" ? "customer invoices" : "supplier bills"} right now.`} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px]">
              <thead className="border-b border-ink-100 bg-white text-left text-[11px] uppercase tracking-wide text-ink-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Customer / supplier ledger</th><th className="px-4 py-3 text-right font-semibold">Open items</th>
                  <th className="px-4 py-3 text-right font-semibold">Total outstanding</th><th className="px-4 py-3 text-right font-semibold">Ledger</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {accounts.map((account) => {
                  const isExpanded = expandedAccount === account.key;
                  return (
                    <Fragment key={account.key}>
                      <tr className="cursor-pointer hover:bg-ink-50/60" onClick={() => setExpandedAccount(isExpanded ? null : account.key)}>
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-ink-900">{account.partyName}</p>
                          <p className="text-xs text-ink-400">{account.phone || "No phone"} · {account.rows.length} due {account.rows.length === 1 ? "item" : "items"}</p>
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-ink-600">{account.rows.length}</td>
                        <td className="px-4 py-3 text-right text-sm font-bold text-red-600">{fmtMoney(account.due, currency)}</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-brand-700">{isExpanded ? "Hide ledger −" : "View ledger +"}</td>
                      </tr>
                      {isExpanded ? (
                        <tr>
                          <td colSpan={4} className="bg-ink-50/50 px-3 py-3 sm:px-5">
                            <div className="overflow-x-auto rounded-lg border border-ink-200 bg-white">
                              <table className="w-full min-w-[750px]">
                                <thead className="bg-ink-50 text-left text-[10px] uppercase tracking-wide text-ink-400">
                                  <tr>
                                    <th className="px-3 py-2">Invoice / entry</th><th className="px-3 py-2">Date / aging</th>
                                    <th className="px-3 py-2 text-right">Invoice total</th><th className="px-3 py-2 text-right">Paid</th>
                                    <th className="px-3 py-2 text-right">Due</th><th className="px-3 py-2 text-right">Action</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-ink-100">
                                  {account.rows.map((row) => (
                                    <tr key={row.id}>
                                      <td className="px-3 py-2.5 text-sm font-medium text-ink-800">{row.reference}</td>
                                      <td className="px-3 py-2.5">
                                        <p className="text-sm text-ink-700">{row.at ? fmtDate(row.at) : "No date recorded"}</p>
                                        <Badge tone={ageTone(row.at)}>{row.source === "opening" ? "Opening balance" : ageLabel(row.at)}</Badge>
                                      </td>
                                      <td className="px-3 py-2.5 text-right text-sm text-ink-600">{fmtMoney(row.total, currency)}</td>
                                      <td className="px-3 py-2.5 text-right text-sm text-ink-600">{fmtMoney(row.paid, currency)}</td>
                                      <td className="px-3 py-2.5 text-right text-sm font-bold text-red-600">{fmtMoney(row.due, currency)}</td>
                                      <td className="px-3 py-2.5 text-right">
                                        <Button size="sm" variant="success" onClick={() => { setSettling(row); setAmount(row.due); }}>
                                          <IcCash size={13} /> {side === "receivable" ? "Collect" : "Pay"}
                                        </Button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div className="mt-3 rounded-lg border border-ink-200 bg-white">
                              <div className="border-b border-ink-100 px-3 py-2">
                                <p className="text-xs font-semibold text-ink-700">Payment history</p>
                              </div>
                              {account.payments.length ? account.payments.map((payment) => (
                                <div key={payment.id} className="flex items-center justify-between gap-3 border-b border-ink-100 px-3 py-2 last:border-0">
                                  <div>
                                    <p className="text-xs font-medium text-ink-700">{payment.reference}</p>
                                    <p className="text-[11px] text-ink-400">{fmtDateTime(payment.at)}</p>
                                  </div>
                                  <p className={`text-xs font-semibold ${payment.direction === "in" ? "text-emerald-700" : "text-rose-700"}`}>
                                    {payment.direction === "in" ? "Received" : "Paid"} {fmtMoney(payment.amount, currency)}
                                  </p>
                                </div>
                              )) : <p className="px-3 py-3 text-xs text-ink-400">No payments recorded yet.</p>}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <div className="border-b border-ink-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-ink-900">Recent settlements</h2>
          <p className="text-xs text-ink-500">Latest payments recorded against customer balances and supplier bills.</p>
        </div>
        {recentPayments.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-ink-400">Recorded settlements will appear here.</p>
        ) : (
          <div className="divide-y divide-ink-100">
            {recentPayments.map((payment) => {
              const customer = payment.party === "customer" ? db.customers.find((item) => item.id === payment.partyId) : null;
              const supplier = payment.party === "supplier" ? db.suppliers.find((item) => item.id === payment.partyId) : null;
              const label = customer?.name ?? supplier?.company ?? (payment.party === "customer" ? "Deleted customer" : "Deleted supplier");
              return (
                <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-ink-800">{label} <span className="font-normal text-ink-400">· {payment.reference}</span></p>
                    <p className="text-xs text-ink-400">{fmtDateTime(payment.at)} · {payment.source === "opening" ? "Opening balance" : "Invoice settlement"}</p>
                  </div>
                  <p className={`text-sm font-semibold ${payment.direction === "in" ? "text-emerald-700" : "text-rose-700"}`}>
                    {payment.direction === "in" ? "Received" : "Paid"} {fmtMoney(payment.amount, currency)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Modal
        open={!!settling}
        onClose={() => setSettling(null)}
        title={`${side === "receivable" ? "Collect from" : "Pay"} ${settling?.partyName ?? ""}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSettling(null)}>Cancel</Button>
            <Button variant="success" disabled={!settling || amount <= 0 || amount > settling.due} onClick={recordSettlement}>Record {side === "receivable" ? "receipt" : "payment"}</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-ink-600">{settling?.reference} · Outstanding {fmtMoney(settling?.due ?? 0, currency)}</p>
          <Field label={side === "receivable" ? "Amount received" : "Amount paid"} hint="Partial settlements are supported; the amount cannot exceed the open balance.">
            <NumberInput value={amount} min={0} max={settling?.due} step="0.01" onChange={(event) => setAmount(Number(event.target.value) || 0)} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
