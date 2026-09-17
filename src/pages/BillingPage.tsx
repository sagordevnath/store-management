import { useMemo, useState } from "react";
import type { BillingCycle, PayMethod, PlanTier } from "../types";
import { useApp } from "../App";
import { cancelSubscription, chargeSubscription, daysLeft, toggleAutoRenew } from "../lib/billing";
import { COUPONS, findCoupon, planName, PLANS, priceFor, subStateSummary } from "../lib/plans";
import { fmtDate, fmtMoney } from "../lib/helpers";
import { Badge, Button, Card, CardHeader, Field, Modal, Select, TextInput, useToast } from "../ui";
import { IcCrown } from "../icons";

export default function BillingPage() {
  const { db, update, navigate } = useApp();
  const toast = useToast();
  const sub = db.subscription;
  const state = subStateSummary(sub);

  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [checkout, setCheckout] = useState<{ tier: Exclude<PlanTier, "trial"> } | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);

  const currentTier = sub.status === "trialing" ? "trial" : sub.tier;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Billing & Plan</h1>
          <p className="text-sm text-ink-500">{state.detail}</p>
        </div>
        <Badge tone={state.tone}>{state.label}</Badge>
      </div>

      {/* Current plan summary */}
      <Card>
        <div className="flex flex-wrap items-center gap-6 px-5 py-4">
          <div className="min-w-40">
            <p className="text-xs text-ink-400">Current plan</p>
            <p className="text-base font-bold text-ink-900">{planName(sub)}</p>
          </div>
          <div className="min-w-40">
            <p className="text-xs text-ink-400">Billing cycle</p>
            <p className="text-sm font-semibold text-ink-800 capitalize">{sub.billingCycle ?? "—"}</p>
          </div>
          <div className="min-w-40">
            <p className="text-xs text-ink-400">
              {sub.status === "past_due" ? "Grace ends" : "Current period ends"}
            </p>
            <p className="text-sm font-semibold text-ink-800">
              {fmtDate(sub.currentPeriodEnd)} · {daysLeft(sub)}d left
            </p>
          </div>
          <div className="min-w-40">
            <p className="text-xs text-ink-400">Auto-renew</p>
            <label className="mt-0.5 flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                className="accent-brand-600"
                checked={sub.autoRenew}
                disabled={sub.status !== "active"}
                onChange={() => {
                  update((d) => toggleAutoRenew(d));
                  toast(sub.autoRenew ? "Auto-renew turned off" : "Auto-renew turned on");
                }}
              />
              {sub.autoRenew ? "On" : "Off"}
            </label>
          </div>
          <div className="ml-auto flex gap-2">
            {sub.status === "active" || sub.status === "past_due" ? (
              <Button
                variant="secondary"
                size="md"
                onClick={() => {
                  update((d) => cancelSubscription(d));
                  toast("Subscription will end at period close — access continues until then.", "info");
                }}
              >
                Cancel subscription
              </Button>
            ) : null}
            {sub.status === "past_due" || sub.status === "expired" || sub.status === "canceled" ? (
              <Button variant="primary" size="md" onClick={() => setCheckout({ tier: sub.tier === "trial" || sub.tier === "basic" ? "basic" : (sub.tier as Exclude<PlanTier, "trial">) })}>
                Renew now
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      {/* Plans */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">Choose a plan</h2>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-ink-200 bg-white p-0.5">
            {(["monthly", "yearly"] as BillingCycle[]).map((c) => (
              <button
                key={c}
                onClick={() => setCycle(c)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${cycle === c ? "bg-ink-900 text-white" : "text-ink-500 hover:text-ink-700"}`}
              >
                {c}{c === "yearly" ? " · 2 mo free" : ""}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {(Object.values(PLANS) as (typeof PLANS)[keyof typeof PLANS][]).map((plan) => {
          const isCurrent = currentTier === plan.tier || (sub.status === "trialing" && plan.tier === "pro");
          const price = priceFor(plan.tier as Exclude<PlanTier, "trial">, cycle, appliedCoupon ? findCoupon(appliedCoupon) : null);
          return (
            <Card key={plan.tier} className={`relative overflow-hidden ${plan.tier === "pro" ? "ring-2 ring-brand-500" : ""}`}>
              {plan.tier === "pro" ? (
                <span className="absolute right-0 top-0 rounded-bl-lg bg-brand-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                  Most popular
                </span>
              ) : null}
              <div className="space-y-4 px-5 py-5">
                <div>
                  <div className={`mb-2 h-1.5 w-10 rounded-full bg-gradient-to-r ${plan.accent}`} />
                  <h3 className="text-base font-bold text-ink-900">{plan.name}</h3>
                  <p className="mt-1 min-h-10 text-xs text-ink-500">{plan.blurb}</p>
                </div>
                <div>
                  <span className="text-2xl font-extrabold text-ink-900">${price}</span>
                  <span className="text-sm text-ink-400"> /{cycle === "monthly" ? "mo" : "yr"}</span>
                </div>
                <ul className="space-y-1.5 text-xs text-ink-600">
                  <li>✓ {plan.limits.products === Infinity ? "Unlimited" : plan.limits.products} products</li>
                  <li>✓ {plan.limits.staff === Infinity ? "Unlimited" : plan.limits.staff} staff · {plan.limits.branches === Infinity ? "unlimited" : plan.limits.branches} branches</li>
                  {plan.features.slice(0, 5).map((f) => (
                    <li key={f}>✓ {FEATURE_LABELS[f]}</li>
                  ))}
                </ul>
                <Button
                  variant={isCurrent ? "secondary" : plan.tier === "pro" ? "primary" : "secondary"}
                  size="md"
                  className="w-full"
                  disabled={isCurrent}
                  onClick={() => setCheckout({ tier: plan.tier as Exclude<PlanTier, "trial"> })}
                >
                  {isCurrent ? "Current plan" : sub.status === "trialing" ? "Choose plan" : plan.tier === "basic" && currentTier !== "trial" ? "Downgrade" : "Upgrade"}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Coupons + invoices */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Have a coupon?" />
          <div className="space-y-3 px-5 py-4">
            <div className="flex gap-2">
              <TextInput
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                placeholder="Enter code"
              />
              <Button
                variant="secondary"
                size="md"
                onClick={() => {
                  const c = findCoupon(couponInput);
                  if (c) {
                    setAppliedCoupon(c.code);
                    toast(`${c.code} applied — ${c.percentOff}% off at checkout`);
                  } else {
                    toast("Invalid coupon code", "error");
                  }
                }}
              >
                Apply
              </Button>
            </div>
            <div className="space-y-1.5">
              {COUPONS.map((c) => (
                <button
                  key={c.code}
                  onClick={() => { setCouponInput(c.code); setAppliedCoupon(c.code); toast(`${c.code} applied`); }}
                  className="flex w-full items-center justify-between rounded-lg border border-dashed border-ink-200 px-3 py-2 text-left hover:bg-ink-50"
                >
                  <span className="font-mono text-xs font-bold text-ink-700">{c.code}</span>
                  <span className="text-xs text-ink-500">{c.description}</span>
                </button>
              ))}
            </div>
            {appliedCoupon ? (
              <p className="text-xs text-emerald-600">✓ {appliedCoupon} will be applied at checkout. You can remove it there.</p>
            ) : null}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Invoice history" subtitle="Subscription payments" />
          {db.subInvoices.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-ink-400">No invoices yet — invoices appear after your first payment.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-ink-50 text-left">
                  <tr>
                    <Th>Invoice</Th><Th>Date</Th><Th>Plan</Th><Th>Method</Th><Th>Amount</Th><Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {db.subInvoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-ink-100 last:border-0">
                      <Td className="font-mono text-xs">{inv.no}</Td>
                      <Td>{fmtDate(inv.at)}</Td>
                      <Td className="capitalize">{inv.tier} · {inv.cycle}</Td>
                      <Td>{inv.method}</Td>
                      <Td className="font-semibold">{fmtMoney(inv.amount, "$")}</Td>
                      <Td>
                        {inv.status === "Paid"
                          ? <Badge tone="green">Paid</Badge>
                          : <Badge tone="amber">Due</Badge>}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <CheckoutModal
        checkout={checkout}
        cycle={cycle}
        onClose={() => setCheckout(null)}
      />
    </div>
  );
}

const FEATURE_LABELS: Record<string, string> = {
  categories_nested: "Nested categories",
  categories_report: "Category-wise reports",
  bulk_recategorize: "Bulk re-categorize",
  ai_suggest: "AI category suggest",
  dashboard_widgets: "Drag-drop dashboard",
  target_progress: "Sales targets",
  cashflow_forecast: "Cash-flow forecast",
  ai_insight: "AI daily insight",
  compare_period: "Period compare",
  whatsapp_orders: "WhatsApp orders",
  delivery_tracking: "GPS delivery tracking",
  e_signature: "E-signatures",
  voice_entry: "Voice entry (BN/EN)",
  support_chat: "Priority support chat",
};

/* ---------------- Mock checkout ---------------- */

function CheckoutModal({
  checkout,
  cycle,
  onClose,
}: {
  checkout: { tier: Exclude<PlanTier, "trial"> } | null;
  cycle: BillingCycle;
  onClose: () => void;
}) {
  const { db, update } = useApp();
  const toast = useToast();
  const [method, setMethod] = useState<PayMethod>("bKash");
  const [cycle_, setCycle_] = useState<BillingCycle>(cycle);
  const [coupon, setCoupon] = useState("");
  const [step, setStep] = useState<"form" | "processing" | "done">("form");
  const [invoiceNo, setInvoiceNo] = useState("");

  const plan = checkout ? PLANS[checkout.tier] : null;
  const cp = coupon ? findCoupon(coupon) : null;
  const amount = plan ? priceFor(checkout!.tier, cycle_, cp) : 0;

  // Payment-detail fields (simulated)
  const [wallet, setWallet] = useState("");
  const [cardNo, setCardNo] = useState("");
  const [cardExp, setCardExp] = useState("");
  const [cardCvc, setCardCvc] = useState("");

  const pay = () => {
    if (!checkout) return;
    setStep("processing");
    window.setTimeout(() => {
      const { db: next, invoice } = chargeSubscription(db, checkout.tier, cycle_, method, { couponCode: coupon || null });
      update(() => next);
      setInvoiceNo(invoice.no);
      setStep("done");
      toast(`Payment successful — ${plan?.name} is active`);
    }, 900);
  };

  if (!checkout || !plan) return null;

  return (
    <Modal open onClose={onClose} title={`Checkout — ${plan.name}`}>
      {step === "form" ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-ink-50 px-4 py-3 text-sm">
            <div className="flex justify-between"><span className="text-ink-500">Plan</span><span className="font-semibold">{plan.name} · {cycle_}</span></div>
            {cp ? (
              <div className="flex justify-between text-emerald-600"><span>Coupon {cp.code}</span><span>−{cp.percentOff}%</span></div>
            ) : null}
            <div className="mt-1 flex justify-between border-t border-ink-200 pt-1.5 text-base font-bold">
              <span>Total due today</span><span>${amount}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Billing cycle">
              <Select value={cycle_} onChange={(e) => setCycle_(e.target.value as BillingCycle)}>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly (2 months free)</option>
              </Select>
            </Field>
            <Field label="Coupon code">
              <TextInput value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder="Optional" />
            </Field>
          </div>

          <Field label="Payment method">
            <div className="grid grid-cols-3 gap-2">
              {(["bKash", "Nagad", "Card"] as PayMethod[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={`rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors ${method === m ? "border-brand-600 bg-brand-50 text-brand-700 ring-1 ring-brand-600" : "border-ink-200 text-ink-600 hover:bg-ink-50"}`}
                >
                  {m === "bKash" ? "📱 bKash" : m === "Nagad" ? "🧡 Nagad" : "💳 Card"}
                </button>
              ))}
            </div>
          </Field>

          {method === "Card" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Card number"><TextInput value={cardNo} onChange={(e) => setCardNo(e.target.value)} placeholder="4242 4242 4242 4242" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Expiry"><TextInput value={cardExp} onChange={(e) => setCardExp(e.target.value)} placeholder="MM/YY" /></Field>
                <Field label="CVC"><TextInput value={cardCvc} onChange={(e) => setCardCvc(e.target.value)} placeholder="123" /></Field>
              </div>
            </div>
          ) : (
            <Field label={`${method} wallet number`} hint="Demo checkout — no real charge is made.">
              <TextInput value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="01XXXXXXXXX" />
            </Field>
          )}

          <Button variant="primary" size="lg" className="w-full" onClick={pay}>
            Pay ${amount} with {method}
          </Button>
          <p className="text-center text-xs text-ink-400">🔒 Demo gateway — auto-renew is enabled after purchase and can be turned off anytime.</p>
        </div>
      ) : step === "processing" ? (
        <div className="flex flex-col items-center py-10">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-ink-200 border-t-brand-600" />
          <p className="mt-4 text-sm text-ink-500">Contacting {method}…</p>
        </div>
      ) : (
        <div className="flex flex-col items-center py-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl">✅</div>
          <h3 className="mt-3 text-base font-bold text-ink-900">Payment successful</h3>
          <p className="mt-1 text-sm text-ink-500">
            {plan.name} · {cycle_} is active. Invoice <span className="font-mono">{invoiceNo}</span> was issued.
          </p>
          <Button variant="primary" size="md" className="mt-5" onClick={onClose}>Done</Button>
        </div>
      )}
    </Modal>
  );
}

// Local table cell imports used above
import { Th, Td } from "../ui";
