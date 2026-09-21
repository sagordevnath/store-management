import { useMemo, useState } from "react";
import { useApp } from "../App";
import type { StaffMember } from "../types";
import { upsertStaff, deleteStaff } from "../lib/store";
import { fmtMoney, fmtDate, initials, uid } from "../lib/helpers";
import { Badge, Button, Card, Field, Modal, TextInput, useToast, Th, Td, EmptyState } from "../ui";
import { ImagePicker } from "./SettingsPage";
import { IcPlus, IcEdit, IcTrash, IcStaff } from "../icons";

export default function StaffPage() {
  const { db, update, currency } = useApp();
  const toast = useToast();
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<StaffMember | null>(null);

  const rows = useMemo(() => {
    return db.staff
      .map((m) => {
        const sales = db.sales.filter((s) => s.cashier === m.name);
        const revenue = sales.reduce((s, x) => s + x.total, 0);
        const profit = sales.reduce((s, x) => s + x.profit, 0);
        return { m, orders: sales.length, revenue: Math.round(revenue * 100) / 100, profit: Math.round(profit * 100) / 100 };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }, [db]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Staff</h1>
          <p className="text-sm text-ink-500">{db.staff.filter((m) => m.active).length} active members · performance tracked automatically</p>
        </div>
        <Button onClick={() => setEditing({ id: uid("u"), name: "", role: "Cashier", phone: "", joinedAt: new Date().toISOString(), active: true })}>
          <IcPlus size={16} /> Add staff
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card><EmptyState icon={<IcStaff size={20} />} title="No staff yet" subtitle="Add cashiers and managers to track who sells what." /></Card>
      ) : (
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {rows.map(({ m, orders, revenue, profit }) => (
            <Card key={m.id} className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {m.image ? (
                    <img src={m.image} alt={m.name} className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-ink-200" />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
                      {initials(m.name)}
                    </span>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-ink-900">{m.name}</p>
                    <p className="text-xs text-ink-400">{m.role}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button className="rounded p-1 text-ink-300 hover:bg-ink-100 hover:text-ink-600" onClick={() => setEditing(m)}><IcEdit size={14} /></button>
                  <button className="rounded p-1 text-ink-300 hover:bg-red-50 hover:text-red-500" onClick={() => setConfirmDelete(m)}><IcTrash size={14} /></button>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-ink-100 pt-3 text-center">
                <div><p className="text-[10px] text-ink-400">ORDERS</p><p className="text-sm font-bold text-ink-900">{orders}</p></div>
                <div><p className="text-[10px] text-ink-400">REVENUE</p><p className="text-sm font-bold text-ink-900">{fmtMoney(revenue, currency)}</p></div>
                <div><p className="text-[10px] text-ink-400">PROFIT</p><p className="text-sm font-bold text-emerald-700">{fmtMoney(profit, currency)}</p></div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <Badge tone={m.active ? "green" : "neutral"}>{m.active ? "Active" : "Inactive"}</Badge>
                <span className="text-[11px] text-ink-400">Joined {fmtDate(m.joinedAt)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing ? (
        <StaffModal
          member={editing}
          onClose={() => setEditing(null)}
          onSave={(m) => { update((d) => upsertStaff(d, m)); toast("Staff saved"); setEditing(null); }}
        />
      ) : null}

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Remove staff member?"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => { update((d) => deleteStaff(d, confirmDelete!.id)); toast("Staff removed", "info"); setConfirmDelete(null); }}>Remove</Button>
          </div>
        }
      >
        <p className="text-sm text-ink-600"><span className="font-semibold text-ink-900">{confirmDelete?.name}</span> will be removed from your team.</p>
      </Modal>
    </div>
  );
}

function StaffModal({ member, onClose, onSave }: { member: StaffMember; onClose: () => void; onSave: (m: StaffMember) => void }) {
  const [m, setM] = useState<StaffMember>(member);
  const set = (k: keyof StaffMember, v: string | boolean) => setM((x) => ({ ...x, [k]: v }));
  return (
    <Modal
      open
      onClose={onClose}
      title={member.name ? "Edit staff" : "Add staff"}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!m.name.trim()} onClick={() => onSave(m)}>Save</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-4">
          <ImagePicker
            value={m.image ?? null}
            shape="round"
            fallback={m.name.slice(0, 1).toUpperCase() || "S"}
            onChange={(v) => setM((x) => ({ ...x, image: v }))}
          />
          <p className="text-xs text-ink-400">Staff photo — shown on the team cards and printed on invoices handled by this member.</p>
        </div>
        <Field label="Full name"><TextInput value={m.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Sam Whitfield" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Role">
            <select
              value={m.role}
              onChange={(e) => set("role", e.target.value)}
              className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
            >
              {["Owner", "Store Manager", "Cashier", "Warehouse", "Delivery"].map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Phone"><TextInput value={m.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={m.active}
            onChange={(e) => set("active", e.target.checked)}
            className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
          />
          Currently active
        </label>
      </div>
    </Modal>
  );
}
