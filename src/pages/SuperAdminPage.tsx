import { useEffect, useMemo, useState } from "react";
import {
  loadRegistry, saveRegistry, addAudit, mrr, signupsByMonth, SA_PASSCODE,
  type Registry, type Subscriber, type AdminPlan, type AdminStatus,
} from "../lib/superadmin";
import { fmtDate, fmtDateTime, downloadCSV, classNames } from "../lib/helpers";
import { BarChartH, Badge, Button, Card, CardHeader, Modal, Select, TextInput, Th, Td } from "../ui";

const PLANS: AdminPlan[] = ["trial", "basic", "pro", "enterprise"];
const STATUSES: AdminStatus[] = ["active", "trialing", "past_due", "expired", "suspended"];

const PLAN_PRICE: Record<AdminPlan, number> = { trial: 0, basic: 12, pro: 29, enterprise: 79 };

export default function SuperAdminPage() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem("Managix_sa_auth") === "1");
  const [reg, setReg] = useState<Registry>(loadRegistry);

  const mutate = (fn: (r: Registry) => Registry, action: string, target: string, detail: string) => {
    setReg((prev) => {
      const next = addAudit(fn(prev), action, target, detail);
      saveRegistry(next);
      return next;
    });
  };

  if (!authed) return <PasscodeGate onSuccess={() => setAuthed(true)} />;

  return (
    <div className="min-h-full bg-ink-950">
      <SuperAdmin reg={reg} mutate={mutate} onLogout={() => { sessionStorage.removeItem("Managix_sa_auth"); setAuthed(false); }} />
    </div>
  );
}

