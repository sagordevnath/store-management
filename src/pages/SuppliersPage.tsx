import { useMemo, useState } from "react";
import { useApp } from "../App";
import type { Supplier } from "../types";
import { upsertSupplier, supplierDue, paySupplier, paySupplierOpeningDue } from "../lib/store";
import { softDelete } from "../lib/recycle";
import { logAudit } from "../lib/audit";
import { fmtMoney, initials, uid, downloadCSV } from "../lib/helpers";
import { Badge, Button, Card, Field, Modal, NumberInput, TextInput, useToast, Th, Td, EmptyState } from "../ui";
import { IcPlus, IcSearch, IcEdit, IcTrash, IcDownload, IcCash, IcBuilding } from "../icons";

export default function SuppliersPage() {
  const { db, update, currency } = useApp();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [payFor, setPayFor] = useState<{ supplier: Supplier; purchaseId: string | null; due: number } | null>(null);
  const [amount, setAmount] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<Supplier | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.suppliers
      .map((s) => {
        const purchases = db.purchases.filter((p) => p.supplierId === s.id);
        const totalPurchased = purchases.reduce((a, p) => a + p.total, 0);
        const due = supplierDue(db, s.id);
        return { s, purchases: purchases.length, totalPurchased: Math.round(totalPurchased * 100) / 100, due };
      })
      .filter(({ s }) => !q || s.company.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
      .sort((a, b) => b.due - a.due || a.s.company.localeCompare(b.s.company));
  }, [db, search]);

  const totalDue = rows.reduce((a, r) => a + r.due, 0);
  const activeSuppliers = rows.filter((r) => r.due > 0.009);

  const supplierBills = (supplierId: string) =>
    db.purchases
      .filter((p) => p.supplierId === supplierId && p.payment === "Due" && p.total - p.paidAmount > 0.009)
      .sort((a, b) => (a.at < b.at ? 1 : -1));

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-800/60 bg-gradient-to-r from-slate-950 via-slate-900 to-rose-950 p-4 text-white shadow-[0_24px_50px_-28px_rgba(244,63,94,0.7)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-rose-300">Payables</p>
            <h1 className="mt-1 text-xl font-bold text-white">Suppliers</h1>
            <p className="mt-1 text-sm text-slate-300">
              {db.suppliers.length} suppliers · <span className="font-semibold text-red-200">{fmtMoney(totalDue, currency)}</span> payable
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() =>
                downloadCSV("suppliers.csv", [
                  ["Company", "Contact", "Phone", "Orders", "Purchased", "Due"],
                  ...rows.map(({ s, purchases, totalPurchased, due }) => [s.company, s.name, s.phone, purchases, totalPurchased, due]),
                ])
              }
              className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            >
              <IcDownload size={15} /> Export
            </Button>
            <Button onClick={() => setEditing({ id: uid("s"), name: "", company: "", phone: "", openingDue: 0, createdAt: new Date().toISOString() })} className="bg-rose-500 text-white hover:bg-rose-400">
              <IcPlus size={16} /> Add supplier
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-red-100 bg-gradient-to-br from-red-50 via-white to-rose-100/90 p-4 shadow-[0_16px_30px_-26px_rgba(239,68,68,0.8)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-500">Payable</p>
          <p className="mt-2 text-2xl font-bold text-red-600">{fmtMoney(totalDue, currency)}</p>
          <p className="mt-1 text-xs text-ink-500">Total due to suppliers</p>
        </div>
        <div className="rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50 via-white to-yellow-100/90 p-4 shadow-[0_16px_30px_-26px_rgba(249,115,22,0.8)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-500">Suppliers</p>
          <p className="mt-2 text-2xl font-bold text-orange-600">{activeSuppliers.length}</p>
          <p className="mt-1 text-xs text-ink-500">With open balances</p>
        </div>
        <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-fuchsia-100/90 p-4 shadow-[0_16px_30px_-26px_rgba(168,85,247,0.8)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">Bills</p>
          <p className="mt-2 text-2xl font-bold text-violet-600">{db.purchases.filter((p) => p.payment === "Due" && p.total - p.paidAmount > 0.009).length}</p>
          <p className="mt-1 text-xs text-ink-500">Outstanding purchase invoices</p>
        </div>
      </div>

      <Card>
        <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-3">
          <div className="relative w-full max-w-xs">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"><IcSearch size={15} /></span>
            <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search supplier…" className="pl-9" />
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon={<IcBuilding size={20} />} title="No suppliers yet" subtitle="Add the wholesalers and distributors you buy stock from." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-ink-100 bg-ink-50/50">
                <tr>
                  <Th>Supplier</Th><Th>Contact</Th><Th className="text-right">Orders</Th>
                  <Th className="text-right">Purchased</Th><Th className="text-right">Due</Th><Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map(({ s, purchases, totalPurchased, due }) => {
                  const bills = supplierBills(s.id);
                  return (
                    <tr key={s.id} className="hover:bg-ink-50/60">
                      <Td>
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-[11px] font-bold text-violet-600">{initials(s.company)}</span>
                          <div>
                            <p className="font-medium text-ink-900">{s.company}</p>
                            <p className="text-xs text-ink-400">{s.name}</p>
                          </div>
                        </div>
                      </Td>
                      <Td className="text-ink-500">{s.phone || "—"}</Td>
                      <Td className="text-right text-ink-500">{purchases}</Td>
                      <Td className="text-right text-ink-500">{fmtMoney(totalPurchased, currency)}</Td>
                      <Td className="text-right font-semibold">
                        {due > 0.009 ? <span className="text-red-600">{fmtMoney(due, currency)}</span> : <span className="text-ink-300">—</span>}
                        {bills.length > 0 ? <span className="mt-1 block text-[10px] font-medium text-amber-600">{bills.length} bill{bills.length === 1 ? "" : "s"} due</span> : null}
                      </Td>
                      <Td>
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setEditing(s)}><IcEdit size={14} /></Button>
                          <Button size="sm" variant="ghost" className="text-red-500 hover:bg-red-50" onClick={() => setConfirmDelete(s)}><IcTrash size={14} /></Button>
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

      {/* Outstanding bills panel */}
      <Card>
        <div className="border-b border-ink-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-ink-900">Outstanding supplier bills</h3>
          <p className="text-xs text-ink-500">Pay wholesalers directly from recorded purchase orders</p>
        </div>
        <div className="divide-y divide-ink-100">
          {db.suppliers
            .filter((s) => s.openingDue > 0.009)
            .sort((a, b) => b.openingDue - a.openingDue)
            .map((s) => (
              <div key={`opening-${s.id}`} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900">Opening balance · {s.company}</p>
                  <p className="text-xs text-ink-400">Balance owed before joining the app</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-red-600">{fmtMoney(s.openingDue, currency)}</span>
                  <Button size="sm" variant="success" onClick={() => {
                    setPayFor({ supplier: s, purchaseId: null, due: s.openingDue });
                    setAmount(s.openingDue);
                  }}>
                    <IcCash size={13} /> Pay
                  </Button>
                </div>
              </div>
            ))}
          {db.purchases
            .filter((p) => p.payment === "Due" && p.total - p.paidAmount > 0.009)
            .sort((a, b) => (a.at < b.at ? 1 : -1))
            .slice(0, 8)
            .map((p) => {
              const due = Math.round((p.total - p.paidAmount) * 100) / 100;
              const supplier = db.suppliers.find((s) => s.id === p.supplierId);
              return (
                <div key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900">
                      {p.refNo} · {supplier?.company ?? "Unknown supplier"}
                    </p>
                    <p className="text-xs text-ink-400">
                      Total {fmtMoney(p.total, currency)} · Paid {fmtMoney(p.paidAmount, currency)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-red-600">{fmtMoney(due, currency)}</span>
                    {supplier ? (
                      <Button size="sm" variant="success" onClick={() => { setPayFor({ supplier, purchaseId: p.id, due }); setAmount(due); }}>
                        <IcCash size={13} /> Pay
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          {db.purchases.every((p) => p.total - p.paidAmount <= 0.009) && db.suppliers.every((s) => s.openingDue <= 0.009) ? (
            <p className="px-5 py-8 text-center text-sm text-ink-400">All supplier bills are settled. Great cash discipline!</p>
          ) : null}
        </div>
      </Card>

      {/* Pay modal */}
      <Modal
        open={!!payFor}
        onClose={() => setPayFor(null)}
        title={`Pay ${payFor?.supplier.company ?? ""}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPayFor(null)}>Cancel</Button>
            <Button variant="success" disabled={amount <= 0 || amount > (payFor?.due ?? 0)} onClick={() => {
              if (!payFor) return;
              update((d) => payFor.purchaseId
                ? paySupplier(d, payFor.purchaseId, amount)
                : paySupplierOpeningDue(d, payFor.supplier.id, amount));
              toast(`Paid ${fmtMoney(amount, currency)} to ${payFor.supplier.company}`);
              setPayFor(null);
            }}>
              Record payment
            </Button>
          </div>
        }
      >
        <Field label="Amount paid" hint={`Bill outstanding: ${fmtMoney(payFor?.due ?? 0, currency)}`}>
          <NumberInput value={amount} min={0} max={payFor?.due} step="0.01" onChange={(e) => setAmount(Number(e.target.value) || 0)} />
        </Field>
      </Modal>

      {editing ? <SupplierModal supplier={editing} onClose={() => setEditing(null)} onSave={(s) => { update((d) => upsertSupplier(d, s)); toast("Supplier saved"); setEditing(null); }} /> : null}

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete supplier?"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => { const name = confirmDelete!.name; update((d) => { const next = softDelete(d, "supplier", confirmDelete!.id, d.settings.ownerName); return { ...next, audit: logAudit(next.audit, "delete", "Supplier", name, "Moved to recycle bin") }; }); toast("Moved to recycle bin — restore within 30 days", "info"); setConfirmDelete(null); }}>Delete</Button>
          </div>
        }
      >
        <p className="text-sm text-ink-600"><span className="font-semibold text-ink-900">{confirmDelete?.company}</span> will be removed. Past purchase orders remain in reports.</p>
      </Modal>
    </div>
  );
}

function SupplierModal({ supplier, onClose, onSave }: { supplier: Supplier; onClose: () => void; onSave: (s: Supplier) => void }) {
  const [s, setS] = useState<Supplier>(supplier);
  const set = (k: keyof Supplier, v: string | number) => setS((x) => ({ ...x, [k]: v }));
  return (
    <Modal
      open
      onClose={onClose}
      title={supplier.company ? "Edit supplier" : "New supplier"}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!s.company.trim()} onClick={() => onSave(s)}>Save</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Field label="Company name"><TextInput value={s.company} onChange={(e) => set("company", e.target.value)} placeholder="e.g. Northline Foods Ltd." /></Field>
        <Field label="Contact person"><TextInput value={s.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. L. Grant" /></Field>
        <Field label="Phone"><TextInput value={s.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="Opening balance owed">
          <NumberInput value={s.openingDue} min={0} step="0.01" onChange={(e) => set("openingDue", Number(e.target.value) || 0)} />
        </Field>
      </div>
    </Modal>
  );
}
