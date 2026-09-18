import { useMemo, useState } from "react";
import { useApp } from "../App";
import type { CartLine } from "../lib/store";
import { makeSale, nextInvoiceNo, priceForTier, pointsEarnedFor } from "../lib/store";
import { fmtMoney, round2 } from "../lib/helpers";
import { hasFeature } from "../lib/plans";
import { productsInSubtree } from "../lib/categories";
import type { Sale, PriceTier } from "../types";
import { Badge, Button, Card, CategoryChips, Field, Modal, NumberInput, Select, SignPad, TextArea, TextInput, VoiceButton, useToast } from "../ui";
import { IcSearch, IcPlus, IcTrash, IcPrint, IcCart, IcCheck, IcCash } from "../icons";

type PayMethod = "Cash" | "Card" | "Mobile Money" | "Due";

export default function PosPage() {
  const { db, update, currency, navigate } = useApp();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [voiceLang, setVoiceLang] = useState<"en-US" | "bn-BD">("en-US");
  const [signature, setSignature] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [payment, setPayment] = useState<PayMethod>("Cash");
  const [customerId, setCustomerId] = useState<string>("");
  const [orderDiscount, setOrderDiscount] = useState(0);
  const [paidInput, setPaidInput] = useState(0);
  const [note, setNote] = useState("");
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [tierOverride, setTierOverride] = useState<PriceTier | null>(null); // null = follow customer
  const [redeemInput, setRedeemInput] = useState(0);
  const [branchId, setBranchId] = useState<string>(db.branches[0]?.id ?? "");

  const sub = db.subscription;
  const showChips = hasFeature(sub, "categories_nested");
  const tiersEnabled = hasFeature(sub, "price_tiers");
  const loyaltyOn = db.settings.loyaltyEnabled && hasFeature(sub, "loyalty");
  const activeTier: PriceTier = useMemo(() => {
    if (tierOverride) return tierOverride;
    const c = db.customers.find((x) => x.id === customerId);
    return c?.tier ?? "retail";
  }, [tierOverride, customerId, db.customers]);
  const selectedCustomer = db.customers.find((c) => c.id === customerId) ?? null;
  const allowedIds = useMemo(
    () => (category ? productsInSubtree(db, category) : null),
    [db, category],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.products.filter(
      (p) =>
        p.forRetailSale !== false &&
        (!allowedIds || allowedIds.has(p.id)) &&
        (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode ?? "").toLowerCase().includes(q))
    );
  }, [db.products, search, allowedIds]);

  const subtotal = round2(cart.reduce((s, l) => s + l.unitPrice * l.qty, 0));
  const lineDiscounts = round2(cart.reduce((s, l) => s + l.discount, 0));
  const discount = round2(lineDiscounts + orderDiscount);
  // VAT: only non-VAT-inclusive lines are taxed (VAT-inclusive prices already contain VAT)
  const vatInCart = cart.some((l) => db.products.find((x) => x.id === l.productId)?.vatIncluded);
  const taxableBase = round2(
    cart.reduce((s, l) => {
      const prod = db.products.find((x) => x.id === l.productId);
      return prod?.vatIncluded ? s : s + l.unitPrice * l.qty - l.discount;
    }, 0)
  );
  const tax = round2((taxableBase * db.settings.taxRate) / 100);
  const total = round2(subtotal - discount + tax);
  const anyDiscountable = cart.some((l) => db.products.find((x) => x.id === l.productId)?.discountable !== false);

  // Loyalty: redeemable points → credit (1 point = settings.pointValue)
  const discountedBase = round2(Math.max(0, subtotal - discount));
  const redeemablePoints = loyaltyOn && selectedCustomer ? Math.min(selectedCustomer.points, Math.floor(discountedBase / Math.max(db.settings.pointValue, 0.0001))) : 0;
  const maxRedeemCredit = round2(redeemablePoints * db.settings.pointValue);
  const redeemCredit = round2(Math.min(redeemInput * db.settings.pointValue, maxRedeemCredit));
  const finalTotal = round2(Math.max(0, discountedBase + tax - redeemCredit));

  const addToCart = (productId: string) => {
    const p = db.products.find((x) => x.id === productId);
    if (!p) return;
    const unitPrice = priceForTier(p, activeTier);
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === productId);
      if (existing) {
        if (existing.qty + 1 > p.stock) {
          toast(`Only ${p.stock} in stock`, "error");
          return prev;
        }
        return prev.map((l) => (l.productId === productId ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...prev, { productId, name: p.name, unitPrice, qty: 1, discount: 0 }];
    });
  };

  const setQty = (productId: string, qty: number) => {
    const p = db.products.find((x) => x.id === productId);
    if (p && qty > p.stock) {
      toast(`Only ${p.stock} in stock`, "error");
      return;
    }
    setCart((prev) =>
      qty <= 0 ? prev.filter((l) => l.productId !== productId) : prev.map((l) => (l.productId === productId ? { ...l, qty } : l))
    );
  };

  const customerCurrentDue = useMemo(() => {
    if (!selectedCustomer) return 0;
    let due = selectedCustomer.openingDue;
    for (const s of db.sales) {
      if (s.customerId === selectedCustomer.id && s.payment === "Due") due += s.total - s.paidAmount;
    }
    return round2(due);
  }, [selectedCustomer, db.sales]);

  const completeSale = () => {
    if (cart.length === 0) return;
    const isDue = payment === "Due";
    const pts = loyaltyOn && selectedCustomer ? Math.min(redeemInput, redeemablePoints) : 0;
    const { db: next, sale } = makeSale(db, {
      items: cart,
      payment,
      customerId: customerId || null,
      discount: orderDiscount,
      taxRate: db.settings.taxRate,
      shipping: 0,
      paidAmount: isDue ? paidInput : finalTotal,
      note,
      cashier: db.settings.ownerName,
      signature,
      branchId,
      priceTier: activeTier,
      pointsRedeemed: pts,
    });
    let finalDb = next;
    if (pts > 0 && customerId) {
      // Redeemed points were not consumed by makeSale — deduct them here.
      finalDb = { ...next, customers: next.customers.map((c) => (c.id === customerId ? { ...c, points: Math.max(0, c.points - pts) } : c)) };
    }
    update(() => finalDb);
    setLastSale(sale);
    setCart([]);
    setOrderDiscount(0);
    setPaidInput(0);
    setNote("");
    setCustomerId("");
    setPayment("Cash");
    setSignature(null);
    setTierOverride(null);
    setRedeemInput(0);
    setCheckoutOpen(false);
    setReceiptOpen(true);
    toast(`Sale ${sale.invoiceNo} completed`);
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Products */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"><IcSearch size={15} /></span>
            <TextInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search or scan barcode…"
              className="pl-9"
            />
          </div>
          <VoiceButton
            lang={voiceLang}
            onText={(t) => setSearch(t)}
            onError={(m) => toast(m, "error")}
          />
          <button
            onClick={() => setVoiceLang((l) => (l === "en-US" ? "bn-BD" : "en-US"))}
            title="Toggle voice language"
            className="rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-ink-600 hover:bg-ink-50"
          >
            {voiceLang === "en-US" ? "EN" : "বাং"}
          </button>
          {showChips ? <CategoryChips db={db} value={category} onChange={setCategory} /> : null}
        </div>

        <div className="grid flex-1 grid-cols-2 gap-2.5 overflow-y-auto pb-2 sm:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => {
            const out = p.stock <= 0;
            const low = !out && p.stock <= p.lowStockAt;
            const inCart = cart.find((l) => l.productId === p.id)?.qty ?? 0;
            return (
              <button
                key={p.id}
                disabled={out}
                onClick={() => addToCart(p.id)}
                className="group relative rounded-xl border border-ink-200 bg-white p-3 text-left transition-all hover:border-brand-400 hover:shadow-pop disabled:cursor-not-allowed disabled:opacity-45"
              >
                {inCart > 0 ? (
                  <span className="absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">
                    {inCart}
                  </span>
                ) : null}
                <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-ink-100 text-ink-500 group-hover:bg-brand-50 group-hover:text-brand-600">
                  <IcCart size={16} />
                </div>
                <p className="truncate text-sm font-medium text-ink-800">{p.name}</p>
                <p className="text-[11px] text-ink-400">{p.sku}</p>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-sm font-bold text-ink-900">{fmtMoney(p.price, currency)}</span>
                  <Badge tone={out ? "red" : low ? "amber" : "neutral"}>
                    {out ? "Out" : low ? `${p.stock} low` : `${p.stock}`}
                  </Badge>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 ? (
            <div className="col-span-full py-16 text-center text-sm text-ink-400">No products match your search.</div>
          ) : null}
        </div>
      </div>

      {/* Cart */}
      <div className="hidden w-80 shrink-0 flex-col md:flex">
        <Card className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-ink-900">Current sale</h3>
              <p className="text-[11px] text-ink-400">Next invoice: {nextInvoiceNo(db)}</p>
            </div>
            {cart.length ? (
              <Button variant="ghost" size="sm" onClick={() => setCart([])}>Clear</Button>
            ) : null}
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-2">
            {cart.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
                <IcCart size={26} className="text-ink-300" />
                <p className="text-sm text-ink-400">Cart is empty.<br />Tap products to add them.</p>
              </div>
            ) : (
              cart.map((l) => (
                <div key={l.productId} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-ink-50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-800">{l.name}</p>
                    <p className="text-xs text-ink-400">{fmtMoney(l.unitPrice, currency)} × {l.qty}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setQty(l.productId, l.qty - 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-ink-200 text-ink-600 hover:bg-ink-100"
                    >−</button>
                    <span className="w-7 text-center text-sm font-semibold text-ink-900">{l.qty}</span>
                    <button
                      onClick={() => setQty(l.productId, l.qty + 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-ink-200 text-ink-600 hover:bg-ink-100"
                    >+</button>
                  </div>
                  <span className="w-16 text-right text-sm font-semibold text-ink-900">
                    {fmtMoney(l.unitPrice * l.qty - l.discount, currency)}
                  </span>
                  <button
                    onClick={() => setQty(l.productId, 0)}
                    className="text-ink-300 hover:text-red-500"
                    title="Remove"
                  >
                    <IcTrash size={14} />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="space-y-1.5 border-t border-ink-100 px-4 py-3 text-sm">
            <Row label="Subtotal" value={fmtMoney(subtotal, currency)} />
            {discount > 0 ? <Row label="Discount" value={`− ${fmtMoney(discount, currency)}`} /> : null}
            {tax > 0 ? <Row label={`VAT (${db.settings.taxRate}%)`} value={fmtMoney(tax, currency)} /> : null}
            {vatInCart && db.settings.taxRate > 0 && tax < subtotal * (db.settings.taxRate / 100) ? (
              <p className="text-xs text-ink-400">VAT-inclusive items are not taxed again.</p>
            ) : null}
            <div className="flex items-center justify-between border-t border-dashed border-ink-200 pt-2 text-base font-bold text-ink-900">
              <span>Total</span>
              <span>{fmtMoney(finalTotal, currency)}</span>
            </div>
            {activeTier !== "retail" ? (
              <p className="text-xs font-medium text-brand-600">{activeTier === "wholesale" ? "Wholesale" : "Distributor"} pricing applied</p>
            ) : null}
            <Button className="mt-2 w-full" size="lg" disabled={cart.length === 0} onClick={() => { setCheckoutOpen(true); setPaidInput(finalTotal); }}>
              <IcCheck size={16} /> Charge {fmtMoney(finalTotal, currency)}
            </Button>
          </div>
        </Card>
      </div>

      {/* Mobile cart bar */}
      <div className="fixed bottom-4 left-4 right-4 z-30 md:hidden">
        {cart.length > 0 ? (
          <Button size="lg" className="w-full shadow-pop" onClick={() => setCheckoutOpen(true)}>
            <IcCart size={16} /> {cart.length} items · {fmtMoney(total, currency)} — Checkout
          </Button>
        ) : null}
      </div>

      {/* Checkout modal */}
      <Modal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        title="Complete sale"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCheckoutOpen(false)}>Cancel</Button>
            <Button onClick={completeSale}><IcCheck size={15} /> Confirm sale</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl bg-ink-50 px-4 py-3 text-center">
            <p className="text-xs text-ink-500">Amount due</p>
            <p className="text-2xl font-bold text-ink-900">{fmtMoney(finalTotal, currency)}</p>
          </div>

          {tiersEnabled ? (
            <Field label="Price tier" hint={selectedCustomer ? `${selectedCustomer.name}'s default tier: ${selectedCustomer.tier}` : "Select a customer to apply their tier automatically"}>
              <div className="grid grid-cols-3 gap-2">
                {(["retail", "wholesale", "distributor"] as PriceTier[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => { setTierOverride(t); setCart((prev) => prev.map((l) => {
                      const p = db.products.find((x) => x.id === l.productId);
                      return p ? { ...l, unitPrice: priceForTier(p, t) } : l;
                    })); }}
                    className={
                      activeTier === t
                        ? "rounded-lg border-2 border-brand-600 bg-brand-50 px-2 py-2 text-xs font-semibold capitalize text-brand-700"
                        : "rounded-lg border border-ink-200 bg-white px-2 py-2 text-xs font-medium capitalize text-ink-600 hover:bg-ink-50"
                    }
                  >
                    {t}
                  </button>
                ))}
              </div>
            </Field>
          ) : null}

          {loyaltyOn && selectedCustomer ? (
            <div className="rounded-xl border border-violet-200 bg-violet-50/60 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Loyalty points</p>
                  <p className="text-sm text-ink-600">{selectedCustomer.name} has <b>{selectedCustomer.points}</b> pts ({fmtMoney(round2(selectedCustomer.points * db.settings.pointValue), currency)} credit)</p>
                </div>
                <div className="w-28">
                  <NumberInput value={redeemInput} min={0} max={redeemablePoints} onChange={(e) => setRedeemInput(Math.min(Number(e.target.value) || 0, redeemablePoints))} placeholder="Points" />
                </div>
              </div>
              {redeemCredit > 0 ? <p className="mt-1.5 text-xs font-medium text-violet-700">− {fmtMoney(redeemCredit, currency)} applied from {redeemInput} points</p> : null}
            </div>
          ) : null}

          <Field label="Payment method">
            <div className="grid grid-cols-2 gap-2">
              {(["Cash", "Card", "Mobile Money", "Due"] as PayMethod[]).map((m) => (
                <button
                  key={m}
                  onClick={() => { setPayment(m); if (m !== "Due") setPaidInput(total); }}
                  className={
                    payment === m
                      ? "rounded-lg border-2 border-brand-600 bg-brand-50 px-3 py-2.5 text-sm font-semibold text-brand-700"
                      : "rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-sm font-medium text-ink-600 hover:bg-ink-50"
                  }
                >
                  {m === "Cash" ? <IcCash size={15} className="mr-1 inline" /> : null}
                  {m}
                </button>
              ))}
            </div>
          </Field>

          {payment === "Due" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Customer (required)">
                <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  <option value="">Select customer…</option>
                  {db.customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Paid now (rest becomes due)">
                <NumberInput value={paidInput} min={0} max={finalTotal} onChange={(e) => setPaidInput(Number(e.target.value) || 0)} />
              </Field>
            </div>
          ) : null}

          {payment === "Due" && selectedCustomer && selectedCustomer.creditLimit > 0 && (finalTotal - paidInput) > selectedCustomer.creditLimit - round2(customerCurrentDue) ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              ⚠ Credit limit: {selectedCustomer.name} has {fmtMoney(customerCurrentDue, currency)} outstanding of a {fmtMoney(selectedCustomer.creditLimit, currency)} limit — this sale would exceed it.
            </p>
          ) : null}
          {payment === "Due" && selectedCustomer && selectedCustomer.creditLimit === 0 ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {selectedCustomer.name} has no credit limit set — allow credit sales from the customer's profile.
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Order discount" hint={anyDiscountable ? undefined : "No discountable items in cart"}>
              <NumberInput
                value={orderDiscount}
                min={0}
                disabled={!anyDiscountable}
                onChange={(e) => setOrderDiscount(anyDiscountable ? Number(e.target.value) || 0 : 0)}
              />
            </Field>
            <Field label="Customer (optional)">
              <Select value={customerId} onChange={(e) => { setCustomerId(e.target.value); setTierOverride(null); setRedeemInput(0); }} disabled={payment === "Due"}>
                <option value="">Walk-in customer</option>
                {db.customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
          </div>

          {db.branches.length > 1 ? (
            <Field label="Branch">
              <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                {db.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
          ) : null}

          <Field label="Note">
            <TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note on the invoice" />
          </Field>

          {payment === "Due" && !customerId ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              A customer must be selected to record a due sale.
            </p>
          ) : null}

          {hasFeature(db.subscription, "e_signature") ? (
            <Field label="Customer signature (optional)">
              <SignPad onChange={setSignature} />
            </Field>
          ) : null}
        </div>
      </Modal>

      {/* Receipt modal */}
      <Modal open={receiptOpen} onClose={() => setReceiptOpen(false)} title="Receipt" footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setReceiptOpen(false)}>Close</Button>
          <Button onClick={() => window.print()}><IcPrint size={15} /> Print</Button>
        </div>
      }>
        {lastSale ? <Receipt sale={lastSale} shopName={db.settings.shopName} currency={currency} /> : null}
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-ink-600">
      <span>{label}</span>
      <span className="font-medium text-ink-800">{value}</span>
    </div>
  );
}

export function Receipt({ sale, shopName, currency }: { sale: Sale; shopName: string; currency: string }) {
  return (
    <div id="receipt-print" className="mx-auto max-w-xs font-mono text-[13px] text-ink-900">
      <div className="text-center">
        <p className="text-base font-bold">{shopName}</p>
        <p className="text-[11px] text-ink-500">Thank you for shopping with us</p>
      </div>
      <div className="my-2 border-y border-dashed border-ink-300 py-2 text-[11px] text-ink-600">
        <p>Invoice: {sale.invoiceNo}</p>
        <p>Date: {new Date(sale.at).toLocaleString()}</p>
        <p>Cashier: {sale.cashier}</p>
      </div>
      <table className="w-full text-[12px]">
        <tbody>
          {sale.items.map((it, i) => (
            <tr key={i}>
              <td className="py-0.5 pr-1">
                {it.qty} × {it.name}
              </td>
              <td className="whitespace-nowrap py-0.5 text-right">{fmtMoney(it.unitPrice * it.qty - it.discount, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 border-t border-dashed border-ink-300 pt-2 text-[12px]">
        <div className="flex justify-between"><span>Subtotal</span><span>{fmtMoney(sale.subtotal, currency)}</span></div>
        {sale.discount > 0 ? <div className="flex justify-between"><span>Discount</span><span>− {fmtMoney(sale.discount, currency)}</span></div> : null}
        {sale.tax > 0 ? <div className="flex justify-between"><span>Tax</span><span>{fmtMoney(sale.tax, currency)}</span></div> : null}
        <div className="mt-1 flex justify-between border-t border-ink-300 pt-1 text-sm font-bold">
          <span>Total</span><span>{fmtMoney(sale.total, currency)}</span>
        </div>
        <div className="flex justify-between"><span>Paid ({sale.payment})</span><span>{fmtMoney(sale.paidAmount, currency)}</span></div>
        {sale.total - sale.paidAmount > 0.009 ? (
          <div className="flex justify-between font-semibold text-red-600">
            <span>Due</span><span>{fmtMoney(sale.total - sale.paidAmount, currency)}</span>
          </div>
        ) : null}
      </div>
      {sale.signature ? (
        <div className="mt-3 text-center">
          <img src={sale.signature} alt="Customer signature" className="mx-auto h-10 object-contain" />
          <div className="mx-auto mt-0.5 w-32 border-t border-ink-400" />
          <p className="text-[9px] text-ink-400">Customer signature</p>
        </div>
      ) : null}
      <p className="mt-3 text-center text-[10px] text-ink-400">Powered by Managix</p>
    </div>
  );
}
