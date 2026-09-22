import { useMemo, useState } from "react";
import { useApp } from "../App";
import type { WalletChannel } from "../types";
import {
  WALLET_CHANNELS, CHANNEL_FEE_RATE, walletBalance, allWalletBalance, channelNumber,
  setChannelNumber, addWalletTx, todayWalletIn,
} from "../lib/wallet";
import { fmtMoney, fmtDateTime, classNames } from "../lib/helpers";
import { qrSvg } from "../lib/qr";
import { logAudit } from "../lib/audit";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Modal, NumberInput, Select, TextInput, useToast } from "../ui";
import { IcQr, IcWallet } from "../icons";

const CHANNEL_STYLE: Record<WalletChannel, { bg: string; text: string; ring: string; label: string }> = {
  bKash: { bg: "bg-pink-500/10", text: "text-pink-600", ring: "ring-pink-200", label: "bKash" },
  Nagad: { bg: "bg-orange-500/10", text: "text-orange-600", ring: "ring-orange-200", label: "Nagad" },
  Rocket: { bg: "bg-violet-500/10", text: "text-violet-600", ring: "ring-violet-200", label: "Rocket" },
  Bank: { bg: "bg-sky-500/10", text: "text-sky-600", ring: "ring-sky-200", label: "Bank" },
};

