import { useMemo, useState } from "react";
import { useApp } from "../App";
import type { ModuleKey, PresetRole, StaffAccount } from "../types";
import { ALL_MODULES, ROLE_LABELS, ROLE_HINTS, permFor, rolePerms } from "../lib/access";
import { auditSummary } from "../lib/audit";
import { fmtDateTime, classNames, downloadCSV, csvEscape } from "../lib/helpers";
import { Badge, Button, Card, CardHeader, EmptyState, Modal, Select, TextInput, useToast, Th, Td } from "../ui";
import { IcShield, IcStaff } from "../icons";

type Tab = "accounts" | "permissions" | "audit";

const MODULE_LABELS: Record<ModuleKey, string> = {
  dashboard: "Dashboard", pos: "Point of Sale", sales: "Sales & Invoices", purchases: "Purchases",
  returns: "Returns", products: "Products & Stock", categories: "Categories", customers: "Customers",
  suppliers: "Suppliers", staff: "Staff", expenses: "Expenses", reports: "Reports", tools: "Tools & Extras",
  storefront: "Online Storefront", wallet: "Digital Wallet", messages: "Messages", recycle: "Recycle Bin",
  audit: "Audit Log", access: "Team & Access", billing: "Billing & Plan", settings: "Settings",
};

const PERM_LABEL: Record<string, string> = { none: "No access", view: "View", edit: "Edit", all: "Full" };

