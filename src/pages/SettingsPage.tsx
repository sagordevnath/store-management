import { useMemo, useRef, useState } from "react";
import { useApp } from "../App";
import type { Settings, Branch } from "../types";
import { updateSettings, exportBackup, validateBackup } from "../lib/store";
import { uid } from "../lib/helpers";
import { fileToResizedDataURL } from "../lib/image";
import { Button, Card, CardHeader, Field, NumberInput, Select, TextInput, Toggle, useToast } from "../ui";
import { IcDownload, IcStore } from "../icons";

export default function SettingsPage({ onReset }: { onReset: () => void }) {
  const { db, setDB, update, navigate } = useApp();
  const toast = useToast();
  const [s, setS] = useState<Settings>(db.settings);
  const [confirm, setConfirm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof Settings, v: string | number | boolean) => setS((x) => ({ ...x, [k]: v }));
  const dirty = JSON.stringify(s) !== JSON.stringify(db.settings);

  /* ---------- backup / restore ---------- */
  const downloadBackup = () => {
    const json = exportBackup(db);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `managix-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Backup downloaded");
  };

  const restoreBackup = (file: File | null | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = validateBackup(String(reader.result));
      if (res.error || !res.db) {
        toast(res.error ?? "Invalid backup file", "error");
        return;
      }
      setDB(res.db);
      toast("Backup restored — all data replaced");
    };
    reader.readAsText(file);
  };

  /* ---------- branches ---------- */
  const branchStats = useMemo(
    () =>
      db.branches.map((b) => ({
        b,
        sales: db.sales.filter((x) => x.branchId === b.id).length,
        purchases: db.purchases.filter((x) => x.branchId === b.id).length,
      })) as { b: Branch; sales: number; purchases: number }[],
    [db],
  );

  const [newBranch, setNewBranch] = useState("");
  const addBranch = () => {
    const name = newBranch.trim();
    if (!name) return;
    const b: Branch = { id: uid("br"), name, address: "", createdAt: new Date().toISOString() };
    update((d) => ({ ...d, branches: [...d.branches, b] }));
    setNewBranch("");
    toast(`Branch “${name}” added`);
  };

  const renameBranch = (id: string, name: string) => {
    update((d) => ({ ...d, branches: d.branches.map((b) => (b.id === id ? { ...b, name } : b)) }));
  };

  const removeBranch = (id: string) => {
    update((d) => ({ ...d, branches: d.branches.filter((b) => b.id !== id) }));
    toast("Branch removed — its records stay unassigned", "info");
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-ink-900">Settings</h1>
        <p className="text-sm text-ink-500">Shop profile, pricing, branches, loyalty and data tools</p>
      </div>

      <Card>
        <CardHeader title="Shop profile & branding" subtitle="Logo, owner photo and company details — shown on the sidebar and printed on A4 invoices" />
        <div className="space-y-4 px-5 py-4">
          <div className="flex flex-wrap items-center gap-5">
            {/* Company logo */}
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">Company logo</p>
              <ImagePicker
                value={s.logo ?? null}
                shape="square"
                onChange={(v) => setS((x) => ({ ...x, logo: v }))}
                fallback={s.shopName.slice(0, 1).toUpperCase()}
              />
            </div>
            {/* Owner photo */}
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">Owner photo</p>
              <ImagePicker
                value={s.ownerImage ?? null}
                shape="round"
                onChange={(v) => setS((x) => ({ ...x, ownerImage: v }))}
                fallback={s.ownerName.slice(0, 1).toUpperCase() || "O"}
              />
            </div>
            <div className="min-w-[180px] flex-1 space-y-3">
              <Field label="Shop name"><TextInput value={s.shopName} onChange={(e) => set("shopName", e.target.value)} /></Field>
              <Field label="Tagline"><TextInput value={s.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="e.g. Grocery & Household" /></Field>
              <Field label="Owner name"><TextInput value={s.ownerName} onChange={(e) => set("ownerName", e.target.value)} /></Field>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Address"><TextInput value={s.address ?? ""} onChange={(e) => set("address", e.target.value)} placeholder="Street, area, city" /></Field>
            <Field label="Business / VAT reg. no"><TextInput value={s.regNo ?? ""} onChange={(e) => set("regNo", e.target.value)} placeholder="e.g. BIN 004512789-0201" /></Field>
            <Field label="Phone"><TextInput value={s.phone ?? ""} onChange={(e) => set("phone", e.target.value)} placeholder="+880 …" /></Field>
            <Field label="Email"><TextInput value={s.email ?? ""} onChange={(e) => set("email", e.target.value)} placeholder="hello@yourshop.com" /></Field>
            <Field label="Website"><TextInput value={s.website ?? ""} onChange={(e) => set("website", e.target.value)} placeholder="yourshop.com" /></Field>
            <Field label="Invoice footer note"><TextInput value={s.invoiceNote ?? ""} onChange={(e) => set("invoiceNote", e.target.value)} placeholder="Return policy, thank-you note…" /></Field>
          </div>
          <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
            The logo appears on the sidebar, the A4 invoice header and receipts. The owner photo appears on invoices as the authorised signatory.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Sales preferences" subtitle="Applied at the point of sale" />
        <div className="grid gap-3 px-5 py-4 sm:grid-cols-3">
          <Field label="Currency symbol">
            <Select value={s.currency} onChange={(e) => set("currency", e.target.value)}>
              {["৳", "$", "€", "£", "₹", "₦", "R"].map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Tax rate %" hint="0 disables tax lines on invoices">
            <NumberInput value={s.taxRate} min={0} max={50} step="0.5" onChange={(e) => set("taxRate", Number(e.target.value) || 0)} />
          </Field>
          <Field label="Default low-stock alert">
            <NumberInput value={s.lowStockDefault} min={0} onChange={(e) => set("lowStockDefault", Number(e.target.value) || 0)} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Loyalty program" subtitle="Customers earn points on every sale and redeem them as credit" />
        <div className="space-y-3 px-5 py-4">
          <Toggle
            checked={s.loyaltyEnabled}
            onChange={(v) => set("loyaltyEnabled", v)}
            label="Enable loyalty points"
            hint="Awarded automatically when a sale has a customer attached"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Points per 100 spent" hint="e.g. 1 → a $250 sale earns 2 points">
              <NumberInput value={s.loyaltyRate} min={0} step="0.5" onChange={(e) => set("loyaltyRate", Number(e.target.value) || 0)} />
            </Field>
            <Field label="Point value" hint="Credit each point is worth at redemption">
              <NumberInput value={s.pointValue} min={0.001} step="0.01" onChange={(e) => set("pointValue", Number(e.target.value) || 0)} />
            </Field>
          </div>
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
        <CardHeader title="Branches" subtitle="Tag sales, purchases and expenses per outlet (Pro)" />
        <div className="space-y-2 px-5 py-4">
          {branchStats.map(({ b, sales, purchases }) => (
            <div key={b.id} className="flex items-center gap-2 rounded-lg border border-ink-200 p-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><IcStore size={15} /></span>
              <div className="min-w-0 flex-1">
                <TextInput value={b.name} onChange={(e) => renameBranch(b.id, e.target.value)} className="!border-0 !px-0 !py-0 text-sm font-medium" />
                <p className="text-[11px] text-ink-400">{sales} sales · {purchases} purchases{b.address ? ` · ${b.address}` : ""}</p>
              </div>
              {db.branches.length > 1 ? (
                <Button variant="ghost" size="sm" className="text-red-500 hover:bg-red-50" onClick={() => removeBranch(b.id)}>Remove</Button>
              ) : null}
            </div>
          ))}
          <div className="flex gap-2">
            <TextInput
              value={newBranch}
              onChange={(e) => setNewBranch(e.target.value)}
              placeholder="New branch name…"
              onKeyDown={(e) => { if (e.key === "Enter") addBranch(); }}
            />
            <Button variant="secondary" onClick={addBranch}>Add branch</Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Backup & restore" subtitle="Download a full JSON backup, or restore one on any device" />
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="text-sm text-ink-600">
            <p><span className="font-semibold text-ink-900">{db.products.length}</span> products · <span className="font-semibold text-ink-900">{db.sales.length}</span> sales · <span className="font-semibold text-ink-900">{db.customers.length}</span> customers</p>
            <p className="mt-0.5 text-xs text-ink-400">Restoring replaces everything on this device with the backup contents.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={downloadBackup}><IcDownload size={15} /> Download backup</Button>
            <Button onClick={() => fileRef.current?.click()}>Restore backup…</Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => { restoreBackup(e.target.files?.[0]); e.target.value = ""; }}
            />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Danger zone" subtitle="Reset to the original demo dataset" />
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <p className="text-xs text-ink-400">Resetting restores the original demo dataset. Download a backup first if you need your data.</p>
          <Button variant="secondary" onClick={() => setConfirm(true)}>Reset demo data</Button>
        </div>
      </Card>

      <Card className="p-5">
        <p className="text-xs text-ink-400">
          Managix · v2.0 · A professional business manager for retail shops, mega shops, wholesalers and distributors.
          Sales, stock, purchases, dues, expenses, returns and reports — all in one place.{" "}
          <button className="font-medium text-brand-600 hover:underline" onClick={() => navigate("dashboard")}>Back to dashboard</button>
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

/** Click-to-upload (or drag & drop) image picker for logo / owner / staff photos. */
export function ImagePicker({
  value,
  onChange,
  shape = "square",
  fallback,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  shape?: "square" | "round";
  fallback?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const toast = useToast();

  const pick = (file?: File | null) => {
    if (!file) return;
    fileToResizedDataURL(file, 320, 0.85)
      .then((data) => onChange(data))
      .catch(() => toast("Please choose a valid image file", "error"));
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files?.[0]); }}
        className={
          "flex h-20 w-20 items-center justify-center overflow-hidden border-2 border-dashed transition-colors " +
          (shape === "round" ? "rounded-full" : "rounded-xl") +
          (over ? " border-brand-500 bg-brand-50" : " border-ink-300 bg-ink-50 hover:border-brand-400 hover:bg-brand-50/50")
        }
        title="Click to upload or drag & drop an image"
      >
        {value ? (
          <img src={value} alt="Uploaded" className="h-full w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-0.5 text-ink-400">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            {fallback ? <span className="text-sm font-bold text-ink-300">{fallback}</span> : null}
          </span>
        )}
      </button>
      <div className="mt-1 flex items-center justify-center gap-2 text-[11px]">
        <button className="font-medium text-brand-600 hover:underline" onClick={() => inputRef.current?.click()}>
          {value ? "Change" : "Upload"}
        </button>
        {value ? (
          <button className="text-red-500 hover:underline" onClick={() => onChange(null)}>Remove</button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }}
      />
    </div>
  );
}
