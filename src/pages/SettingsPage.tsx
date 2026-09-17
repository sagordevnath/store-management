import { useState } from "react";
import { useApp } from "../App";
import type { Settings } from "../types";
import { updateSettings } from "../lib/store";
import { Button, Card, CardHeader, Field, NumberInput, Select, TextInput, useToast } from "../ui";

export default function SettingsPage({ onReset }: { onReset: () => void }) {
  const { db, update, navigate } = useApp();
  const toast = useToast();
  const [s, setS] = useState<Settings>(db.settings);
  const [confirm, setConfirm] = useState(false);

  const set = (k: keyof Settings, v: string | number) => setS((x) => ({ ...x, [k]: v }));
  const dirty = JSON.stringify(s) !== JSON.stringify(db.settings);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-ink-900">Settings</h1>
        <p className="text-sm text-ink-500">Shop profile, currency and receipt preferences</p>
      </div>

      <Card>
        <CardHeader title="Shop profile" subtitle="Shown on the sidebar, receipts and reports" />
        <div className="space-y-3 px-5 py-4">
          <Field label="Shop name"><TextInput value={s.shopName} onChange={(e) => set("shopName", e.target.value)} /></Field>
          <Field label="Tagline"><TextInput value={s.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="e.g. Grocery & Household" /></Field>
          <Field label="Owner name"><TextInput value={s.ownerName} onChange={(e) => set("ownerName", e.target.value)} /></Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Sales preferences" subtitle="Applied at the point of sale" />
        <div className="grid gap-3 px-5 py-4 sm:grid-cols-3">
          <Field label="Currency symbol">
            <Select value={s.currency} onChange={(e) => set("currency", e.target.value)}>
              {["$", "€", "£", "৳", "₹", "₦", "R"].map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Tax rate %" hint="0 disables tax lines on invoices">
            <NumberInput value={s.taxRate} min={0} max={50} step="0.5" onChange={(e) => set("taxRate", Number(e.target.value) || 0)} />
          </Field>
          <Field label="Default low-stock alert">
            <NumberInput value={s.lowStockDefault} min={0} onChange={(e) => set("lowStockDefault", Number(e.target.value) || 0)} />
          </Field>
        </div>
        <div className="flex justify-end border-t border-ink-100 px-5 py-3.5">
          <Button
            disabled={!dirty}
            onClick={() => { update((d) => updateSettings(d, s)); toast("Settings saved"); }}
          >
            Save changes
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Data" subtitle="Everything is stored locally in this browser" />
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="text-sm text-ink-600">
            <p><span className="font-semibold text-ink-900">{db.products.length}</span> products · <span className="font-semibold text-ink-900">{db.sales.length}</span> sales · <span className="font-semibold text-ink-900">{db.purchases.length}</span> purchases</p>
            <p className="mt-0.5 text-xs text-ink-400">Resetting restores the original demo dataset.</p>
          </div>
          <Button variant="secondary" onClick={() => setConfirm(true)}>Reset demo data</Button>
        </div>
      </Card>

      <Card className="p-5">
        <p className="text-xs text-ink-400">
          Managix · v1.0 · A professional business manager for retail shops. Sales, stock, purchases, dues, expenses and
          reports — all in one place. <button className="font-medium text-brand-600 hover:underline" onClick={() => navigate("dashboard")}>Back to dashboard</button>
        </p>
      </Card>

      {confirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink-950/45" onClick={() => setConfirm(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-5 shadow-pop">
            <h3 className="text-base font-semibold text-ink-900">Reset all data?</h3>
            <p className="mt-1.5 text-sm text-ink-500">This clears your current data and restores the original demo dataset. It cannot be undone.</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirm(false)}>Cancel</Button>
              <Button variant="danger" onClick={() => { onReset(); setConfirm(false); }}>Reset data</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
