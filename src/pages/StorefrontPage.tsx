import { useMemo, useState } from "react";
import { useApp } from "../App";
import { shopLink, setOrderStatus, acceptStorefrontOrder } from "../lib/storefront";
import { fmtMoney, fmtDateTime, classNames } from "../lib/helpers";
import { logAudit } from "../lib/audit";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Select, TextArea, TextInput, Toggle, useToast, Th, Td } from "../ui";
import { IcGlobe, IcCheck } from "../icons";

const ACCENTS = ["#1f6a4c", "#0e7490", "#7c3aed", "#db2777", "#d97706", "#dc2626", "#2563eb", "#059669"];

export default function StorefrontPage() {
  const { db, update, currency, navigate } = useApp();
  const toast = useToast();
  const sf = db.storefront;
  const [copied, setCopied] = useState(false);
  const newOrders = db.storefrontOrders.filter((o) => o.status === "New").length;

  const setSf = (patch: Partial<typeof sf>) =>
    update((d) => ({ ...d, storefront: { ...d.storefront, ...patch } }));

  const copyLink = async () => {
    const link = shopLink(sf);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
      toast("Shop link copied — share it anywhere");
    } catch {
      toast(link, "info");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Online Storefront</h1>
          <p className="text-sm text-ink-500">Your shop on the internet — customers browse real stock and order, orders land here</p>
        </div>
        <Toggle
          checked={sf.enabled}
          onChange={(v) => {
            setSf({ enabled: v });
            toast(v ? "Storefront is live" : "Storefront paused", "info");
          }}
          label={sf.enabled ? "Store is OPEN" : "Store is paused"}
          hint="Turn off to hide the public link without deleting anything"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        {/* Share & theme */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Share your shop" subtitle="One link works on WhatsApp, Facebook, anywhere" />
            <div className="space-y-3 px-5 py-4">
              <div className="flex items-center gap-2 rounded-xl bg-ink-50 px-3.5 py-2.5">
                <IcGlobe size={16} className="shrink-0 text-ink-400" />
                <code className="min-w-0 flex-1 truncate text-xs text-ink-700">{shopLink(sf)}</code>
                <Button size="sm" variant={copied ? "success" : "primary"} onClick={copyLink}>
                  {copied ? <><IcCheck size={14} /> Copied</> : "Copy link"}
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Shop link name" hint={`managix.app/#shop/${sf.slug}`}>
                  <TextInput
                    value={sf.slug}
                    onChange={(e) => setSf({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
                    placeholder="my-shop"
                  />
                </Field>
                <Field label="Custom domain (optional)" hint="Point a domain you own — configure DNS after deploy">
                  <TextInput value={sf.customDomain} onChange={(e) => setSf({ customDomain: e.target.value })} placeholder="shop.mystore.com" />
                </Field>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Look & feel" subtitle="Match the storefront to your brand" />
            <div className="space-y-3 px-5 py-4">
              <Field label="Accent color">
                <div className="flex flex-wrap gap-2">
                  {ACCENTS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setSf({ theme: { ...sf.theme, accent: c } })}
                      className={classNames(
                        "h-8 w-8 rounded-full ring-2 ring-offset-2 transition-transform hover:scale-110",
                        sf.theme.accent === c ? "ring-ink-900" : "ring-transparent",
                      )}
                      style={{ backgroundColor: c }}
                      aria-label={`Accent ${c}`}
                    />
                  ))}
                </div>
              </Field>
              <Field label="Welcome line"><TextInput value={sf.theme.hero} onChange={(e) => setSf({ theme: { ...sf.theme, hero: e.target.value } })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Delivery fee"><TextInput type="number" value={sf.deliveryFee} onChange={(e) => setSf({ deliveryFee: parseFloat(e.target.value) || 0 })} /></Field>
                <Field label="Minimum order"><TextInput type="number" value={sf.minOrder} onChange={(e) => setSf({ minOrder: parseFloat(e.target.value) || 0 })} /></Field>
              </div>
              <Button variant="secondary" onClick={() => window.open(shopLink(sf), "_blank")}>
                Preview store <IcGlobe size={15} />
              </Button>
            </div>
          </Card>
        </div>

        {/* Live preview mini */}
        <Card className="overflow-hidden">
          <CardHeader title="Live preview" subtitle="What customers see" />
          <div className="m-4 mt-0 overflow-hidden rounded-xl border border-ink-200">
            <div className="px-4 py-5 text-white" style={{ backgroundColor: sf.theme.accent }}>
              <p className="text-xs font-bold uppercase tracking-widest opacity-70">{db.settings.shopName}</p>
              <p className="mt-1 text-sm font-semibold leading-snug">{sf.theme.hero}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 p-3">
              {db.products.filter((p) => p.stock > 0 && p.forRetailSale !== false).slice(0, 6).map((p) => (
                <div key={p.id} className="rounded-lg border border-ink-100 p-2.5">
                  <p className="truncate text-xs font-semibold text-ink-800">{p.name}</p>
                  <p className="text-xs text-ink-500">{fmtMoney(p.price, currency)}</p>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Orders */}
      <Card>
        <CardHeader
          title="Online orders"
          subtitle={newOrders > 0 ? `${newOrders} new order${newOrders > 1 ? "s" : ""} waiting for you` : "Orders from the storefront appear here instantly"}
          action={<Button size="sm" variant="secondary" onClick={() => navigate("pos")}>Sell in shop</Button>}
        />
        {db.storefrontOrders.length === 0 ? (
          <EmptyState icon={<IcGlobe size={20} />} title="No online orders yet" subtitle="Share your shop link — orders show up here with customer, items and address." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-ink-100 bg-ink-50/60"><tr><Th>Placed</Th><Th>Customer</Th><Th>Items</Th><Th>Total</Th><Th>Status</Th><Th className="text-right">Actions</Th></tr></thead>
              <tbody className="divide-y divide-ink-100">
                {db.storefrontOrders.map((o) => (
                  <tr key={o.id}>
                    <Td>{fmtDateTime(o.at)}</Td>
                    <Td>
                      <p className="font-medium text-ink-900">{o.customerName}</p>
                      <p className="text-xs text-ink-400">{o.phone} · {o.address}</p>
                    </Td>
                    <Td>
                      <span className="text-xs text-ink-600">{o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</span>
                      {o.note ? <p className="text-[11px] text-amber-600">Note: {o.note}</p> : null}
                    </Td>
                    <Td className="font-bold">{fmtMoney(o.total, currency)}</Td>
                    <Td>
                      <Badge tone={o.status === "New" ? "amber" : o.status === "Accepted" ? "blue" : o.status === "Delivered" ? "green" : "red"}>{o.status}</Badge>
                    </Td>
                    <Td className="text-right">
                      {o.status === "New" ? (
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" onClick={() => {
                            update((d) => {
                              const { db: next, invoiceNo } = acceptStorefrontOrder(d, o.id, d.settings.ownerName);
                              if (invoiceNo) return { ...next, audit: logAudit(next.audit, "sale", "Sale", invoiceNo, `Accepted online order from ${o.customerName}`) };
                              return next;
                            });
                            toast("Order accepted — stock reduced & invoice created");
                          }}>Accept → invoice</Button>
                          <Button size="sm" variant="ghost" onClick={() => { update((d) => setOrderStatus(d, o.id, "Rejected")); toast("Order rejected", "info"); }}>Reject</Button>
                        </div>
                      ) : o.status === "Accepted" ? (
                        <Button size="sm" variant="secondary" onClick={() => update((d) => setOrderStatus(d, o.id, "Delivered"))}>Mark delivered</Button>
                      ) : (
                        <span className="text-xs text-ink-400">{o.status === "Delivered" ? "Completed" : "Rejected"}</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
