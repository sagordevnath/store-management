import type { DB, Sale } from "../types";
import { fmtMoney, fmtDateTime } from "../lib/helpers";
import { printIsolated } from "../lib/print";
import { Button, Modal } from "../ui";
import { IcPrint } from "../icons";

/* ===========================================================================
   Futuristic A4 invoice — 210mm sheet with a gradient masthead, glass cards,
   barcode strip, e-signature and company branding from Settings.
   Print via #a4-invoice-print (see index.css).
   =========================================================================== */

/* ---------------- amount in words ---------------- */

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function under1000(n: number): string {
  if (n >= 100) {
    const r = n % 100;
    return `${ONES[Math.floor(n / 100)]} hundred${r ? " " + under1000(r) : ""}`;
  }
  if (n >= 20) {
    const r = n % 10;
    return `${TENS[Math.floor(n / 10)]}${r ? "-" + ONES[r] : ""}`;
  }
  return ONES[n];
}

function amountInWords(value: number): string {
  const dollars = Math.floor(value);
  const cents = Math.round((value - dollars) * 100);
  if (dollars === 0 && cents === 0) return "Zero only";
  const groups: [number, string][] = [
    [1_000_000_000, "billion"], [1_000_000, "million"], [1_000, "thousand"],
  ];
  let rest = dollars;
  const parts: string[] = [];
  for (const [size, name] of groups) {
    if (rest >= size) {
      parts.push(`${under1000(Math.floor(rest / size))} ${name}`);
      rest %= size;
    }
  }
  if (rest > 0) parts.push(under1000(rest));
  const main = parts.length ? parts.join(" ") : "";
  const out = cents > 0
    ? `${main ? main + " " : ""}and ${cents}/100`
    : main;
  return (out.charAt(0).toUpperCase() + out.slice(1)) + " only";
}

/* ---------------- deterministic pseudo-barcode from the invoice no ---------------- */

function BarcodeStrip({ seed }: { seed: string }) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const bars: number[] = [];
  let x = h || 1;
  for (let i = 0; i < 44; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    bars.push(1 + (x % 4)); // width 1-4
  }
  return (
    <div className="flex items-end gap-[2px]" aria-hidden>
      {bars.map((w, i) => (
        <span key={i} className="block h-9 bg-ink-900" style={{ width: w, opacity: i % 7 === 3 ? 0.55 : 1 }} />
      ))}
    </div>
  );
}

/* ---------------- sheet ---------------- */

