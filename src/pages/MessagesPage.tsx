import { useMemo, useState } from "react";
import { useApp } from "../App";
import type { Thread } from "../types";
import { customerDue, supplierDue } from "../lib/store";
import { fmtMoney, fmtDate, fmtDateTime, uid, classNames, daysAgoISO } from "../lib/helpers";
import { logAudit } from "../lib/audit";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Modal, Select, TextArea, TextInput, useToast, Th, Td } from "../ui";
import { IcChat, IcUsers, IcMegaphone, IcBuilding } from "../icons";

type Tab = "reminders" | "chats" | "campaigns";

export default function MessagesPage() {
  const { db, update, currency } = useApp();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("reminders");

  const dueCustomers = useMemo(
    () =>
      db.customers
        .map((c) => ({ c, due: customerDue(db, c.id, c.openingDue) }))
        .filter((r) => r.due > 0.009)
        .sort((a, b) => b.due - a.due),
    [db],
  );

  const sendReminder = (customerId: string, method: "sms" | "call" | "whatsapp") => {
    const c = db.customers.find((x) => x.id === customerId);
    if (!c) return;
    const amount = customerDue(db, c.id, c.openingDue);
    update((d) => {
      const log = {
        id: uid("rem"),
        at: new Date().toISOString(),
        customerId: c.id,
        customerName: c.name,
        amount,
        method,
        note: method === "call" ? "Reminder call logged" : `Reminder sent asking to clear ${fmtMoney(amount, d.settings.currency)}`,
      };
      return { ...d, reminders: [log, ...d.reminders], audit: logAudit(d.audit, "update", "Customer", c.name, `Due reminder (${method}) — ${fmtMoney(amount, currency)}`) };
    });
    toast(method === "call" ? `Call logged for ${c.name}` : `Reminder ${method === "sms" ? "SMS" : "WhatsApp"} sent to ${c.name}`);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-ink-900">Messages</h1>
        <p className="text-sm text-ink-500">Collect dues faster and keep customers close — reminders, chats and announcements in one place</p>
      </div>

      <div className="inline-flex rounded-lg border border-ink-200 bg-ink-50 p-0.5">
        {([
          ["reminders", "Due reminders", dueCustomers.length],
          ["chats", "Chats", db.threads.filter((t) => t.unread > 0).length],
          ["campaigns", "Announcements", 0],
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

      {tab === "reminders" ? (
        <Card>
          <CardHeader title="Customers who owe you" subtitle="One tap sends an SMS or logs a reminder call — history is kept below" />
          {dueCustomers.length === 0 ? (
            <EmptyState title="Nobody owes you right now" subtitle="When a due sale is recorded, the customer shows up here with a one-tap reminder." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-ink-100 bg-ink-50/60"><tr><Th>Customer</Th><Th>Phone</Th><Th>Due</Th><Th>Last reminder</Th><Th className="text-right">Actions</Th></tr></thead>
                <tbody className="divide-y divide-ink-100">
                  {dueCustomers.map(({ c, due }) => {
                    const last = db.reminders.find((r) => r.customerId === c.id);
                    return (
                      <tr key={c.id}>
                        <Td className="font-medium text-ink-900">{c.name}</Td>
                        <Td>{c.phone}</Td>
                        <Td className="font-bold text-red-600">{fmtMoney(due, currency)}</Td>
                        <Td>{last ? <span className="text-xs text-ink-500">{fmtDate(last.at)} · {last.method}</span> : <span className="text-xs text-ink-300">never</span>}</Td>
                        <Td className="text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" variant="secondary" onClick={() => sendReminder(c.id, "sms")}>SMS</Button>
                            <Button size="sm" variant="secondary" onClick={() => sendReminder(c.id, "whatsapp")}>WhatsApp</Button>
                            <Button size="sm" variant="ghost" onClick={() => sendReminder(c.id, "call")}>Log call</Button>
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {db.reminders.length > 0 ? (
            <div className="border-t border-ink-100 px-5 py-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Reminder history</p>
              <div className="space-y-1.5">
                {db.reminders.slice(0, 8).map((r) => (
                  <p key={r.id} className="text-xs text-ink-500">
                    <span className="font-medium text-ink-700">{r.customerName}</span> — {r.note} · {fmtDateTime(r.at)}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      {tab === "chats" ? <ChatsTab /> : null}
      {tab === "campaigns" ? <CampaignsTab /> : null}
    </div>
  );
}

/* ---------------- Chats ---------------- */

function ChatsTab() {
  const { db, update } = useApp();
  const [activeId, setActiveId] = useState<string | null>(db.threads[0]?.id ?? null);
  const [draft, setDraft] = useState("");

  const thread = db.threads.find((t) => t.id === activeId) ?? null;

  const partyName = (t: Thread) => {
    if (t.party === "customer") return db.customers.find((c) => c.id === t.partyId)?.name ?? "Customer";
    return db.suppliers.find((s) => s.id === t.partyId)?.name ?? "Supplier";
  };
  const partyPhone = (t: Thread) => {
    if (t.party === "customer") return db.customers.find((c) => c.id === t.partyId)?.phone ?? "";
    return db.suppliers.find((s) => s.id === t.partyId)?.phone ?? "";
  };

  const openThreadFor = (id: string, party: "customer" | "supplier") => {
    const existing = db.threads.find((t) => t.partyId === id && t.party === party);
    if (existing) { setActiveId(existing.id); return; }
    const t: Thread = { id: uid("thr"), party, partyId: id, messages: [], unread: 0, updatedAt: new Date().toISOString() };
    update((d) => ({ ...d, threads: [t, ...d.threads] }));
    setActiveId(t.id);
  };

  const send = () => {
    if (!draft.trim() || !thread) return;
    const msg = { id: uid("cm"), at: new Date().toISOString(), from: "me" as const, text: draft.trim(), kind: "chat" as const };
    update((d) => ({
      ...d,
      threads: d.threads.map((t) => (t.id === thread.id ? { ...t, messages: [...t.messages, msg], updatedAt: msg.at } : t)),
    }));
    setDraft("");
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <Card className="max-h-[32rem] overflow-y-auto">
        <div className="border-b border-ink-100 px-4 py-3"><p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Conversations</p></div>
        <div className="p-2">
          {db.customers.slice(0, 6).map((c) => (
            <button key={c.id} onClick={() => openThreadFor(c.id, "customer")} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-ink-50">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">{c.name.slice(0, 1)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink-800">{c.name}</span>
                <span className="block text-[11px] text-ink-400">Customer</span>
              </span>
            </button>
          ))}
          {db.suppliers.slice(0, 4).map((s) => (
            <button key={s.id} onClick={() => openThreadFor(s.id, "supplier")} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-ink-50">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-50 text-xs font-bold text-sky-700"><IcBuilding size={14} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink-800">{s.name}</span>
                <span className="block text-[11px] text-ink-400">Supplier</span>
              </span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="flex max-h-[32rem] flex-col">
        {!thread ? (
          <EmptyState icon={<IcChat size={20} />} title="Pick a conversation" subtitle="Choose a customer or supplier on the left, or tap one from their page." />
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-ink-100 px-5 py-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">{partyName(thread).slice(0, 1)}</span>
              <div>
                <p className="text-sm font-semibold text-ink-900">{partyName(thread)}</p>
                <p className="text-xs text-ink-400">{partyPhone(thread)} · {thread.party}</p>
              </div>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
              {thread.messages.length === 0 ? (
                <p className="py-8 text-center text-xs text-ink-400">No messages yet — say hello 👋</p>
              ) : (
                thread.messages.map((m) => (
                  <div key={m.id} className={classNames("flex", m.from === "me" ? "justify-end" : "justify-start")}>
                    <div className={classNames(
                      "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm",
                      m.from === "me" ? "rounded-br-md bg-brand-600 text-white" : "rounded-bl-md bg-ink-100 text-ink-800",
                    )}>
                      <p>{m.text}</p>
                      <p className={classNames("mt-0.5 text-[10px]", m.from === "me" ? "text-white/60" : "text-ink-400")}>{fmtDateTime(m.at)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="flex gap-2 border-t border-ink-100 p-3">
              <TextInput value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Type a message…" />
              <Button onClick={send} disabled={!draft.trim()}>Send</Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

/* ---------------- Campaigns ---------------- */

function CampaignsTab() {
  const { db, update, currency } = useApp();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<"all" | "due" | "loyal" | "inactive">("all");
  const [channel, setChannel] = useState<"sms" | "announcement">("sms");
  const [adFb, setAdFb] = useState("");
  const [adGoogle, setAdGoogle] = useState("");

  const audienceCounts = {
    all: db.customers.length,
    due: db.customers.filter((c) => customerDue(db, c.id, c.openingDue) > 0.009).length,
    loyal: db.customers.filter((c) => c.points > 20).length,
    inactive: db.customers.filter((c) => !db.sales.some((s) => s.customerId === c.id && Date.now() - new Date(s.at).getTime() < 30 * 86400000)).length,
  };

  const send = () => {
    const count = audienceCounts[audience];
    if (!title.trim() || !body.trim()) return;
    update((d) => ({
      ...d,
      campaigns: [{ id: uid("cmp"), at: new Date().toISOString(), title: title.trim(), body: body.trim(), audience, count, channel }, ...d.campaigns],
      audit: logAudit(d.audit, "create", "Campaign", title.trim(), `${channel} to ${count} customers (${audience})`),
    }));
    toast(`${channel === "sms" ? "SMS" : "In-app announcement"} queued for ${count} customers`);
    setOpen(false);
    setTitle(""); setBody("");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Bulk messages"
          subtitle="Announce offers to the right slice of your customer list"
          action={<Button size="sm" onClick={() => setOpen(true)}><IcMegaphone size={15} /> New campaign</Button>}
        />
        {db.campaigns.length === 0 ? (
          <EmptyState icon={<IcMegaphone size={20} />} title="No campaigns yet" subtitle="Create your first announcement — for example a discount week for customers who haven't visited in 30 days." />
        ) : (
          <div className="divide-y divide-ink-100">
            {db.campaigns.map((c) => (
              <div key={c.id} className="flex items-start gap-3 px-5 py-3.5">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"><IcMegaphone size={16} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-900">{c.title}</p>
                  <p className="text-xs text-ink-500">{c.body}</p>
                  <p className="mt-1 text-[11px] text-ink-400">{fmtDate(c.at)} · {c.channel === "sms" ? "SMS" : "In-app"} · audience: {c.audience} · {c.count} recipients</p>
                </div>
                <Badge tone={c.channel === "sms" ? "blue" : "violet"}>{c.channel === "sms" ? "SMS" : "Announcement"}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Ad accounts (optional connector)" subtitle="Paste a pixel / conversion ID to attribute campaigns — full ad sync coming soon" />
        <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">
          <Field label="Facebook Pixel ID"><TextInput value={adFb} onChange={(e) => setAdFb(e.target.value)} placeholder="e.g. 1234567890" /></Field>
          <Field label="Google Ads ID"><TextInput value={adGoogle} onChange={(e) => setAdGoogle(e.target.value)} placeholder="e.g. AW-12345678" /></Field>
        </div>
        <div className="border-t border-ink-100 px-5 py-3 text-xs text-ink-400">Stored locally for this demo — connects to live ad reporting in the hosted version.</div>
      </Card>

      {open ? (
        <Modal
          open
          onClose={() => setOpen(false)}
          title="New campaign"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={send}>Queue campaign</Button>
            </div>
          }
        >
          <div className="space-y-3">
            <Field label="Title"><TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Eid discount week" /></Field>
            <Field label="Message"><TextArea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Get 10% off all groceries this week!" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Audience">
                <Select value={audience} onChange={(e) => setAudience(e.target.value as typeof audience)}>
                  <option value="all">All customers ({audienceCounts.all})</option>
                  <option value="due">With dues ({audienceCounts.due})</option>
                  <option value="loyal">Loyal — 20+ points ({audienceCounts.loyal})</option>
                  <option value="inactive">Inactive 30+ days ({audienceCounts.inactive})</option>
                </Select>
              </Field>
              <Field label="Channel">
                <Select value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}>
                  <option value="sms">SMS</option>
                  <option value="announcement">In-app announcement</option>
                </Select>
              </Field>
            </div>
            <p className="rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-500">Recipients: <b>{audienceCounts[audience]}</b> · est. cost {fmtMoney(audienceCounts[audience] * 0.5, currency)} (0.50/message demo rate)</p>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