function PasscodeGate({ onSuccess }: { onSuccess: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(() => Number(sessionStorage.getItem("Managix_sa_attempts") ?? "0"));
  const [unlockAt, setUnlockAt] = useState(() => Number(sessionStorage.getItem("Managix_sa_unlockAt") ?? "0"));
  const [now, setNow] = useState(Date.now());

  // Lockout ticker
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const locked = unlockAt > now;
  const remaining = Math.ceil((unlockAt - now) / 1000);

  const submit = () => {
    if (locked) return;
    if (code === SA_PASSCODE) {
      sessionStorage.removeItem("Managix_sa_attempts");
      sessionStorage.removeItem("Managix_sa_unlockAt");
      onSuccess();
      return;
    }
    const n = attempts + 1;
    setAttempts(n);
    sessionStorage.setItem("Managix_sa_attempts", String(n));
    if (n >= 5) {
      const until = Date.now() + 60_000;
      setUnlockAt(until);
      sessionStorage.setItem("Managix_sa_unlockAt", String(until));
      setAttempts(0);
      sessionStorage.setItem("Managix_sa_attempts", "0");
      setError("Too many attempts — locked for 60 seconds.");
    } else {
      setError(`Wrong passcode — ${5 - n} attempt(s) left.`);
    }
    setCode("");
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-ink-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-ink-900 p-8 shadow-pop">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-600/20 text-2xl">🛡️</div>
          <h1 className="text-lg font-bold text-white">Super Admin</h1>
          <p className="mt-1 text-xs text-white/50">Restricted area — platform operators only</p>
        </div>
        <input
          type="password"
          value={code}
          disabled={locked}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Access passcode"
          className="h-11 w-full rounded-lg border border-white/15 bg-white/5 px-4 text-center font-mono text-lg tracking-widest text-white placeholder-white/30 focus:border-violet-500 focus:outline-none"
          autoFocus
        />
        {error ? <p className="mt-3 text-center text-xs text-red-400">{error}</p> : null}
        {locked ? <p className="mt-3 text-center text-xs text-amber-400">Locked — retry in {remaining}s</p> : null}
        <Button variant="primary" size="lg" className="mt-5 w-full !bg-violet-600 hover:!bg-violet-700" disabled={locked} onClick={submit}>
          Unlock panel
        </Button>
        <p className="mt-4 text-center text-[11px] text-white/30">Demo passcode: 246810</p>
      </div>
    </div>
  );
}

function SuperAdmin({
  reg, mutate, onLogout,
}: {
  reg: Registry;
  mutate: (fn: (r: Registry) => Registry, action: string, target: string, detail: string) => void;
  onLogout: () => void;
}) {
  const [q, setQ] = useState("");
  const [planF, setPlanF] = useState<string>("all");
  const [statusF, setStatusF] = useState<string>("all");
  const [sort, setSort] = useState<{ key: keyof Subscriber; dir: 1 | -1 }>({ key: "joinedAt", dir: -1 });
  const [confirmRemove, setConfirmRemove] = useState<Subscriber | null>(null);
  const [planEdit, setPlanEdit] = useState<Subscriber | null>(null);
  const [newPlan, setNewPlan] = useState<AdminPlan>("pro");
  const [newPlanStatus, setNewPlanStatus] = useState<AdminStatus>("active");
  const [showDeleted, setShowDeleted] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [tab, setTab] = useState<"subs" | "analytics" | "announcements" | "audit">("subs");

  const live = reg.subscribers.filter((s) => !s.deletedAt);
  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return reg.subscribers
      .filter((s) => (showDeleted ? true : !s.deletedAt))
      .filter((s) => (query ? [s.shopName, s.ownerName, s.email, s.phone].some((f) => f.toLowerCase().includes(query)) : true))
      .filter((s) => (planF === "all" ? true : s.plan === planF))
      .filter((s) => (statusF === "all" ? true : s.status === statusF))
      .sort((a, b) => {
        const av = a[sort.key];
        const bv = b[sort.key];
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * sort.dir;
        return String(av).localeCompare(String(bv)) * sort.dir;
      });
  }, [reg.subscribers, q, planF, statusF, sort, showDeleted]);

  const activeCount = live.filter((s) => s.status === "active").length;
  const trialCount = live.filter((s) => s.status === "trialing").length;
  const suspendedCount = live.filter((s) => s.status === "suspended").length;
  const signups = signupsByMonth(reg, 6);

  const toggleSort = (key: keyof Subscriber) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: -1 }));

  const arrow = (key: keyof Subscriber) => (sort.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : "");

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600/20 text-xl">🛡️</div>
          <div>
            <h1 className="text-lg font-bold text-white">Super Admin</h1>
            <p className="text-xs text-white/50">{live.length} subscribers · MRR ${mrr(reg)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" className="!text-white/60 hover:!bg-white/10" onClick={() => { window.location.hash = ""; }}>
            ← Back to app
          </Button>
          <Button size="sm" variant="ghost" className="!text-white/60 hover:!bg-white/10" onClick={onLogout}>
            Sign out
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["MRR", `$${mrr(reg)}`, "text-emerald-400"],
          ["Active", String(activeCount), "text-brand-400"],
          ["Trials", String(trialCount), "text-violet-400"],
          ["Suspended", String(suspendedCount), "text-amber-400"],
        ].map(([label, value, tone]) => (
          <div key={label} className="rounded-xl border border-white/10 bg-ink-900 px-4 py-3.5">
            <p className="text-xs text-white/45">{label}</p>
            <p className={`mt-0.5 text-xl font-bold ${tone}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(["subs", "analytics", "announcements", "audit"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={classNames(
              "rounded-lg px-3.5 py-1.5 text-xs font-semibold capitalize transition-colors",
              tab === t ? "bg-violet-600 text-white" : "bg-white/5 text-white/60 hover:bg-white/10",
            )}
          >
            {t === "subs" ? "Subscribers" : t === "analytics" ? "Analytics" : t}
          </button>
        ))}
      </div>

      {tab === "subs" ? (
        <Card className="!border-white/10 !bg-ink-900">
          <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
            <TextInput
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search shop, owner, email, phone…"
              className="!border-white/15 !bg-white/5 !text-white placeholder:!text-white/30 max-w-xs"
            />
            <Select value={planF} onChange={(e) => setPlanF(e.target.value)} className="!border-white/15 !bg-white/5 !text-white w-32">
              <option value="all">All plans</option>
              {PLANS.map((p) => <option key={p} value={p} className="text-ink-900">{p}</option>)}
            </Select>
            <Select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="!border-white/15 !bg-white/5 !text-white w-36">
              <option value="all">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s} className="text-ink-900">{s}</option>)}
            </Select>
            <label className="ml-1 flex items-center gap-1.5 text-xs text-white/60">
              <input type="checkbox" className="accent-violet-500" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
              Show removed
            </label>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto !text-white/60 hover:!bg-white/10"
              onClick={() =>
                downloadCSV("subscribers.csv", [
                  ["Shop", "Owner", "Phone", "Email", "Plan", "Status", "Joined", "Last active", "Removed"],
                  ...rows.map((s) => [s.shopName, s.ownerName, s.phone, s.email, s.plan, s.status, s.joinedAt.slice(0, 10), s.lastActiveAt.slice(0, 10), s.deletedAt ? "yes" : "no"]),
                ])
              }
            >
              Export CSV
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/5 text-left">
                <tr>
                  {([
                    ["shopName", "Shop"],
                    ["ownerName", "Owner"],
                    ["plan", "Plan"],
                    ["status", "Status"],
                    ["joinedAt", "Joined"],
                    ["lastActiveAt", "Last active"],
                  ] as [keyof Subscriber, string][]).map(([key, label]) => (
                    <Th key={key} className="!text-white/45 cursor-pointer select-none" >
                      <span onClick={() => toggleSort(key)}>{label}{arrow(key)}</span>
                    </Th>
                  ))}
                  <Th className="!text-white/45 text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((s) => (
                  <tr key={s.id} className={classNames("hover:bg-white/5", s.deletedAt && "opacity-40")}>
                    <Td className="!text-white">
                      <p className="font-medium">{s.shopName}</p>
                      <p className="text-xs text-white/40">{s.email}</p>
                    </Td>
                    <Td className="!text-white/70">
                      <p>{s.ownerName}</p>
                      <p className="text-xs text-white/40">{s.phone}</p>
                    </Td>
                    <Td><Badge tone={s.plan === "enterprise" ? "violet" : s.plan === "pro" ? "blue" : "neutral"}>{s.plan}</Badge></Td>
                    <Td>
                      <Badge tone={s.status === "active" ? "green" : s.status === "trialing" ? "violet" : s.status === "past_due" ? "amber" : s.status === "suspended" ? "red" : "neutral"}>
                        {s.status.replace("_", " ")}
                      </Badge>
                    </Td>
                    <Td className="!text-white/70">{fmtDate(s.joinedAt)}</Td>
                    <Td className="!text-white/70">{fmtDate(s.lastActiveAt)}</Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        {s.deletedAt ? (
                          <Button size="sm" variant="ghost" className="!text-emerald-400 hover:!bg-emerald-500/10" onClick={() => mutate((r) => ({ ...r, subscribers: r.subscribers.map((x) => (x.id === s.id ? { ...x, deletedAt: null } : x)) }), "restore", s.shopName, "Soft-deleted subscriber restored")}>
                            Restore
                          </Button>
                        ) : (
                          <>
                            <Button size="sm" variant="ghost" className="!text-white/60 hover:!bg-white/10" onClick={() => { setPlanEdit(s); setNewPlan(s.plan); setNewPlanStatus(s.status === "suspended" ? "active" : s.status); }}>
                              Plan
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className={s.status === "suspended" ? "!text-emerald-400 hover:!bg-emerald-500/10" : "!text-amber-400 hover:!bg-amber-500/10"}
                              onClick={() =>
                                s.status === "suspended"
                                  ? mutate((r) => ({ ...r, subscribers: r.subscribers.map((x) => (x.id === s.id ? { ...x, status: "active" } : x)) }), "reactivate", s.shopName, "Account reactivated")
                                  : mutate((r) => ({ ...r, subscribers: r.subscribers.map((x) => (x.id === s.id ? { ...x, status: "suspended" } : x)) }), "suspend", s.shopName, "Account suspended")
                              }
                            >
                              {s.status === "suspended" ? "Reactivate" : "Suspend"}
                            </Button>
                            <Button size="sm" variant="ghost" className="!text-red-400 hover:!bg-red-500/10" onClick={() => setConfirmRemove(s)}>
                              Remove
                            </Button>
                          </>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-white/40">No subscribers match.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {tab === "analytics" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="!border-white/10 !bg-ink-900">
            <CardHeader title="Signups — last 6 months" subtitle="New subscribers per month" />
            <div className="px-5 py-4">
              <BarChartH
                data={signups}
                formatValue={(v) => String(v)}
              />
            </div>
          </Card>
          <Card className="!border-white/10 !bg-ink-900">
            <CardHeader title="Plan distribution" subtitle="Paying subscribers by plan" />
            <div className="px-5 py-4">
              <BarChartH
                data={PLANS.filter((p) => p !== "trial").map((p) => ({
                  label: p,
                  value: live.filter((s) => s.plan === p && (s.status === "active" || s.status === "past_due")).length,
                }))}
                formatValue={(v) => String(v)}
              />
            </div>
          </Card>
          <Card className="!border-white/10 !bg-ink-900 lg:col-span-2">
            <CardHeader title="Revenue by plan" subtitle="Estimated monthly recurring revenue" />
            <div className="px-5 py-4">
              <BarChartH
                data={PLANS.filter((p) => p !== "trial").map((p) => ({
                  label: `${p} ($${PLAN_PRICE[p]}/mo each)`,
                  value: live.filter((s) => s.plan === p && (s.status === "active" || s.status === "past_due")).length * PLAN_PRICE[p],
                }))}
                formatValue={(v) => `$${v}`}
              />
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "announcements" ? (
        <Card className="!border-white/10 !bg-ink-900">
          <CardHeader title="Global announcements" subtitle="Shown to all subscribers after their next sync" />
          <div className="space-y-3 px-5 py-4">
            <div className="flex gap-2">
              <TextInput
                value={announcement}
                onChange={(e) => setAnnouncement(e.target.value)}
                placeholder="Write an announcement…"
                className="!border-white/15 !bg-white/5 !text-white placeholder:!text-white/30"
              />
              <Button
                variant="primary"
                className="!bg-violet-600 hover:!bg-violet-700"
                disabled={!announcement.trim()}
                onClick={() => {
                  const id = `ann_${Date.now().toString(36)}`;
                  mutate(
                    (r) => ({ ...r, announcements: [{ id, text: announcement.trim(), at: new Date().toISOString() }, ...r.announcements] }),
                    "announcement",
                    "all",
                    announcement.trim().slice(0, 80),
                  );
                  setAnnouncement("");
                }}
              >
                Publish
              </Button>
            </div>
            <div className="space-y-2">
              {reg.announcements.map((a) => (
                <div key={a.id} className="rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5">
                  <p className="text-sm text-white">{a.text}</p>
                  <p className="mt-0.5 text-[11px] text-white/40">{fmtDateTime(a.at)}</p>
                </div>
              ))}
            </div>
            </div>
        </Card>
      ) : null}

      {tab === "audit" ? (
        <Card className="!border-white/10 !bg-ink-900">
          <CardHeader title="Admin audit log" subtitle="Every action taken in this panel, newest first" />
          <div className="max-h-96 overflow-y-auto divide-y divide-white/5">
            {reg.audit.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-4 px-5 py-2.5">
                <div>
                  <p className="text-sm text-white">
                    <span className="font-semibold capitalize">{a.action}</span>
                    <span className="text-white/50"> · {a.target}</span>
                  </p>
                  <p className="text-xs text-white/40">{a.detail}</p>
                </div>
                <span className="shrink-0 text-xs text-white/40">{fmtDateTime(a.at)}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* Remove confirm */}
      <Modal
        open={!!confirmRemove}
        onClose={() => setConfirmRemove(null)}
        title="Remove subscriber?"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmRemove(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (!confirmRemove) return;
                mutate(
                  (r) => ({ ...r, subscribers: r.subscribers.map((x) => (x.id === confirmRemove.id ? { ...x, deletedAt: new Date().toISOString() } : x)) }),
                  "remove",
                  confirmRemove.shopName,
                  "Soft-deleted (restorable)",
                );
                setConfirmRemove(null);
              }}
            >
              Remove
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm text-ink-600">
          <p><span className="font-semibold text-ink-900">{confirmRemove?.shopName}</span> will lose access at their next sync.</p>
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            Soft delete — the record is kept and can be restored anytime via “Show removed”.
          </p>
        </div>
      </Modal>

      {/* Plan edit */}
      <Modal
        open={!!planEdit}
        onClose={() => setPlanEdit(null)}
        title={`Change plan — ${planEdit?.shopName ?? ""}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPlanEdit(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!planEdit) return;
                mutate(
                  (r) => ({ ...r, subscribers: r.subscribers.map((x) => (x.id === planEdit.id ? { ...x, plan: newPlan, status: newPlanStatus } : x)) }),
                  "plan-change",
                  planEdit.shopName,
                  `${planEdit.plan} → ${newPlan} · status ${newPlanStatus} (manual, no charge)`,
                );
                setPlanEdit(null);
              }}
            >
              Apply change
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-500">Plan</span>
            <Select value={newPlan} onChange={(e) => setNewPlan(e.target.value as AdminPlan)}>
              {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-500">Status</span>
            <Select value={newPlanStatus} onChange={(e) => setNewPlanStatus(e.target.value as AdminStatus)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </label>
          <p className="text-xs text-ink-400">Manual override is free of charge and recorded in the audit log.</p>
        </div>
      </Modal>
    </div>
  );
}
