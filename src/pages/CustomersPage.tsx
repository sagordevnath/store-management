import { useMemo, useState } from "react";
import { useApp } from "../App";
import type { Customer, PriceTier } from "../types";
import { upsertCustomer, customerDue, customerDueList, collectDue } from "../lib/store";
import { softDelete } from "../lib/recycle";
import { logAudit } from "../lib/audit";
import { fmtMoney, fmtDate, initials, uid, downloadCSV } from "../lib/helpers";
import { Badge, Button, Card, Field, Modal, NumberInput, Select, TextInput, useToast, Th, Td, EmptyState } from "../ui";
import { IcPlus, IcSearch, IcEdit, IcTrash, IcDownload, IcCash, IcUsers } from "../icons";

export default function CustomersPage() {
  const { db, update, currency } = useApp();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [ledgerFor, setLedgerFor] = useState<Customer | null>(null);
  const [collectFor, setCollectFor] = useState<{ customer: Customer; saleId: string; amount: number; max: number } | null>(null);
  const [amount, setAmount] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<Customer | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.customers
      .map((c) => ({
        c,
        due: customerDue(db, c.id, c.openingDue),
        purchases: db.sales.filter((s) => s.customerId === c.id).length,
        spend: db.sales.filter((s) => s.customerId === c.id).reduce((s, x) => s + x.total, 0),
      }))
      .filter(({ c }) => !q || c.name.toLowerCase().includes(q) || c.phone.includes(q))
      .sort((a, b) => b.due - a.due || a.c.name.localeCompare(b.c.name));
  }, [db, search]);

  const totalDue = rows.reduce((s, r) => s + r.due, 0);

  const ledgerSales = ledgerFor ? customerDueList(db, ledgerFor.id) : [];
  const ledgerOtherSales = ledgerFor
    ? db.sales.filter((s) => s.customerId === ledgerFor.id).sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 8)
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Customers</h1>
          <p className="text-sm text-ink-500">
            {db.customers.length} customers · <span className="font-semibold text-red-600">{fmtMoney(totalDue, currency)}</span> total dues
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() =>
              downloadCSV("customers.csv", [
                ["Name", "Tier", "Phone", "Address", "Total purchases", "Points", "Current due", "Credit limit"],
                ...rows.map(({ c, due, purchases }) => [c.name, c.tier, c.phone, c.address, purchases, c.points, due, c.creditLimit]),
              ])
            }
          >
            <IcDownload size={15} /> Export
          </Button>
          <Button onClick={() => setEditing({ id: uid("c"), name: "", phone: "", address: "", openingDue: 0, createdAt: new Date().toISOString(), tier: "retail", creditLimit: 0, points: 0 })}>
            <IcPlus size={16} /> Add customer
          </Button>
        </div>
      </div>

      <Card>
        <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-3">
          <div className="relative w-full max-w-xs">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"><IcSearch size={15} /></span>
            <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or phone…" className="pl-9" />
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon={<IcUsers size={20} />} title="No customers yet" subtitle="Add customers to track credit sales and recover dues faster." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-ink-100 bg-ink-50/50">
                <tr>
                  <Th>Customer</Th><Th>Tier</Th><Th>Phone</Th><Th className="text-right">Purchases</Th>
                  <Th className="text-right">Points</Th><Th className="text-right">Due / Limit</Th><Th>Status</Th><Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map(({ c, due, purchases, spend }) => (
                  <tr key={c.id} className="hover:bg-ink-50/60">
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-[11px] font-bold text-brand-700">{initials(c.name)}</span>
                        <div><p className="font-medium text-ink-900">{c.name}</p><p className="text-xs text-ink-400">{fmtMoney(spend, currency)} lifetime</p></div>
                      </div>
                    </Td>
                    <Td>
                      <Badge tone={c.tier === "distributor" ? "violet" : c.tier === "wholesale" ? "blue" : "neutral"}>
                        {c.tier === "retail" ? "Retail" : c.tier === "wholesale" ? "Wholesale" : "Distributor"}
                      </Badge>
                    </Td>
                    <Td className="text-ink-500">{c.phone || "—"}</Td>
                    <Td className="text-right text-ink-500">{purchases}</Td>
                    <Td className="text-right font-medium text-violet-700">{c.points}</Td>
                    <Td className="text-right font-semibold">
                      {due > 0.009 ? <span className="text-red-600">{fmtMoney(due, currency)}</span> : <span className="text-ink-300">—</span>}
                      {c.creditLimit > 0 ? <span className="block text-[11px] text-ink-400">/ {fmtMoney(c.creditLimit, currency)}</span> : null}
                    </Td>
                    <Td><Badge tone={due > 0.009 ? "amber" : "green"}>{due > 0.009 ? "Has due" : "Clear"}</Badge></Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setLedgerFor(c)}>Ledger</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(c)}><IcEdit size={14} /></Button>
                        <Button size="sm" variant="ghost" className="text-red-500 hover:bg-red-50" onClick={() => setConfirmDelete(c)}><IcTrash size={14} /></Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Ledger modal — digital khata */}
      <Modal open={!!ledgerFor} onClose={() => setLedgerFor(null)} title={ledgerFor ? `Ledger — ${ledgerFor.name}` : ""} wide>
        {ledgerFor ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-red-50 p-3 ring-1 ring-red-100">
                <p className="text-xs text-red-500">Total due</p>
                <p className="text-lg font-bold text-red-600">{fmtMoney(customerDue(db, ledgerFor.id, ledgerFor.openingDue), currency)}</p>
              </div>
              <div className="rounded-xl bg-ink-50 p-3">
                <p className="text-xs text-ink-500">Phone</p>
                <p className="text-sm font-semibold text-ink-800">{ledgerFor.phone || "—"}</p>
              </div>
              <div className="rounded-xl bg-ink-50 p-3">
                <p className="text-xs text-ink-500">Address</p>
                <p className="truncate text-sm font-semibold text-ink-800">{ledgerFor.address || "—"}</p>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Credit sales with due</p>
              {ledgerSales.length === 0 ? (
                <p className="rounded-lg border border-dashed border-ink-200 px-4 py-5 text-center text-sm text-ink-400">No outstanding credit sales.</p>
              ) : (
                <div className="divide-y divide-ink-100 rounded-lg border border-ink-200">
                  {ledgerSales.map((s) => {
                    const due = Math.round((s.total - s.paidAmount) * 100) / 100;
                    return (
                      <div key={s.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink-900">{s.invoiceNo} · {fmtDate(s.at)}</p>
                          <p className="text-xs text-ink-400">Total {fmtMoney(s.total, currency)} · Paid {fmtMoney(s.paidAmount, currency)}</p>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <span className="text-sm font-bold text-red-600">{fmtMoney(due, currency)}</span>
                          <Button size="sm" variant="success" onClick={() => { setCollectFor({ customer: ledgerFor, saleId: s.id, amount: due, max: due }); setAmount(due); }}>
                            <IcCash size={13} /> Collect
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {ledgerOtherSales.length ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Recent purchases</p>
                <div className="rounded-lg border border-ink-200">
                  {ledgerOtherSales.map((s) => (
                    <div key={s.id} className="flex items-center justify-between border-b border-ink-100 px-3.5 py-2 last:border-0">
                      <span className="text-sm text-ink-600">{s.invoiceNo} · {fmtDate(s.at)}</span>
                      <span className="text-sm font-medium text-ink-800">{fmtMoney(s.total, currency)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      {/* Collect modal */}
      <Modal
        open={!!collectFor}
        onClose={() => setCollectFor(null)}
        title={`Collect payment — ${collectFor?.customer.name ?? ""}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCollectFor(null)}>Cancel</Button>
            <Button variant="success" disabled={amount <= 0} onClick={() => {
              if (!collectFor) return;
              update((d) => collectDue(d, collectFor.saleId, amount));
              toast(`Collected ${fmtMoney(amount, currency)} from ${collectFor.customer.name}`);
              setCollectFor(null);
            }}>
              Record payment
            </Button>
          </div>
        }
      >
        <Field label="Amount received" hint={`Outstanding on this invoice: ${fmtMoney(collectFor?.max ?? 0, currency)}`}>
          <NumberInput value={amount} min={0} step="0.01" onChange={(e) => setAmount(Number(e.target.value) || 0)} />
        </Field>
      </Modal>

      {editing ? <CustomerModal customer={editing} onClose={() => setEditing(null)} onSave={(c) => { update((d) => upsertCustomer(d, c)); toast("Customer saved"); setEditing(null); }} /> : null}

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete customer?"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => { const name = confirmDelete!.name; update((d) => { const next = softDelete(d, "customer", confirmDelete!.id, d.settings.ownerName); return { ...next, audit: logAudit(next.audit, "delete", "Customer", name, "Moved to recycle bin") }; }); toast("Moved to recycle bin — restore within 30 days", "info"); setConfirmDelete(null); }}>Delete</Button>
          </div>
        }
      >
        <p className="text-sm text-ink-600"><span className="font-semibold text-ink-900">{confirmDelete?.name}</span> will be removed. Their past invoices remain in reports.</p>
      </Modal>
    </div>
  );
}

function CustomerModal({ customer, onClose, onSave }: { customer: Customer; onClose: () => void; onSave: (c: Customer) => void }) {
  const [c, setC] = useState<Customer>(customer);
  const set = (k: keyof Customer, v: string | number) => setC((x) => ({ ...x, [k]: v }));
  return (
    <Modal
      open
      onClose={onClose}
      title={customer.name ? "Edit customer" : "New customer"}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!c.name.trim()} onClick={() => onSave(c)}>Save</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Field label="Full name"><TextInput value={c.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Amelia Hart" /></Field>
        <Field label="Phone"><TextInput value={c.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+1 555 0100" /></Field>
        <Field label="Address"><TextInput value={c.address} onChange={(e) => set("address", e.target.value)} placeholder="Street, city" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price tier" hint="Drives POS pricing automatically">
            <Select value={c.tier} onChange={(e) => set("tier", e.target.value as PriceTier)}>
              <option value="retail">Retail</option>
              <option value="wholesale">Wholesale</option>
              <option value="distributor">Distributor</option>
            </Select>
          </Field>
          <Field label="Credit limit" hint="0 = credit sales blocked">
            <NumberInput value={c.creditLimit} min={0} step="10" onChange={(e) => set("creditLimit", Number(e.target.value) || 0)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Loyalty points" hint="Adjust the balance manually if needed">
            <NumberInput value={c.points} min={0} onChange={(e) => set("points", Number(e.target.value) || 0)} />
          </Field>
          <Field label="Opening due" hint="Balance owed before joining the app">
            <NumberInput value={c.openingDue} min={0} step="0.01" onChange={(e) => set("openingDue", Number(e.target.value) || 0)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
