import { useMemo, useState } from "react";
import { useApp } from "../App";
import { makeSale, updateSignature, startDelivery, advanceDelivery } from "../lib/store";
import { parseOrderText } from "../lib/whatsapp";
import { customerLocation, SHOP_LOCATION } from "../lib/delivery";
import { hasFeature } from "../lib/plans";
import { fmtMoney, fmtDateTime, classNames } from "../lib/helpers";
import type { Sale } from "../types";
import {
  Badge, Button, Card, CardHeader, Field, LockedCard, Modal, NumberInput,
  Segmented, Select, SignPad, TextArea, TextInput, VoiceButton, useToast,
} from "../ui";

type Tab = "whatsapp" | "delivery" | "esign" | "voice";

const TAB_FEATURE = {
  whatsapp: "whatsapp_orders",
  delivery: "delivery_tracking",
  esign: "e_signature",
  voice: "voice_entry",
} as const;

export default function ToolsPage() {
  const { db, navigate } = useApp();
  const [tab, setTab] = useState<Tab>("whatsapp");
  const sub = db.subscription;
  const allowed: Tab[] = (["whatsapp", "delivery", "esign", "voice"] as Tab[]).filter((t) =>
    hasFeature(sub, TAB_FEATURE[t]),
  );
  const active = allowed.includes(tab) ? tab : (allowed[0] ?? tab);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink-900">Tools & Extras</h1>
        <p className="text-sm text-ink-500">Order automation, delivery tracking, signatures and voice — included in Pro and above.</p>
      </div>

      <Segmented
        options={[
          { value: "whatsapp", label: "💬 WhatsApp orders" },
          { value: "delivery", label: "🛵 Delivery GPS" },
          { value: "esign", label: "✍️ E-sign" },
          { value: "voice", label: "🎤 Voice entry" },
        ]}
        value={active}
        onChange={(v) => setTab(v as Tab)}
      />

      {allowed.length === 0 ? (
        <div className="py-6">
          <LockedCard feature={TAB_FEATURE[tab]} title="Pro tools are locked" onBilling={() => navigate("billing")} />
        </div>
      ) : (
        <>
          {active === "whatsapp" && <WhatsAppTab />}
          {active === "delivery" && <DeliveryTab />}
          {active === "esign" && <EsignTab />}
          {active === "voice" && <VoiceTab />}
        </>
      )}
    </div>
  );
}

/* ---------------- WhatsApp order → invoice ---------------- */