export default function WalletPage() {
  const { db, update, currency, navigate } = useApp();
  const toast = useToast();
  const [txOpen, setTxOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const balances = useMemo(
    () => Object.fromEntries(WALLET_CHANNELS.map((ch) => [ch, walletBalance(db, ch)])) as Record<WalletChannel, number>,
    [db],
  );
  const total = allWalletBalance(db);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Digital Wallet</h1>
          <p className="text-sm text-ink-500">Mobile banking money tracked separately from your cash box</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setQrOpen(true)}><IcQr size={16} /> Payment QR</Button>
          <Button onClick={() => setTxOpen(true)}>+ Add money record</Button>
        </div>
      </div>

      {/* Balance hero */}
      <Card className="overflow-hidden">
        <div className="relative bg-ink-950 px-6 py-6 text-white">
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-brand-500/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-pink-500/15 blur-3xl" />
          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-white/50">Total wallet balance</p>
              <p className="mt-1 text-4xl font-extrabold tracking-tight">{fmtMoney(total, currency)}</p>
              <p className="mt-1 text-xs text-white/50">Today in: {fmtMoney(todayWalletIn(db), currency)}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {WALLET_CHANNELS.map((ch) => {
                const st = CHANNEL_STYLE[ch];
                return (
                  <button
                    key={ch}
                    onClick={() => setTxOpen(true)}
                    className={classNames("rounded-xl px-3.5 py-2.5 text-left ring-1 backdrop-blur transition-transform hover:scale-[1.03]", st.bg, st.ring)}
                  >
                    <p className={classNames("text-[11px] font-bold uppercase tracking-wide", st.text.replace("600", "300").replace("500", "300"))}>{st.label}</p>
                    <p className="mt-0.5 text-base font-bold">{fmtMoney(balances[ch], currency)}</p>
                    <p className="text-[10px] text-white/45">{channelNumber(db, ch) || "tap to set number"}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      {/* Ledger */}
      <Card>
        <CardHeader title="Transactions" subtitle="Money in and out — cash-out fees are calculated automatically" />
        {db.wallet.length === 0 ? (
          <EmptyState icon={<IcWallet size={20} />} title="No wallet activity yet" subtitle="Record a bKash/Nagad payment you received, or a supplier payment you sent." />
        ) : (
          <div className="divide-y divide-ink-100">
            {db.wallet.slice(0, 40).map((tx) => {
              const st = CHANNEL_STYLE[tx.channel];
              return (
                <div key={tx.id} className="flex items-center gap-3 px-5 py-3">
                  <span className={classNames("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-1", st.bg, st.text, st.ring)}>
                    {tx.channel === "Bank" ? "BNK" : tx.channel.slice(0, 2)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-800">{tx.note || (tx.kind === "in" ? "Money received" : "Money sent")}</p>
                    <p className="text-xs text-ink-400">{fmtDateTime(tx.at)} · Ref {tx.ref}{tx.fee > 0 ? ` · fee ${fmtMoney(tx.fee, currency)}` : ""}</p>
                  </div>
                  <p className={classNames("shrink-0 text-sm font-bold", tx.kind === "in" ? "text-emerald-600" : "text-red-600")}>
                    {tx.kind === "in" ? "+" : "−"}{fmtMoney(tx.amount, currency)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {txOpen ? (
        <TxModal
          currency={currency}
          defaultNumber={channelNumber(db, "bKash")}
          onClose={() => setTxOpen(false)}
          onSave={(args) => {
            update((d) => {
              const { db: next } = addWalletTx(d, args);
              return { ...next, audit: logAudit(next.audit, "payment", "Wallet", args.ref, `${args.kind === "in" ? "Received" : "Sent"} ${fmtMoney(args.amount, currency)} via ${args.channel}`) };
            });
            toast("Wallet transaction recorded");
            setTxOpen(false);
          }}
          onSetNumber={(ch, num) => update((d) => setChannelNumber(d, ch, num))}
        />
      ) : null}

      {qrOpen ? <QrModal currency={currency} db={db} onClose={() => setQrOpen(false)} onGoSales={() => { setQrOpen(false); navigate("sales"); }} /> : null}
    </div>
  );
}

/* ---------------- Add transaction ---------------- */

function TxModal({
  currency, onClose, onSave, onSetNumber, defaultNumber,
}: {
  currency: string;
  defaultNumber: string;
  onClose: () => void;
  onSave: (args: { channel: WalletChannel; kind: "in" | "out"; amount: number; ref: string; note: string; autoFee: boolean }) => void;
  onSetNumber: (ch: WalletChannel, num: string) => void;
}) {
  const [channel, setChannel] = useState<WalletChannel>("bKash");
  const [kind, setKind] = useState<"in" | "out">("in");
  const [amount, setAmount] = useState("");
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const [number, setNumber] = useState(defaultNumber);
  const autoFee = kind === "out" && channel !== "Bank";

  const amt = parseFloat(amount) || 0;
  const fee = autoFee ? Math.round(amt * CHANNEL_FEE_RATE[channel] * 100) / 100 : 0;

  return (
    <Modal
      open
      onClose={onClose}
      title="Record wallet transaction"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            disabled={amt <= 0}
            onClick={() => onSave({ channel, kind, amount: amt, ref, note, autoFee })}
          >
            Save record
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {(["in", "out"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={classNames(
                "rounded-xl border px-4 py-3 text-left transition-colors",
                kind === k ? "border-brand-500 bg-brand-50" : "border-ink-200 hover:bg-ink-50",
              )}
            >
              <p className="text-sm font-semibold text-ink-800">{k === "in" ? "Money in" : "Money out"}</p>
              <p className="text-xs text-ink-500">{k === "in" ? "Customer paid you" : "You paid someone"}</p>
            </button>
          ))}
        </div>
        <Field label="Channel">
          <Select value={channel} onChange={(e) => setChannel(e.target.value as WalletChannel)}>
            {WALLET_CHANNELS.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
          </Select>
        </Field>
        <Field label="Account number (optional)">
          <TextInput value={number} onChange={(e) => { setNumber(e.target.value); onSetNumber(channel, e.target.value); }} placeholder="01XXXXXXXXX" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Amount (${currency})`}>
            <NumberInput value={amount} onChange={(e) => setAmount(e.target.value)} min={0} placeholder="0.00" />
          </Field>
          <Field label="TrxID / reference">
            <TextInput value={ref} onChange={(e) => setRef(e.target.value)} placeholder="auto if empty" />
          </Field>
        </div>
        <Field label="Note"><TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. INV-1042 customer payment" /></Field>
        {kind === "out" && channel !== "Bank" ? (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-200">
            {channel} cash-out fee ≈ {fee ? fmtMoney(fee, currency) : `${(CHANNEL_FEE_RATE[channel]! * 100).toFixed(2)}%`} on {fmtMoney(amt, currency)} — saved with the record.
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

/* ---------------- Invoice QR ---------------- */

function QrModal({ currency, db, onClose, onGoSales }: { currency: string; db: ReturnType<typeof useApp>["db"]; onClose: () => void; onGoSales: () => void }) {
  const recent = db.sales.slice(0, 12);
  const [saleId, setSaleId] = useState(recent[0]?.id ?? "");
  const sale = db.sales.find((s) => s.id === saleId);
  const due = sale ? Math.max(0, Math.round((sale.total - sale.paidAmount) * 100) / 100) : 0;
  const [custom, setCustom] = useState("");

  const amount = sale ? due || sale.total : parseFloat(custom) || 0;
  const merchant = db.walletAccounts.find((a) => a.channel === "bKash")?.number || db.settings.phone || "";
  const payload = `bKash Payment\nTo: ${merchant} (${db.settings.shopName})\nAmount: ${currency}${amount.toFixed(2)}\nFor: ${sale ? sale.invoiceNo : "Order"}`;
  const svg = useMemo(() => {
    try { return qrSvg(payload, { scale: 5 }); } catch { return null; }
  }, [payload]);

  return (
    <Modal open onClose={onClose} title="Payment QR code" wide>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-3">
          <Field label="Attach to an invoice">
            <Select value={saleId} onChange={(e) => setSaleId(e.target.value)}>
              {recent.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.invoiceNo} · {fmtMoney(s.total, currency)} {s.status !== "Paid" ? `· due ${fmtMoney(s.total - s.paidAmount, currency)}` : "· paid"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Or any amount">
            <NumberInput value={custom} onChange={(e) => { setCustom(e.target.value); setSaleId(""); }} placeholder="0.00" />
          </Field>
          <div className="rounded-xl bg-ink-50 px-4 py-3 text-xs leading-relaxed text-ink-600">
            Customer scans this with their <b>bKash / Nagad</b> app → sends money to your merchant number → you record it under <b>Digital Wallet → Money in</b>.
            {!merchant ? <div className="mt-1 font-semibold text-amber-700">Tip: set your bKash number in the transaction form so it appears here.</div> : null}
          </div>
          <Button variant="secondary" onClick={onGoSales}>Open sales & invoices</Button>
        </div>
        <div className="flex flex-col items-center justify-center rounded-2xl border border-ink-200 bg-white p-5">
          {svg ? (
            <div className="w-full max-w-[240px] [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <p className="text-sm text-red-600">Amount too large for a QR code.</p>
          )}
          <p className="mt-3 text-center text-sm font-bold text-ink-900">{fmtMoney(amount, currency)}</p>
          <p className="text-xs text-ink-500">{sale ? sale.invoiceNo : "Custom amount"} · {merchant || "set merchant number"}</p>
          <Badge tone="green" >Scan to pay</Badge>
        </div>
      </div>
    </Modal>
  );
}
