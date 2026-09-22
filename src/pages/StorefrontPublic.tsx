import { useMemo, useState } from "react";
import type { DB, Product } from "../types";
import { catalogFor, placeStorefrontOrder } from "../lib/storefront";
import { fmtMoney, classNames } from "../lib/helpers";
import { IcStore, IcCheck } from "../icons";

/**
 * Public storefront — rendered at #shop/<slug> with no auth.
 * Reads the same DB document the business runs on: stock, categories, prices.
 */
export function StorefrontPublic({ db, slug }: { db: DB; slug: string }) {
  const sf = db.storefront;
  const valid = sf.enabled && sf.slug === slug;

  const [cart, setCart] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [placed, setPlaced] = useState<{ ok: boolean; msg: string } | null>(null);

  const catalog = useMemo(() => (valid ? catalogFor(db) : []), [db, valid]);
  const catNames = useMemo(() => [...new Set(catalog.map((c) => c.category))].slice(0, 10), [catalog]);

  const filtered = catalog.filter(
    ({ product, category }) =>
      (!cat || category === cat) &&
      (!q.trim() || product.name.toLowerCase().includes(q.trim().toLowerCase())),
  );

  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ p: db.products.find((x) => x.id === id) as Product, qty }))
    .filter((l) => l.p && l.qty > 0);
  const goods = lines.reduce((s, l) => s + l.p.price * l.qty, 0);
  const total = goods + (lines.length ? sf.deliveryFee || 0 : 0);
  const belowMin = lines.length > 0 && total < (sf.minOrder || 0);

  const setQty = (id: string, qty: number) =>
    setCart((c) => {
      const next = { ...c, [id]: Math.max(0, qty) };
      if (next[id] === 0) delete next[id];
      return next;
    });

  const submit = () => {
    const res = placeStorefrontOrder(db, {
      customerName: name,
      phone,
      address,
      note,
      items: lines.map((l) => ({ productId: l.p.id, qty: l.qty })),
    });
    setPlaced(res.ok ? { ok: true, msg: `Order received! ${db.settings.shopName} will call you at ${phone} to confirm.` } : { ok: false, msg: res.error });
    if (res.ok) {
      // Persist the order into the shared localStorage document so the owner sees it.
      try {
        const raw = localStorage.getItem("Managix_db_v1");
        if (raw) {
          const stored = JSON.parse(raw) as DB;
          stored.storefrontOrders = [res.order, ...stored.storefrontOrders];
          localStorage.setItem("Managix_db_v1", JSON.stringify(stored));
        }
      } catch { /* storage unavailable */ }
      setCart({});
      setName(""); setPhone(""); setAddress(""); setNote("");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!valid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950 px-6 text-center text-white">
        <div>
          <IcStore size={40} className="mx-auto text-white/40" />
          <h1 className="mt-4 text-xl font-bold">This shop isn't open right now</h1>
          <p className="mt-2 text-sm text-white/50">The link may be wrong, or the shop has paused online orders. Ask the shop for their current link.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink-50 pb-40" style={{ fontFamily: sf.theme.font === "friendly" ? "ui-rounded, system-ui, sans-serif" : undefined }}>
      {/* Hero */}
      <div className="px-4 pb-16 pt-10 text-white sm:px-8" style={{ backgroundColor: sf.theme.accent }}>
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center gap-3">
            {db.settings.logo ? (
              <img src={db.settings.logo} alt="" className="h-11 w-11 rounded-xl object-cover ring-2 ring-white/30" />
            ) : (
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15"><IcStore size={20} /></span>
            )}
            <div>
              <p className="text-lg font-extrabold leading-tight">{db.settings.shopName}</p>
              <p className="text-xs text-white/70">{db.settings.address || "Order online"}</p>
            </div>
          </div>
          <h1 className="mt-8 max-w-xl text-2xl font-extrabold leading-snug sm:text-3xl">{sf.theme.hero}</h1>
          <p className="mt-2 text-sm text-white/75">
            Delivery fee {fmtMoney(sf.deliveryFee, db.settings.currency)}
            {sf.minOrder > 0 ? ` · minimum order ${fmtMoney(sf.minOrder, db.settings.currency)}` : ""} · paying cash on delivery
          </p>
        </div>
      </div>

      <div className="mx-auto -mt-8 max-w-5xl px-4 sm:px-8">
        {placed ? (
          <div className={classNames(
            "mb-5 flex items-start gap-3 rounded-2xl px-5 py-4 shadow-card",
            placed.ok ? "bg-white ring-2 ring-emerald-200" : "bg-red-50 ring-2 ring-red-200",
          )}>
            <span className={classNames("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full", placed.ok ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600")}>
              {placed.ok ? <IcCheck size={16} /> : "!"}
            </span>
            <p className={classNames("text-sm font-medium", placed.ok ? "text-ink-800" : "text-red-700")}>{placed.msg}</p>
          </div>
        ) : null}

        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products…"
            className="h-10 w-full max-w-xs rounded-xl border border-ink-200 bg-white px-4 text-sm shadow-sm focus:border-ink-400 focus:outline-none"
          />
          <button
            onClick={() => setCat(null)}
            className={classNames("rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors", cat === null ? "text-white" : "bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-100")}
            style={cat === null ? { backgroundColor: sf.theme.accent } : undefined}
          >
            Everything
          </button>
          {catNames.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={classNames("rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors", cat === c ? "text-white" : "bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-100")}
              style={cat === c ? { backgroundColor: sf.theme.accent } : undefined}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Product grid */}
        {filtered.length === 0 ? (
          <div className="rounded-2xl bg-white p-12 text-center shadow-card">
            <p className="text-sm font-semibold text-ink-700">Nothing matches your search</p>
            <p className="mt-1 text-xs text-ink-400">Try another word, or pick a different category.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 pb-10 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map(({ product: p }) => {
              const qty = cart[p.id] ?? 0;
              return (
                <div key={p.id} className="flex flex-col rounded-2xl bg-white p-3 shadow-card">
                  <div className="mb-2 flex h-24 items-center justify-center overflow-hidden rounded-xl bg-ink-100">
                    {p.image ? (
                      <img src={p.image} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-2xl opacity-40">🛍️</span>
                    )}
                  </div>
                  <p className="line-clamp-2 min-h-[2.4rem] text-xs font-semibold leading-snug text-ink-800">{p.name}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <p className="text-sm font-bold" style={{ color: sf.theme.accent }}>{fmtMoney(p.price, db.settings.currency)}</p>
                    <p className="text-[10px] text-ink-400">{p.stock} {p.unit} left</p>
                  </div>
                  {qty === 0 ? (
                    <button
                      onClick={() => setQty(p.id, 1)}
                      className="mt-2 rounded-lg py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90"
                      style={{ backgroundColor: sf.theme.accent }}
                    >
                      Add to cart
                    </button>
                  ) : (
                    <div className="mt-2 flex items-center justify-between rounded-lg bg-ink-100 px-1 py-1">
                      <button onClick={() => setQty(p.id, qty - 1)} className="flex h-7 w-7 items-center justify-center rounded-md bg-white font-bold text-ink-700 shadow-sm">−</button>
                      <span className="text-sm font-bold text-ink-900">{qty}</span>
                      <button
                        onClick={() => setQty(p.id, Math.min(p.stock, qty + 1))}
                        className="flex h-7 w-7 items-center justify-center rounded-md font-bold text-white shadow-sm"
                        style={{ backgroundColor: sf.theme.accent }}
                      >+</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cart bar / sheet */}
      {lines.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.12)]">
          <div className="mx-auto max-w-5xl px-4 py-3 sm:px-8">
            {!placed?.ok ? (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-ink-900">{lines.reduce((s, l) => s + l.qty, 0)} item(s) · {fmtMoney(total, db.settings.currency)}</p>
                    <p className="text-[11px] text-ink-400">incl. delivery {fmtMoney(sf.deliveryFee || 0, db.settings.currency)}</p>
                  </div>
                  <button
                    onClick={() => document.getElementById("sf-checkout")?.scrollIntoView({ behavior: "smooth" })}
                    className="rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-lg transition-opacity hover:opacity-90"
                    style={{ backgroundColor: sf.theme.accent }}
                  >
                    Checkout
                  </button>
                </div>
                <div id="sf-checkout" className="mt-3 grid gap-2 sm:grid-cols-4">
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name *" className="h-10 rounded-xl border border-ink-200 px-3 text-sm focus:border-ink-400 focus:outline-none" />
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number *" className="h-10 rounded-xl border border-ink-200 px-3 text-sm focus:border-ink-400 focus:outline-none" />
                  <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Delivery address" className="h-10 rounded-xl border border-ink-200 px-3 text-sm focus:border-ink-400 focus:outline-none sm:col-span-2" />
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Any note for the shop (optional)" className="h-10 rounded-xl border border-ink-200 px-3 text-sm focus:border-ink-400 focus:outline-none sm:col-span-3" />
                  <button
                    onClick={submit}
                    disabled={!name.trim() || !phone.trim() || belowMin}
                    className="h-10 rounded-xl text-sm font-bold text-white shadow-lg transition-opacity hover:opacity-90 disabled:opacity-40"
                    style={{ backgroundColor: sf.theme.accent }}
                  >
                    {belowMin ? `Minimum ${fmtMoney(sf.minOrder || 0, db.settings.currency)}` : "Place order"}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