export default function AccessPage() {
  const { db, update } = useApp();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("accounts");
  const [editing, setEditing] = useState<StaffAccount | null>(null);

  const saveAccount = (a: StaffAccount) => {
    update((d) => {
      const exists = d.accounts.some((x) => x.staffId === a.staffId);
      const accounts = exists ? d.accounts.map((x) => (x.staffId === a.staffId ? a : x)) : [...d.accounts, a];
      return { ...d, accounts };
    });
    toast("Account saved");
    setEditing(null);
  };

  const toggleActive = (staffId: string) => {
    update((d) => ({
      ...d,
      accounts: d.accounts.map((a) => (a.staffId === staffId && !a.isOwner ? { ...a, active: !a.active } : a)),
    }));
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-ink-900">Team & Access</h1>
        <p className="text-sm text-ink-500">Give each person exactly the access they need — and see who did what</p>
      </div>

      <div className="inline-flex rounded-lg border border-ink-200 bg-ink-50 p-0.5">
        {([
          ["accounts", "Accounts", db.accounts.length],
          ["permissions", "Roles & permissions", 0],
          ["audit", "Audit log", db.audit.length],
        ] as [Tab, string, number][]).map(([k, label, count]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={classNames(
              "rounded-md px-4 py-1.5 text-xs font-medium transition-colors",
              tab === k ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-700",
            )}
          >
            {label}
            {count > 0 ? <span className="ml-1.5 rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">{count}</span> : null}
          </button>
        ))}
      </div>

      {tab === "accounts" ? (
        <Card>
          <CardHeader
            title="Sign-in accounts"
            subtitle="Staff sign in with a username + PIN. The owner account is protected."
            action={
              <Button
                size="sm"
                onClick={() =>
                  setEditing({
                    staffId: db.staff[0]?.id ?? "st-new",
                    username: "",
                    pin: "",
                    role: "cashier",
                    perms: {},
                    active: true,
                    createdAt: new Date().toISOString(),
                  })
                }
              >
                + Add account
              </Button>
            }
          />
          {db.accounts.length === 0 ? (
            <EmptyState icon={<IcShield size={20} />} title="No accounts yet" subtitle="Add staff accounts so each person signs in with their own PIN." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-ink-100 bg-ink-50/60"><tr><Th>User</Th><Th>Username</Th><Th>Role</Th><Th>Modules</Th><Th>Status</Th><Th className="text-right">Actions</Th></tr></thead>
                <tbody className="divide-y divide-ink-100">
                  {db.accounts.map((a) => {
                    const staff = db.staff.find((s) => s.id === a.staffId);
                    const modules = ALL_MODULES.filter((m) => permFor(a, m) !== "none").length;
                    return (
                      <tr key={a.staffId}>
                        <Td className="font-medium text-ink-900">{staff?.name ?? "Owner"}{a.isOwner ? <Badge tone="violet">owner</Badge> : null}</Td>
                        <Td><code className="rounded bg-ink-100 px-1.5 py-0.5 text-xs">{a.username}</code></Td>
                        <Td><Badge tone={a.role === "owner" ? "violet" : a.role === "manager" ? "blue" : "neutral"}>{ROLE_LABELS[a.role]}</Badge></Td>
                        <Td className="text-xs text-ink-500">{modules} of {ALL_MODULES.length}</Td>
                        <Td><Badge tone={a.active ? "green" : "red"}>{a.active ? "Active" : "Disabled"}</Badge></Td>
                        <Td className="text-right">
                          {a.isOwner ? (
                            <span className="text-xs text-ink-400">Protected</span>
                          ) : (
                            <div className="flex justify-end gap-1.5">
                              <Button size="sm" variant="secondary" onClick={() => setEditing(a)}>Edit</Button>
                              <Button size="sm" variant="ghost" onClick={() => toggleActive(a.staffId)}>{a.active ? "Disable" : "Enable"}</Button>
                            </div>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {tab === "permissions" ? <PermissionMatrix /> : null}

      {tab === "audit" ? <AuditTab /> : null}

      {editing ? (
        <AccountModal
          account={editing}
          staffNames={Object.fromEntries(db.staff.map((s) => [s.id, s.name]))}
          onClose={() => setEditing(null)}
          onSave={saveAccount}
        />
      ) : null}
    </div>
  );
}

/* ---------------- Permission matrix ---------------- */

function PermissionMatrix() {
  const { db, update } = useApp();
  const accounts = db.accounts.filter((a) => !a.isOwner);

  const setCell = (staffId: string, m: ModuleKey, perm: string) => {
    update((d) => ({
      ...d,
      accounts: d.accounts.map((a) =>
        a.staffId === staffId ? { ...a, role: "custom", perms: { ...a.perms, [m]: perm as never } } : a,
      ),
    }));
  };

  const applyPreset = (staffId: string, role: PresetRole) => {
    update((d) => ({
      ...d,
      accounts: d.accounts.map((a) => (a.staffId === staffId ? { ...a, role, perms: role === "custom" ? a.perms : {} } : a)),
    }));
  };

  if (accounts.length === 0) {
    return (
      <Card>
        <EmptyState icon={<IcStaff size={20} />} title="No staff accounts to configure" subtitle="Add an account first, then fine-tune what it can see, edit or delete per module." />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Who can do what" subtitle="View < Edit < Full (edit + delete). Changing a cell switches the account to a custom role." />
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-ink-100 bg-ink-50/60">
            <tr>
              <Th>Module</Th>
              {accounts.map((a) => <Th key={a.staffId} className="text-center">{db.staff.find((s) => s.id === a.staffId)?.name ?? a.username}</Th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {ALL_MODULES.map((m) => (
              <tr key={m}>
                <Td className="font-medium text-ink-800">{MODULE_LABELS[m]}</Td>
                {accounts.map((a) => {
                  const p = permFor(a, m);
                  return (
                    <Td key={m} className="text-center">
                      <select
                        value={a.role !== "custom" ? (rolePerms(a.role)[m] ?? "none") : p}
                        onChange={(e) => setCell(a.staffId, m, e.target.value)}
                        className="rounded-md border border-ink-200 bg-white px-1.5 py-1 text-xs focus:border-brand-500 focus:outline-none"
                      >
                        {Object.entries(PERM_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </Td>
                  );
                })}
              </tr>
            ))}
            <tr className="bg-ink-50/60">
              <Td className="font-semibold">Preset</Td>
              {accounts.map((a) => (
                <Td key={a.staffId} className="text-center">
                  <Select value={a.role} onChange={(e) => applyPreset(a.staffId, e.target.value as PresetRole)} className="!py-1 !text-xs">
                    {(["manager", "cashier", "accountant", "custom"] as PresetRole[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </Select>
                </Td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="border-t border-ink-100 px-5 py-3 space-y-1">
        {(["manager", "cashier", "accountant"] as PresetRole[]).map((r) => (
          <p key={r} className="text-xs text-ink-500"><b>{ROLE_LABELS[r]}:</b> {ROLE_HINTS[r]}</p>
        ))}
      </div>
    </Card>
  );
}

/* ---------------- Audit ---------------- */

function AuditTab() {
  const { db } = useApp();
  const [q, setQ] = useState("");
  const [action, setAction] = useState("all");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return db.audit.filter(
      (e) =>
        (action === "all" || e.action === action) &&
        (!needle || e.actor.toLowerCase().includes(needle) || e.ref.toLowerCase().includes(needle) || e.detail.toLowerCase().includes(needle) || e.entity.toLowerCase().includes(needle)),
    );
  }, [db.audit, q, action]);

  const exportCsv = () => {
    downloadCSV("managix-audit-log", [
      ["When", "Who", "Action", "Entity", "Reference", "Detail"],
      ...rows.map((e) => [fmtDateTime(e.at), e.actor, e.action, e.entity, e.ref, e.detail]),
    ]);
  };

  const toneFor = (a: string) =>
    a === "delete" ? "red" : a === "create" ? "green" : a === "restore" ? "blue" : a === "purge" ? "red" : a === "sale" ? "green" : "neutral";

  return (
    <Card>
      <CardHeader
        title="Every change, recorded"
        subtitle="Who created, changed or deleted each transaction — newest first"
        action={<Button size="sm" variant="secondary" onClick={exportCsv}>Export CSV</Button>}
      />
      <div className="flex flex-wrap gap-2 px-5 py-3">
        <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search person, invoice, detail…" className="max-w-xs" />
        <Select value={action} onChange={(e) => setAction(e.target.value)} className="max-w-44">
          <option value="all">All actions</option>
          {["create", "update", "delete", "restore", "sale", "payment", "login", "purge"].map((a) => <option key={a} value={a}>{a}</option>)}
        </Select>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="Nothing recorded yet" subtitle="Actions like creating a sale or deleting a product will appear here automatically." />
      ) : (
        <div className="max-h-[30rem] divide-y divide-ink-100 overflow-y-auto">
          {rows.map((e) => (
            <div key={e.id} className="flex items-start gap-3 px-5 py-2.5">
              <Badge tone={toneFor(e.action) as never}>{e.action}</Badge>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink-800">{auditSummary(e)}</p>
                <p className="text-[11px] text-ink-400">{fmtDateTime(e.at)} · {e.entity}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ---------------- Account modal ---------------- */

function AccountModal({
  account, staffNames, onClose, onSave,
}: {
  account: StaffAccount;
  staffNames: Record<string, string>;
  onClose: () => void;
  onSave: (a: StaffAccount) => void;
}) {
  const [a, setA] = useState<StaffAccount>(account);
  const set = (patch: Partial<StaffAccount>) => setA((x) => ({ ...x, ...patch }));

  return (
    <Modal
      open
      onClose={onClose}
      title={account.username ? "Edit account" : "New staff account"}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!a.username.trim() || a.pin.trim().length < 4} onClick={() => onSave(a)}>Save</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-ink-500">Staff member: <b className="text-ink-800">{staffNames[a.staffId] ?? "—"}</b></p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-500">Username</span>
            <TextInput value={a.username} onChange={(e) => set({ username: e.target.value.replace(/\s/g, "").toLowerCase() })} placeholder="e.g. rahim" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-500">PIN (4+ digits)</span>
            <TextInput value={a.pin} onChange={(e) => set({ pin: e.target.value.replace(/\D/g, "").slice(0, 6) })} placeholder="••••" />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-500">Role</span>
          <Select value={a.role} onChange={(e) => set({ role: e.target.value as PresetRole, perms: e.target.value === "custom" ? a.perms : {} })}>
            {(["manager", "cashier", "accountant", "custom"] as PresetRole[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </Select>
        </label>
        <p className="rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-500">{ROLE_HINTS[a.role]}</p>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" checked={a.active} onChange={(e) => set({ active: e.target.checked })} className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500" />
          Account active (can sign in)
        </label>
      </div>
    </Modal>
  );
}