function WhatsAppTab() {
  const { db, update, currency } = useApp();
  const toast = useToast();
  const [text, setText] = useState("");
  const [payment, setPayment] = useState<"Due" | "Cash">("Due");
  const [customerId, setCustomerId] = useState("");
  const [confirm, setConfirm] = useState(false);

  const parsed = useMemo(
    () => (text.trim() ? parseOrderText(db, text) : { items: [], unmatched: [] }),
    [text, db],
  );
  const total = parsed.items.reduce((s, it) => s + it.unitPrice * it.qty, 0);

  const createInvoice = () => {
    if (parsed.items.length === 0) return;
    const lines = parsed.items.map((it) => ({
      productId: it.productId,
      name: it.name,
      unitPrice: it.unitPrice,
      qty: it.qty,
      discount: 0,
    }));
    const isDue = payment === "Due";
    const { db: next, sale } = makeSale(db, {
      items: lines,
      payment: isDue ? "Due" : "Cash",
      customerId: customerId || null,
      discount: 0,
      taxRate: 0,
      shipping: 0,
      paidAmount: isDue ? 0 : total,
      note: "Created from WhatsApp order",
      cashier: db.settings.ownerName,
    });
    update(() => next);
    setConfirm(false);
    setText("");
    toast(`Invoice ${sale.invoiceNo} created — ${fmtMoney(sale.total, currency)}`);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Paste the customer's WhatsApp message" subtitle="Lines like “2 x cola”, “3 chocolate” or “দুধ ২” are matched to your catalog." />
        <div className="space-y-3 px-5 py-4">
          <TextArea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={"2 x cola 6-pack\n1 basmati rice 5kg\nmilk 2"} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Payment">
              <Select value={payment} onChange={(e) => setPayment(e.target.value as typeof payment)}>
                <option value="Due">Due (record as credit)</option>
                <option value="Cash">Paid by cash on delivery</option>
              </Select>
            </Field>
            <Field label="Customer (for dues)">
              <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Walk-in</option>
                {db.customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Button variant="primary" size="md" className="w-full" disabled={parsed.items.length === 0} onClick={() => setConfirm(true)}>
            Review invoice · {fmtMoney(total, currency)}
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Matched items" subtitle={`${parsed.items.length} matched · ${parsed.unmatched.length} unmatched`} />
        <div className="space-y-2 px-5 py-4">
          {parsed.items.map((it) => (
            <div key={it.productId} className="flex items-center justify-between rounded-lg border border-ink-100 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-ink-800">{it.qty} × {it.name}</p>
                <p className="text-xs text-ink-400">{fmtMoney(it.unitPrice, currency)} each</p>
              </div>
              <span className="text-sm font-semibold text-ink-900">{fmtMoney(it.unitPrice * it.qty, currency)}</span>
            </div>
          ))}
          {parsed.unmatched.map((line, i) => (
            <div key={i} className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Couldn't match: “{line}” — add the product first or adjust the wording.
            </div>
          ))}
          {text.trim() && parsed.items.length === 0 && parsed.unmatched.length === 0 ? (
            <p className="text-sm text-ink-400">Nothing to match yet — type or paste an order on the left.</p>
          ) : null}
        </div>
      </Card>

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Confirm invoice"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirm(false)}>Back</Button>
            <Button variant="primary" onClick={createInvoice}>Create invoice</Button>
          </div>
        }
      >
        <div className="space-y-2 text-sm">
          {parsed.items.map((it) => (
            <div key={it.productId} className="flex justify-between">
              <span className="text-ink-600">{it.qty} × {it.name}</span>
              <span className="font-medium">{fmtMoney(it.unitPrice * it.qty, currency)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-ink-100 pt-2 text-base font-bold">
            <span>Total</span><span>{fmtMoney(total, currency)}</span>
          </div>
          <p className="pt-2 text-xs text-ink-400">
            Payment: {payment === "Due" ? "Due (full amount becomes customer credit)" : "Paid by cash"}. Stock will be reduced.
          </p>
        </div>
      </Modal>
    </div>
  );
}

/* ---------------- GPS delivery tracking ---------------- */

function DeliveryTab() {
  const { db, update, currency, navigate } = useApp();
  const toast = useToast();
  const [driver, setDriver] = useState("Karim");
  const [trackId, setTrackId] = useState<string | null>(null);

  const deliveries = db.sales.filter((s) => s.delivery);
  const tracked = deliveries.find((s) => s.id === trackId) ?? null;

  const startable = db.sales.filter((s) => !s.delivery && s.paidAmount > 0).slice(0, 6);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Start a delivery" subtitle="Pick a paid sale and assign a driver. The van starts at the shop." />
        <div className="space-y-3 px-5 py-4">
          <Field label="Driver name">
            <TextInput value={driver} onChange={(e) => setDriver(e.target.value)} />
          </Field>
          <div className="space-y-2">
            {startable.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-ink-100 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-ink-800">{s.invoiceNo}</p>
                  <p className="text-xs text-ink-400">
                    {s.customerId ? db.customers.find((c) => c.id === s.customerId)?.name ?? "—" : "Walk-in"} · {fmtMoney(s.total, currency)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    update((d) => startDelivery(d, s.id, driver).db);
                    toast(`Delivery started for ${s.invoiceNo}`);
                  }}
                >
                  Start
                </Button>
              </div>
            ))}
            {startable.length === 0 ? <p className="text-sm text-ink-400">All sales are already tracked or nothing to deliver.</p> : null}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Active deliveries" subtitle={`${deliveries.filter((d) => d.delivery!.status !== "Delivered").length} in progress`} />
        <div className="space-y-2 px-5 py-4">
          {deliveries.length === 0 ? (
            <p className="text-sm text-ink-400">No deliveries yet — start one from the left panel.</p>
          ) : (
            deliveries.map((s) => {
              const st = s.delivery!.status;
              return (
                <div key={s.id} className="flex items-center justify-between rounded-lg border border-ink-100 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-ink-800">{s.invoiceNo}</p>
                    <p className="text-xs text-ink-400">{s.delivery!.driver} · updated {fmtDateTime(s.delivery!.updatedAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={st === "Delivered" ? "green" : st === "On the way" ? "blue" : "neutral"}>{st}</Badge>
                    <Button size="sm" variant="secondary" onClick={() => setTrackId(s.id)}>Track</Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      <DeliveryMap sale={tracked} onClose={() => setTrackId(null)} onUpdate={(id) => update((d) => advanceDelivery(d, id).db)} />
    </div>
  );
}

function DeliveryMap({ sale, onClose, onUpdate }: { sale: Sale | null; onClose: () => void; onUpdate: (saleId: string) => void }) {
  const { currency } = useApp();
  if (!sale?.delivery) return null;
  const t = sale.delivery;
  const target = customerLocation(sale.id);

  // Mini-map projection
  const minLat = Math.min(SHOP_LOCATION.lat, target.lat, t.lat) - 0.004;
  const maxLat = Math.max(SHOP_LOCATION.lat, target.lat, t.lat) + 0.004;
  const minLng = Math.min(SHOP_LOCATION.lng, target.lng, t.lng) - 0.004;
  const maxLng = Math.max(SHOP_LOCATION.lng, target.lng, t.lng) + 0.004;
  const px = (lng: number) => ((lng - minLng) / (maxLng - minLng)) * 300;
  const py = (lat: number) => 300 - ((lat - minLat) / (maxLat - minLat)) * 300;

  return (
    <Modal open onClose={onClose} title={`Tracking ${sale.invoiceNo}`}>
      <div className="space-y-3">
        <div className="relative mx-auto overflow-hidden rounded-xl border border-ink-200" style={{ width: 300, height: 300 }}>
          <svg width="300" height="300" viewBox="0 0 300 300" className="bg-ink-50">
            <line x1={px(SHOP_LOCATION.lng)} y1={py(SHOP_LOCATION.lat)} x2={px(target.lng)} y2={py(target.lat)} stroke="#b0b9c8" strokeDasharray="5 5" strokeWidth="2" />
            <circle cx={px(t.lng)} cy={py(t.lat)} r="26" fill="#2e8560" opacity="0.12" />
            <text x={px(SHOP_LOCATION.lng)} y={py(SHOP_LOCATION.lat) + 6} textAnchor="middle" fontSize="18">🏪</text>
            <text x={px(target.lng)} y={py(target.lat) + 6} textAnchor="middle" fontSize="18">📍</text>
            <text x={px(t.lng)} y={py(t.lat) + 7} textAnchor="middle" fontSize="20">🛵</text>
          </svg>
        </div>
        <div className="flex items-center justify-between">
          <Badge tone={t.status === "Delivered" ? "green" : t.status === "On the way" ? "blue" : "neutral"}>
            {t.status} · {t.driver}
          </Badge>
          <span className="text-xs text-ink-400">{fmtMoney(sale.total, currency)}</span>
        </div>
        <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-500">
          {t.history.map((h, i) => (
            <p key={i}>{fmtDateTime(h.at)} — {h.status}</p>
          ))}
        </div>
        <Button
          variant="primary"
          className="w-full"
          disabled={t.status === "Delivered"}
          onClick={() => onUpdate(sale.id)}
        >
          {t.status === "Preparing" ? "Mark “On the way”" : t.status === "On the way" ? "Advance driver position" : "Delivered ✓"}
        </Button>
      </div>
    </Modal>
  );
}

/* ---------------- E-sign any invoice ---------------- */

function EsignTab() {
  const { db, update } = useApp();
  const toast = useToast();
  const [target, setTarget] = useState<Sale | null>(null);
  const [sig, setSig] = useState<string | null>(null);

  const recent = [...db.sales].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 10);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Recent invoices" subtitle="Open an invoice to capture or replace its signature." />
        <div className="divide-y divide-ink-100">
          {recent.map((s) => (
            <div key={s.id} className="flex items-center justify-between px-5 py-2.5">
              <div>
                <p className="text-sm font-medium text-ink-800">{s.invoiceNo}</p>
                <p className="text-xs text-ink-400">{fmtDateTime(s.at)}</p>
              </div>
              <div className="flex items-center gap-2">
                {s.signature ? <Badge tone="green">signed</Badge> : <Badge>unsigned</Badge>}
                <Button size="sm" variant="secondary" onClick={() => { setTarget(s); setSig(s.signature ?? null); }}>Sign</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title={`Signature — ${target?.invoiceNo ?? ""}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setTarget(null)}>Cancel</Button>
            <Button
              disabled={!sig}
              onClick={() => {
                if (!target) return;
                update((d) => updateSignature(d, target.id, sig));
                toast(`Signature saved on ${target.invoiceNo}`);
                setTarget(null);
              }}
            >
              Save signature
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-ink-500">Ask the customer to sign in the box below — it's stored on the invoice.</p>
          <SignPad onChange={setSig} height={170} />
        </div>
      </Modal>
    </div>
  );
}

/* ---------------- Voice entry ---------------- */

function VoiceTab() {
  const { db, update, navigate } = useApp();
  const toast = useToast();
  const [lang, setLang] = useState<"en-US" | "bn-BD">("en-US");
  const [text, setText] = useState("");

  const parsed = useMemo(() => (text.trim() ? parseOrderText(db, text) : { items: [], unmatched: [] }), [text, db]);
  const total = parsed.items.reduce((s, it) => s + it.unitPrice * it.qty, 0);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Speak an order" subtitle="Uses your browser's speech recognition. Bangla and English supported." />
        <div className="space-y-3 px-5 py-4">
          <div className="flex items-center gap-2">
            <VoiceButton lang={lang} onText={(t) => setText((x) => (x ? `${x}\n${t}` : t))} onError={(m) => toast(m, "error")} />
            <button
              onClick={() => setLang((l) => (l === "en-US" ? "bn-BD" : "en-US"))}
              className="rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-ink-600 hover:bg-ink-50"
            >
              {lang === "en-US" ? "English" : "বাংলা"}
            </button>
            {text ? (
              <Button size="sm" variant="ghost" onClick={() => setText("")}>Clear</Button>
            ) : null}
          </div>
          <TextArea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Dictated items appear here — edit if needed…" />
          <p className="text-xs text-ink-400">
            Tip: say items one per line, e.g. “two cola”, “one milk”. Number words are matched loosely; edit the text for exact quantities.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Matched items" subtitle={`${parsed.items.length} matched`} />
        <div className="space-y-2 px-5 py-4">
          {parsed.items.map((it) => (
            <div key={it.productId} className="flex items-center justify-between rounded-lg border border-ink-100 px-3 py-2">
              <span className="text-sm text-ink-800">{it.qty} × {it.name}</span>
              <span className="text-sm font-semibold">{fmtMoney(it.unitPrice * it.qty, db.settings.currency)}</span>
            </div>
          ))}
          {parsed.unmatched.map((l, i) => (
            <div key={i} className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">Couldn't match: “{l}”</div>
          ))}
          <Button
            variant="primary"
            className="w-full"
            disabled={parsed.items.length === 0}
            onClick={() => {
              const lines = parsed.items.map((it) => ({ productId: it.productId, name: it.name, unitPrice: it.unitPrice, qty: it.qty, discount: 0 }));
              const { db: next, sale } = makeSale(db, {
                items: lines,
                payment: "Cash",
                customerId: null,
                discount: 0,
                taxRate: 0,
                shipping: 0,
                paidAmount: total,
                note: "Voice entry",
                cashier: db.settings.ownerName,
              });
              update(() => next);
              setText("");
              toast(`Sale ${sale.invoiceNo} created`);
              navigate("sales");
            }}
          >
            Create sale · {fmtMoney(total, db.settings.currency)}
          </Button>
        </div>
      </Card>
    </div>
  );
}