export function A4InvoiceDocument({ sale, db }: { sale: Sale; db: DB }) {
  const s = db.settings;
  const currency = s.currency;
  const customer = sale.customerId ? db.customers.find((c) => c.id === sale.customerId) : null;
  const branch = sale.branchId ? db.branches.find((b) => b.id === sale.branchId) : null;
  const due = Math.max(0, Math.round((sale.total - sale.paidAmount) * 100) / 100);

  const contactChips = [
    s.phone ?? "",
    s.email ?? "",
    s.website ?? "",
  ].filter(Boolean);

  return (
    <div
      id="a4-invoice-print"
      className="a4-sheet relative mx-auto w-full max-w-[794px] overflow-hidden rounded-xl bg-white text-ink-900 shadow-pop"
    >
      {/* ---------- masthead ---------- */}
      <div className="relative overflow-hidden bg-gradient-to-br from-ink-950 via-ink-900 to-brand-800 px-5 pb-8 pt-9 text-white sm:px-10">
        {/* decorative grid + glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-emerald-400/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute right-24 top-10 h-24 w-24 rounded-full bg-teal-300/20 blur-2xl" />

        <div className="relative flex flex-wrap items-start justify-between gap-4 sm:gap-8">
          <div className="flex items-center gap-4">
            {s.logo ? (
              <img src={s.logo} alt="Company logo" className="h-16 w-16 rounded-2xl object-cover ring-2 ring-white/25" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-2xl font-black ring-2 ring-white/25 backdrop-blur">
                {(s.shopName || "M").slice(0, 1)}
              </div>
            )}
            <div>
              <p className="text-xl font-bold leading-tight">{s.shopName}</p>
              {s.tagline ? <p className="text-xs text-white/60">{s.tagline}</p> : null}
              {s.address ? <p className="mt-1 max-w-[240px] text-[11px] leading-snug text-white/50">{s.address}</p> : null}
              {contactChips.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {contactChips.map((c) => (
                    <span key={c} className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-medium text-white/80 ring-1 ring-white/15">
                      {c}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="text-right">
            <p className="bg-gradient-to-r from-emerald-300 to-teal-200 bg-clip-text text-2xl font-black uppercase tracking-[0.12em] text-transparent sm:text-3xl sm:tracking-[0.18em]">
              Invoice
            </p>
            <p className="mt-1 font-mono text-sm font-semibold tracking-wider text-white/90">{sale.invoiceNo}</p>
            <p className="mt-0.5 text-[11px] text-white/50">{fmtDateTime(sale.at)}</p>
            <span
              className={
                "mt-2.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest " +
                (due <= 0.009
                  ? "bg-emerald-400/20 text-emerald-200 ring-1 ring-emerald-300/40"
                  : sale.paidAmount > 0
                    ? "bg-amber-400/20 text-amber-200 ring-1 ring-amber-300/40"
                    : "bg-red-400/20 text-red-200 ring-1 ring-red-300/40")
              }
            >
              <span className={"h-1.5 w-1.5 rounded-full " + (due <= 0.009 ? "bg-emerald-300" : sale.paidAmount > 0 ? "bg-amber-300" : "bg-red-300")} />
              {sale.status}
            </span>
          </div>
        </div>
      </div>

      {/* ---------- meta cards ---------- */}
      <div className="relative z-10 -mt-4 grid grid-cols-3 gap-2 px-5 sm:gap-3 sm:px-10">
        <div className="rounded-xl border border-ink-200/70 bg-white p-4 shadow-card">
          <p className="text-[10px] font-bold uppercase tracking-widest text-ink-400">Billed to</p>
          <p className="mt-1.5 text-sm font-bold text-ink-900">{customer ? customer.name : "Walk-in customer"}</p>
          {customer ? (
            <div className="mt-1 space-y-0.5 text-[11px] text-ink-500">
              {customer.phone ? <p>{customer.phone}</p> : null}
              {customer.address ? <p className="leading-snug">{customer.address}</p> : null}
              <p className="capitalize text-brand-700">Tier: {customer.tier}</p>
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-ink-400">Counter sale — no customer attached</p>
          )}
        </div>

        <div className="rounded-xl border border-ink-200/70 bg-white p-4 shadow-card">
          <p className="text-[10px] font-bold uppercase tracking-widest text-ink-400">Payment</p>
          <p className="mt-1.5 text-sm font-bold text-ink-900">{sale.payment}</p>
          <div className="mt-1 space-y-0.5 text-[11px] text-ink-500">
            <p>Paid: {fmtMoney(sale.paidAmount, currency)}</p>
            {due > 0.009 ? <p className="font-semibold text-red-600">Due: {fmtMoney(due, currency)}</p> : null}
            {sale.pointsRedeemed ? <p>Loyalty: {sale.pointsRedeemed} pts redeemed</p> : null}
            {sale.pointsEarned ? <p>Earned: {sale.pointsEarned} pts</p> : null}
          </div>
        </div>

        <div className="rounded-xl border border-ink-200/70 bg-white p-4 shadow-card">
          <p className="text-[10px] font-bold uppercase tracking-widest text-ink-400">Details</p>
          <div className="mt-1.5 space-y-0.5 text-[11px] text-ink-500">
            <p>Cashier: <span className="font-semibold text-ink-700">{sale.cashier}</span></p>
            {branch ? <p>Branch: <span className="font-semibold text-ink-700">{branch.name}</span></p> : null}
            {sale.priceTier ? <p>Pricing: <span className="font-semibold capitalize text-ink-700">{sale.priceTier}</span></p> : null}
            <p>{sale.items.reduce((a, b) => a + b.qty, 0)} items · {sale.items.length} lines</p>
          </div>
        </div>
      </div>

      {/* ---------- items ---------- */}
      <div className="px-5 pt-6 sm:px-10">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {["#", "Item", "Qty", "Unit price", "Disc.", "Amount"].map((h, i) => (
                <th
                  key={h}
                  className={
                    "border-y border-ink-900 bg-ink-900 px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white " +
                    (i === 0 ? "rounded-l-lg text-left" : "") +
                    (i === 5 ? "rounded-r-lg text-right" : i === 0 ? "" : i < 4 ? "text-left" : "text-right")
                  }
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sale.items.map((it, i) => {
              const img = db.products.find((p) => p.id === it.productId)?.image ?? null;
              return (
                <tr key={i} className={i % 2 ? "bg-ink-50/60" : "bg-white"}>
                  <td className="border-b border-ink-100 px-3 py-2.5 text-[11px] text-ink-400">{String(i + 1).padStart(2, "0")}</td>
                  <td className="border-b border-ink-100 px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      {img ? <img src={img} alt="" className="h-8 w-8 rounded-md object-cover ring-1 ring-ink-200" /> : null}
                      <span className="font-medium text-ink-900">{it.name}</span>
                    </div>
                  </td>
                  <td className="border-b border-ink-100 px-3 py-2.5 text-ink-600">{it.qty}</td>
                  <td className="border-b border-ink-100 px-3 py-2.5 text-ink-600">{fmtMoney(it.unitPrice, currency)}</td>
                  <td className="border-b border-ink-100 px-3 py-2.5 text-right text-ink-400">{it.discount ? `−${fmtMoney(it.discount, currency)}` : "—"}</td>
                  <td className="border-b border-ink-100 px-3 py-2.5 text-right font-semibold text-ink-900">
                    {fmtMoney(it.unitPrice * it.qty - it.discount, currency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---------- totals + words ---------- */}
      <div className="flex flex-wrap items-start justify-between gap-6 px-5 pt-5 sm:px-10">
        <div className="min-w-[240px] flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-ink-400">Amount in words</p>
          <p className="mt-1 rounded-lg border border-dashed border-ink-300 bg-ink-50/70 px-3 py-2 text-xs italic text-ink-600">
            {amountInWords(sale.total)}
          </p>
          <div className="mt-4">
            <BarcodeStrip seed={sale.invoiceNo} />
            <p className="mt-1 font-mono text-[10px] tracking-[0.35em] text-ink-400">{sale.invoiceNo}</p>
          </div>
        </div>

        <div className="w-[260px] shrink-0">
          <div className="space-y-1.5 rounded-xl border border-ink-200/70 bg-white p-4 text-sm shadow-card">
            <TotalRow label="Subtotal" value={fmtMoney(sale.subtotal, currency)} />
            {sale.discount > 0 ? <TotalRow label="Discount" value={`− ${fmtMoney(sale.discount, currency)}`} /> : null}
            {sale.tax > 0 ? <TotalRow label={`Tax (${s.taxRate}%)`} value={fmtMoney(sale.tax, currency)} /> : null}
            {sale.shipping > 0 ? <TotalRow label="Shipping" value={fmtMoney(sale.shipping, currency)} /> : null}
            {sale.pointsRedeemed ? <TotalRow label="Loyalty credit" value="applied" muted /> : null}
            <div className="mt-2 overflow-hidden rounded-lg bg-gradient-to-r from-brand-700 to-brand-600 px-4 py-3 text-white shadow-lg shadow-brand-600/25">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/70">
                  {due > 0.009 ? "Total due" : "Total paid"}
                </span>
                <span className="text-lg font-black">{fmtMoney(due > 0.009 ? due : sale.total, currency)}</span>
              </div>
              <p className="mt-0.5 text-[10px] text-white/60">Invoice total {fmtMoney(sale.total, currency)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- signatures ---------- */}
      <div className="flex flex-wrap items-end justify-between gap-6 px-5 pt-8 sm:gap-8 sm:px-10">
        <div className="flex-1">
          {sale.signature ? (
            <>
              <img src={sale.signature} alt="Customer signature" className="h-12 object-contain" />
              <div className="mt-1 w-40 border-t border-ink-300 sm:w-52" />
              <p className="mt-1 text-[10px] uppercase tracking-widest text-ink-400">Customer signature</p>
            </>
          ) : (
            <>
              <div className="h-12" />
              <div className="w-40 border-t border-dashed border-ink-300 sm:w-52" />
              <p className="mt-1 text-[10px] uppercase tracking-widest text-ink-400">Customer signature</p>
            </>
          )}
        </div>
        <div className="flex flex-1 items-end justify-end">
          <div className="text-right">
            <div className="flex items-end justify-end gap-2">
              {s.ownerImage ? (
                <img src={s.ownerImage} alt="Owner" className="h-12 w-12 rounded-full object-cover ring-1 ring-ink-200" />
              ) : null}
              <div className="h-12" />
            </div>
            <div className="w-52 border-t border-ink-300" />
            <p className="mt-1 text-[10px] uppercase tracking-widest text-ink-400">
              Authorised by {s.ownerName || "—"}
            </p>
          </div>
        </div>
      </div>

      {/* ---------- footer ---------- */}
      <div className="mt-8 border-t border-ink-100 bg-ink-50/70 px-5 py-4 sm:px-10">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-ink-400">
          <p className="max-w-md leading-snug">{s.invoiceNote || "Thank you for your business!"}</p>
          <p className="text-right">
            {s.regNo ? <span className="mr-3">{s.regNo}</span> : null}
            <span className="font-semibold text-ink-500">Generated by Managix</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function TotalRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-500">{label}</span>
      <span className={muted ? "text-xs italic text-ink-400" : "font-medium text-ink-800"}>{value}</span>
    </div>
  );
}

/* ---------------- modal wrapper ---------------- */

export function A4InvoiceModal({ sale, db, onClose }: { sale: Sale; db: DB; onClose: () => void }) {
  /*
   * Print isolation: on print, reparent the sheet to <body> so the modal's
   * scroll/transform can't clip it; body.a4-printing hides everything else.
   */
  const printA4 = () => printIsolated("a4-invoice-print", "a4-printing");
  return (
    <Modal
      open
      onClose={onClose}
      title={`A4 invoice — ${sale.invoiceNo}`}
      wide
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button onClick={printA4}><IcPrint size={15} /> Print A4</Button>
        </div>
      }
    >
      <A4InvoiceDocument sale={sale} db={db} />
    </Modal>
  );
}
