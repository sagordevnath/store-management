import { Suspense, lazy, useMemo, useState } from "react";
import { useApp } from "../App";
import { computeKpis, customerDue, supplierDue, reorderList, expiringProducts } from "../lib/store";
import { fmtMoney, fmtCompact, initials, classNames, downloadCSV } from "../lib/helpers";
import { syncEngine } from "../lib/sync";
import { hasFeature } from "../lib/plans";
import { forecastCashflow, generateInsight } from "../lib/insights";
import {
  PERIODS,
  periodMetrics,
  revenueSeries,
  topProductsInRange,
  expenseBreakdownInRange,
  periodLabel,
  periodName,
  type PeriodKey,
} from "../lib/period";
import { AreaChart, BarChartH, Badge, Button, Card, CardHeader, Modal, Segmented, Th, Td } from "../ui";

// 3D revenue chart is code-split so it loads only when used.
const Bar3DChart = lazy(() => import("../three/Bar3DChart"));
import {
  IcCart, IcCash, IcBox, IcUsers, IcWallet, IcDownload, IcPlus,
  IcTrend, IcReceipt, IcRefresh,
} from "../icons";

type StatKey = "sales" | "purchases" | "expenses" | "stock" | "payable" | "receivable";

export default function DashboardPage() {
  const { db, setDB, currency, navigate, sync } = useApp();
  const [period, setPeriod] = useState<PeriodKey>("today");
  const [refreshTick, setRefreshTick] = useState(0);
  const [openStat, setOpenStat] = useState<StatKey | null>(null);
  const sub = db.subscription;

  const kpis = useMemo(() => computeKpis(db), [db, refreshTick]);
  const m = useMemo(() => periodMetrics(db, period), [db, period, refreshTick]);
  const series = useMemo(() => revenueSeries(db, period), [db, period, refreshTick]);
  const [chartMode, setChartMode] = useState<"2d" | "3d">("3d");
  const top = useMemo(() => topProductsInRange(db, periodRangeStart(period), new Date(), 6), [db, period, refreshTick]);
  const cats = useMemo(() => categorySlice(db, period, 6), [db, period, refreshTick]);

  const canWidgets = hasFeature(sub, "dashboard_widgets");
  const canTarget = hasFeature(sub, "target_progress");
  const canForecast = hasFeature(sub, "cashflow_forecast");
  const canInsight = hasFeature(sub, "ai_insight");
  const canReorder = hasFeature(sub, "smart_reorder");

  const forecast = useMemo(() => (canForecast ? forecastCashflow(db, 14) : []), [db, canForecast, refreshTick]);
  const insight = useMemo(() => (canInsight ? generateInsight(db, db.settings.monthlyTarget) : ""), [db, canInsight, refreshTick]);

  const recent = useMemo(
    () =>
      [...db.sales]
        .filter((s) => inSelectedPeriod(s.at, period))
        .sort((a, b) => (a.at < b.at ? 1 : -1))
        .slice(0, 7),
    [db, period, refreshTick]
  );

  const onRefresh = () => {
    try {
      const raw = localStorage.getItem("Managix_db_v2");
      if (raw) setDB(JSON.parse(raw));
    } catch { /* ignore */ }
    void syncEngine.syncNow().catch(() => undefined);
    setRefreshTick((t) => t + 1);
  };

  // ---- Drag-and-drop widget order (Pro) ----
  const WIDGETS = ["revenue", "insight", "forecast", "target"] as const;
  type WidgetKey = (typeof WIDGETS)[number];
  const [order, setOrder] = useState<WidgetKey[]>(() => {
    try {
      const raw = localStorage.getItem("Managix_dash_layout_v1");
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed) && parsed.length === WIDGETS.length && parsed.every((k) => (WIDGETS as readonly string[]).includes(k))) {
          return parsed as WidgetKey[];
        }
      }
    } catch { /* ignore */ }
    return [...WIDGETS];
  });
  const [dragKey, setDragKey] = useState<WidgetKey | null>(null);
  const persistOrder = (next: WidgetKey[]) => {
    setOrder(next);
    try { localStorage.setItem("Managix_dash_layout_v1", JSON.stringify(next)); } catch { /* ignore */ }
  };
  const onDrop = (over: WidgetKey) => {
    if (!dragKey || dragKey === over) return;
    const next = order.filter((k) => k !== dragKey);
    next.splice(next.indexOf(over), 0, dragKey);
    persistOrder(next);
    setDragKey(null);
  };
  const wrap = (key: WidgetKey, node: React.ReactNode) =>
    canWidgets ? (
      <div
        draggable
        onDragStart={() => setDragKey(key)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => onDrop(key)}
        className={classNames("relative cursor-grab active:cursor-grabbing", dragKey === key && "opacity-40")}
        title="Drag to rearrange"
      >
        {node}
      </div>
    ) : (
      <>{node}</>
    );

  // Target progress (Basic+)
  const mtd = kpis.monthRevenue;
  const target = db.settings.monthlyTarget;
  const targetPct = target > 0 ? Math.min(100, Math.round((mtd / target) * 100)) : 0;

  const lowStock = useMemo(
    () => db.products.filter((p) => p.stock <= p.lowStockAt).sort((a, b) => a.stock - b.stock).slice(0, 6),
    [db, refreshTick]
  );

  const expiring = useMemo(() => expiringProducts(db, 45).slice(0, 5), [db, refreshTick]);
  const reorder = useMemo(() => reorderList(db, 7).slice(0, 5), [db, refreshTick]);
  const dues = useMemo(
    () =>
      db.customers
        .map((c) => ({ c, due: customerDue(db, c.id, c.openingDue) }))
        .filter((x) => x.due > 0.009)
        .sort((a, b) => b.due - a.due)
        .slice(0, 5),
    [db, refreshTick]
  );

  const cards: {
    key: StatKey; label: string; value: number; icon: React.ReactNode; valueCls: string; iconCls: string; raw?: boolean;
  }[] = [
    {
      key: "sales", label: `${periodLabel(period)} sales`, value: m.salesTotal,
      icon: <IcTrend size={17} />, valueCls: "text-emerald-600", iconCls: "text-emerald-600",
    },
    {
      key: "purchases", label: `${periodLabel(period)} purchases`, value: m.purchasesTotal,
      icon: <IcCart size={17} />, valueCls: "text-blue-600", iconCls: "text-blue-600",
    },
    {
      key: "expenses", label: `${periodLabel(period)} expenses`, value: m.expensesTotal,
      icon: <IcReceipt size={17} />, valueCls: "text-orange-500", iconCls: "text-orange-500",
    },
    {
      key: "stock", label: "Total stock", value: m.stockQty,
      icon: <IcBox size={17} />, valueCls: "text-ink-900", iconCls: "text-emerald-600", raw: true,
    },
    {
      key: "payable", label: "Payable", value: m.payableTotal,
      icon: <IcWallet size={17} />, valueCls: "text-red-600", iconCls: "text-red-600",
    },
    {
      key: "receivable", label: "Receivable", value: m.receivableTotal,
      icon: <IcCash size={17} />, valueCls: "text-teal-600", iconCls: "text-teal-600",
    },
  ];

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">
            Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, {db.settings.ownerName.split(" ")[0]}
          </h1>
          <p className="mt-0.5 text-sm text-ink-500">Here is how {db.settings.shopName} is performing.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate("reports")}><IcDownload size={15} /> Reports</Button>
          <Button onClick={() => navigate("pos")}><IcPlus size={15} /> New Sale</Button>
        </div>
      </div>

      {/* ===== Period sub-menu: balance pill · tabs · refresh ===== */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={() => setOpenStat(null)}
          title="Cash on hand — cash collected minus purchases paid and expenses"
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
        >
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Balance: {fmtMoney(kpis.cashOnHand, currency)}
        </button>

        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          <div className="inline-flex max-w-full flex-nowrap overflow-x-auto rounded-lg border border-ink-200 bg-ink-100 p-1">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={classNames(
                  "shrink-0 whitespace-nowrap rounded-md px-3.5 py-1.5 text-sm font-medium transition-all",
                  period === p.value
                    ? "bg-white text-ink-900 shadow-sm ring-1 ring-ink-200/60"
                    : "text-ink-500 hover:text-ink-800"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Button variant="secondary" onClick={onRefresh} title="Reload the latest saved data">
            <IcRefresh size={15} className={sync.status === "syncing" ? "animate-spin" : undefined} /> Refresh
          </Button>
        </div>
      </div>

      {/* ===== Six clickable stat cards ===== */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <button key={c.key} onClick={() => setOpenStat(c.key)} className="group text-left focus:outline-none">
            <Card className="h-full p-4 transition-all group-hover:border-brand-300 group-hover:shadow-pop group-focus-visible:ring-2 group-focus-visible:ring-brand-500/50">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-ink-700">{c.label}</p>
                <span className={c.iconCls}>{c.icon}</span>
              </div>
              <p className={classNames("mt-2 text-2xl font-bold tracking-tight", c.valueCls)}>
                {c.raw ? String(c.value) : fmtMoney(c.value, currency)}
              </p>
              <p className="mt-1 text-[11px] text-ink-400">
                {c.key === "stock"
                  ? `${m.productCount} products · ${m.lowStock} low`
                  : c.key === "sales"
                    ? `${m.salesCount} orders · ${m.itemsSold} items`
                    : c.key === "purchases"
                      ? `${m.purchasesCount} order${m.purchasesCount === 1 ? "" : "s"} · ${m.purchasesQty} items`
                      : c.key === "expenses"
                        ? `${m.expensesCount} entr${m.expensesCount === 1 ? "y" : "ies"}`
                        : c.key === "payable"
                          ? `${m.payableSuppliers} suppliers to pay`
                          : `${m.dueCustomers} customers owe`}
              </p>
              <p className="mt-1 text-[11px] font-medium text-brand-600 opacity-0 transition-opacity group-hover:opacity-100">
                Click for details →
              </p>
            </Card>
          </button>
        ))}
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <QuickAction icon={<IcPlus size={15} />} label="New Sale" onClick={() => navigate("pos")} />
        <QuickAction icon={<IcBox size={15} />} label="Add Product" onClick={() => navigate("products")} />
        <QuickAction icon={<IcCart size={15} />} label="New Purchase" onClick={() => navigate("purchases")} />
        <QuickAction icon={<IcWallet size={15} />} label="Add Expense" onClick={() => navigate("expenses")} />
        <QuickAction icon={<IcUsers size={15} />} label="Collect Due" onClick={() => navigate("customers")} />
        <QuickAction icon={<IcRefresh size={15} />} label="Process Return" onClick={() => navigate("returns")} />
      </div>

      {/* ===== Draggable Phase-2 widgets ===== */}
      {order.map((key) => (
        <div key={key}>
          {key === "revenue" ? wrap("revenue", (
            <div className="grid gap-3.5 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader
                  title={`Revenue — ${periodName(period)}`}
                  subtitle={m.rangeText}
                  action={
                    <span className="text-xs font-semibold text-ink-700">
                      Total {fmtMoney(m.salesTotal, currency)}
                    </span>
                  }
                />
                <div className="px-4 pb-4 pt-2">
                  <div className="mb-2 flex justify-end">
                    <Segmented
                      options={[
                        { value: "2d", label: "2D" },
                        { value: "3d", label: "3D" },
                      ]}
                      value={chartMode}
                      onChange={(v) => setChartMode(v)}
                    />
                  </div>
                  {chartMode === "3d" ? (
                    <Suspense fallback={<div style={{ height: 260 }} className="animate-pulse rounded-lg bg-ink-100" />}>
                      <Bar3DChart data={series} formatValue={(v) => fmtMoney(v, currency)} height={260} />
                    </Suspense>
                  ) : (
                    <AreaChart data={series} formatY={(v) => fmtCompact(v, currency)} />
                  )}
                </div>
              </Card>

              <Card>
                <CardHeader title="Sales by category" subtitle={periodName(period).replace(/^./, (ch) => ch.toUpperCase())} />
                <div className="px-5 py-5">
                  {cats.length ? <Donut categories={cats} currency={currency} /> : <p className="text-sm text-ink-400">No sales yet.</p>}
                </div>
              </Card>
            </div>
          )) : null}

          {key === "insight" && canInsight ? wrap("insight", (
            <Card className="border-violet-200 bg-gradient-to-br from-violet-50 via-white to-white">
              <div className="flex items-start gap-4 px-5 py-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-lg">🤖</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-900">AI daily insight</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-600">{insight}</p>
                </div>
              </div>
            </Card>
          )) : null}

          {key === "forecast" && canForecast ? wrap("forecast", (
            <Card>
              <CardHeader title="Cash-flow forecast" subtitle="Next 14 days · based on your last 30-day averages" />
              <div className="px-4 pb-4 pt-2">
                <AreaChart
                  data={forecast.map((f) => ({ label: f.label, value: Math.max(f.cum, 0) }))}
                  color="#7c5cd6"
                  formatY={(v) => fmtCompact(v, currency)}
                />
              </div>
              <div className="grid grid-cols-3 gap-px border-t border-ink-100 bg-ink-100">
                {["Daily inflow", "Daily outflow", "14-day net"].map((l, i) => (
                  <div key={l} className="bg-white px-4 py-3">
                    <p className="text-[11px] text-ink-400">{l}</p>
                    <p className="mt-0.5 text-sm font-bold text-ink-900">
                      {i === 0 ? fmtMoney(forecast[0]?.inflow ?? 0, currency)
                        : i === 1 ? fmtMoney(forecast[0]?.outflow ?? 0, currency)
                        : fmtMoney(forecast[forecast.length - 1]?.cum ?? 0, currency)}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )) : null}

          {key === "target" && canTarget ? wrap("target", (
            <Card>
              <CardHeader
                title="Monthly sales target"
                subtitle={`${fmtMoney(mtd, currency)} of ${fmtMoney(target, currency)} · ${new Date().toLocaleDateString("en-US", { month: "long" })}`}
                action={<Badge tone={targetPct >= 100 ? "green" : targetPct >= 60 ? "blue" : "amber"}>{targetPct}%</Badge>}
              />
              <div className="px-5 py-5">
                <div className="h-3.5 w-full overflow-hidden rounded-full bg-ink-100">
                  <div
                    className={`h-full rounded-full ${targetPct >= 100 ? "bg-emerald-500" : "bg-gradient-to-r from-brand-500 to-brand-600"}`}
                    style={{ width: `${Math.max(targetPct, 2)}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-xs text-ink-400">
                  <span>{fmtMoney(mtd, currency)} MTD</span>
                  <span>Target {fmtMoney(target, currency)}</span>
                </div>
              </div>
            </Card>
          )) : null}
        </div>
      ))}

      {canWidgets ? (
        <p className="text-center text-xs text-ink-400">Tip: drag cards to rearrange your dashboard (Pro feature).</p>
      ) : null}

      {/* ===== Second row ===== */}
      <div className="grid gap-3.5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={`Recent sales — ${periodName(period)}`}
            subtitle={m.rangeText}
            action={<Button variant="ghost" size="sm" onClick={() => navigate("sales")}>View all →</Button>}
          />
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-ink-100 bg-ink-50/50">
                <tr>
                  <Th>Invoice</Th>
                  <Th>Customer</Th>
                  <Th>Payment</Th>
                  <Th className="text-right">Total</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {recent.length === 0 ? (
                  <tr><Td className="py-6 text-center text-sm text-ink-400" >No sales in this period.</Td></tr>
                ) : (
                  recent.map((s) => (
                    <tr key={s.id} className="hover:bg-ink-50/60">
                      <Td className="font-medium text-ink-900">{s.invoiceNo}</Td>
                      <Td>{s.customerId ? db.customers.find((c) => c.id === s.customerId)?.name ?? "—" : "Walk-in"}</Td>
                      <Td>{s.payment}</Td>
                      <Td className="text-right font-semibold text-ink-900">{fmtMoney(s.total, currency)}</Td>
                      <Td>
                        <Badge tone={s.status === "Paid" ? "green" : s.status === "Partially Paid" ? "amber" : "red"}>
                          {s.status}
                        </Badge>
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-3.5">
          <Card>
            <CardHeader
              title="Low stock alerts"
              subtitle="Reorder before you run out"
              action={lowStock.length ? <Button variant="ghost" size="sm" onClick={() => navigate("products")}>Manage →</Button> : undefined}
            />
            <div className="divide-y divide-ink-100">
              {lowStock.length === 0 ? (
                <p className="px-5 py-6 text-center text-sm text-ink-400">All stocked up. Nice work!</p>
              ) : (
                lowStock.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-800">{p.name}</p>
                      <p className="text-xs text-ink-400">{p.sku}</p>
                    </div>
                    <Badge tone={p.stock === 0 ? "red" : "amber"}>{p.stock === 0 ? "Out of stock" : `${p.stock} left`}</Badge>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Smart reorder"
              subtitle="Velocity-based suggestions (Pro)"
              action={
                canReorder && reorder.length ? (
                  <Button variant="ghost" size="sm" onClick={() => navigate("purchases")}>Draft PO →</Button>
                ) : undefined
              }
            />
            <div className="divide-y divide-ink-100">
              {!canReorder ? (
                <p className="px-5 py-6 text-center text-sm text-ink-400">
                  Smart reorder is a Pro feature —{" "}
                  <button className="font-medium text-brand-600 underline" onClick={() => navigate("billing")}>compare plans</button>.
                </p>
              ) : reorder.length === 0 ? (
                <p className="px-5 py-6 text-center text-sm text-ink-400">Stock levels look healthy. Nothing to reorder.</p>
              ) : (
                reorder.map((r) => (
                  <div key={r.product.id} className="flex items-center justify-between px-5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-800">{r.product.name}</p>
                      <p className="text-xs text-ink-400">
                        {r.daysCover === null ? "No sales velocity" : `${r.daysCover} days of cover left`}
                      </p>
                    </div>
                    <Badge tone={r.daysCover !== null && r.daysCover < 3 ? "red" : "amber"}>+{r.suggestQty}</Badge>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Expiring soon"
              subtitle="Batch expiry within 45 days"
              action={expiring.length ? <Button variant="ghost" size="sm" onClick={() => navigate("products")}>Review →</Button> : undefined}
            />
            <div className="divide-y divide-ink-100">
              {expiring.length === 0 ? (
                <p className="px-5 py-6 text-center text-sm text-ink-400">No expiry-tracked items are close to expiry.</p>
              ) : (
                expiring.map(({ product: p, daysLeft }) => (
                  <div key={p.id} className="flex items-center justify-between px-5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-800">{p.name}</p>
                      <p className="text-xs text-ink-400">{p.stock} {p.unit} in stock</p>
                    </div>
                    <Badge tone={daysLeft <= 0 ? "red" : daysLeft <= 14 ? "amber" : "neutral"}>
                      {daysLeft <= 0 ? "Expired" : `${daysLeft}d left`}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Top dues to collect"
              subtitle="Customers who owe the most"
              action={dues.length ? <Button variant="ghost" size="sm" onClick={() => navigate("customers")}>Collect →</Button> : undefined}
            />
            <div className="divide-y divide-ink-100">
              {dues.length === 0 ? (
                <p className="px-5 py-6 text-center text-sm text-ink-400">No outstanding dues. Excellent!</p>
              ) : (
                dues.map(({ c, due }) => (
                  <div key={c.id} className="flex items-center justify-between px-5 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-100 text-[11px] font-bold text-ink-600">
                        {initials(c.name)}
                      </span>
                      <span className="truncate text-sm font-medium text-ink-800">{c.name}</span>
                    </div>
                    <span className="text-sm font-bold text-red-600">{fmtMoney(due, currency)}</span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* ===== Third row ===== */}
      <div className="grid gap-3.5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Best sellers" subtitle={`Ranked by profit · ${periodName(period)}`} />
          <div className="px-5 py-4">
            <BarChartH
              data={top.map((t) => ({ label: t.name, value: t.profit }))}
              formatValue={(v) => fmtMoney(v, currency)}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Period summary" subtitle={m.rangeText} />
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-b-xl bg-ink-100">
            {[
              ["Orders", String(m.salesCount)],
              ["Items sold", String(m.itemsSold)],
              ["Margin", m.salesTotal > 0 ? `${m.marginPct}%` : "—"],
              ["Avg. order", fmtMoney(m.avgOrder, currency)],
              ["Expenses", fmtMoney(m.expensesTotal, currency)],
              ["Net cash", fmtMoney(m.collectedTotal - m.cashOut, currency)],
            ].map(([label, value]) => (
              <div key={label} className="bg-white px-5 py-4">
                <p className="text-xs text-ink-400">{label}</p>
                <p className="mt-0.5 text-lg font-bold text-ink-900">{value}</p>
              </div>
            ))}
          </div>
          <div className="border-t border-ink-100 px-5 py-3">
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => downloadCSV(`sales-${period}.csv`, [
                ["Invoice", "Date", "Customer", "Payment", "Total", "Paid", "Profit"],
                ...db.sales
                  .filter((s) => inSelectedPeriod(s.at, period))
                  .map((s) => [s.invoiceNo, s.at.slice(0, 10), s.customerId ? db.customers.find((c) => c.id === s.customerId)?.name ?? "" : "Walk-in", s.payment, s.total, s.paidAmount, s.profit]),
              ])}
            >
              <IcDownload size={14} /> Export period sales (CSV)
            </Button>
          </div>
        </Card>
      </div>

      {/* ===== Detail modals ===== */}
      <StatModal statKey={openStat} onClose={() => setOpenStat(null)} period={period} metrics={m} />
    </div>
  );
}

/* ================= Period helpers (local) ================= */

function periodRangeStart(key: PeriodKey): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (key === "today") return d;
  if (key === "weekly") { d.setDate(d.getDate() - 6); return d; }
  if (key === "monthly") { d.setDate(1); return d; }
  if (key === "yearly") { d.setMonth(0, 1); return d; }
  return new Date(2000, 0, 1);
}

function inSelectedPeriod(iso: string, key: PeriodKey): boolean {
  return new Date(iso).getTime() >= periodRangeStart(key).getTime();
}

function categorySlice(db: import("../types").DB, key: PeriodKey, limit: number) {
  const since = periodRangeStart(key);
  const byId = new Map(db.products.map((p) => [p.id, p]));
  const cats = new Map(db.categories.map((c) => [c.id, c]));
  const map = new Map<string, number>();
  for (const s of db.sales) {
    if (new Date(s.at) < since) continue;
    for (const it of s.items) {
      const p = byId.get(it.productId);
      const name = p?.categoryId ? cats.get(p.categoryId)?.name ?? "Other" : "Uncategorized";
      map.set(name, (map.get(name) ?? 0) + it.unitPrice * it.qty - it.discount);
    }
  }
  return [...map.entries()]
    .map(([category, value]) => ({ category, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

/* ================= Detail modal ================= */

function StatModal({
  statKey, onClose, period, metrics,
}: {
  statKey: StatKey | null;
  onClose: () => void;
  period: PeriodKey;
  metrics: ReturnType<typeof periodMetrics>;
}) {
  const { db, currency, navigate } = useApp();
  if (!statKey) return null;
  const m = metrics;
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");

  const foot = (extra?: React.ReactNode) => (
    <>
      {extra}
      <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
    </>
  );

  const content: Record<StatKey, { title: string; sub: string; body: React.ReactNode }> = {
    sales: {
      title: `${periodLabel(period)} sales`,
      sub: m.rangeText,
      body: (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Mini label="Gross sales" value={fmtMoney(m.salesTotal, currency)} strong />
            <Mini label="Orders" value={String(m.salesCount)} />
            <Mini label="Items sold" value={String(m.itemsSold)} />
            <Mini label="Avg. order" value={fmtMoney(m.avgOrder, currency)} />
          </div>
          {m.prev ? (
            <p className="text-xs text-ink-500">
              Previous comparable period: <b>{fmtMoney(m.prev.salesTotal, currency)}</b>{" "}
              {m.prev.salesTotal > 0 ? (
                <Badge tone={m.salesTotal >= m.prev.salesTotal ? "green" : "red"}>
                  {m.salesTotal >= m.prev.salesTotal ? "▲" : "▼"} {Math.abs(Math.round(((m.salesTotal - m.prev.salesTotal) / m.prev.salesTotal) * 100))}%
                </Badge>
              ) : null}
            </p>
          ) : null}
          {m.byMethod.length ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">By payment method</p>
              <div className="space-y-1.5">
                {m.byMethod.map((row) => (
                  <div key={row.method} className="flex items-center justify-between rounded-lg border border-ink-100 px-3 py-2 text-sm">
                    <span className="font-medium text-ink-700">{row.method}</span>
                    <span className="text-ink-500">{row.count} order{row.count === 1 ? "" : "s"}</span>
                    <span className="font-semibold text-ink-900">{fmtMoney(row.amount, currency)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ),
    },
    purchases: {
      title: `${periodLabel(period)} purchases`,
      sub: m.rangeText,
      body: (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Mini label="Purchases total" value={fmtMoney(m.purchasesTotal, currency)} strong />
            <Mini label="Purchase orders" value={String(m.purchasesCount)} />
            <Mini label="Items purchased" value={String(m.purchasesQty)} />
            <Mini label="Paid to suppliers" value={fmtMoney(m.purchasesPaid, currency)} />
            <Mini label="Unpaid (payable)" value={fmtMoney(m.payableIncurred, currency)} tone="text-red-600" />
          </div>
          {m.prev ? (
            <p className="text-xs text-ink-500">
              Previous comparable period: <b>{fmtMoney(m.prev.purchasesTotal, currency)}</b>{" "}
              {m.prev.purchasesTotal > 0 ? (
                <Badge tone={m.purchasesTotal >= m.prev.purchasesTotal ? "green" : "red"}>
                  {m.purchasesTotal >= m.prev.purchasesTotal ? "▲" : "▼"} {Math.abs(Math.round(((m.purchasesTotal - m.prev.purchasesTotal) / m.prev.purchasesTotal) * 100))}%
                </Badge>
              ) : null}
            </p>
          ) : null}
          <TopList
            rows={db.purchases
              .filter((p) => inSelectedPeriod(p.at, period))
              .sort((a, b) => b.total - a.total)
              .slice(0, 8)
              .map((p) => ({
                name: db.suppliers.find((s) => s.id === p.supplierId)?.name ?? "Walk-in supplier",
                right: fmtMoney(p.total, currency),
                sub: `${new Date(p.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${p.items.length} item${p.items.length === 1 ? "" : "s"} · ${p.payment}`,
              }))}
            empty="No purchases in this period."
            title="Largest purchase orders in period"
          />
        </div>
      ),
    },
    expenses: {
      title: `${periodLabel(period)} expenses`,
      sub: m.rangeText,
      body: (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Mini label="Total expenses" value={fmtMoney(m.expensesTotal, currency)} strong tone="text-orange-600" />
            <Mini label="Entries" value={String(m.expensesCount)} />
            <Mini label="Avg. per entry" value={m.expensesCount ? fmtMoney(m.expensesTotal / m.expensesCount, currency) : fmtMoney(0, currency)} />
            <Mini label="% of sales" value={pct(m.expensesTotal, m.salesTotal)} />
          </div>
          {m.prev ? (
            <p className="text-xs text-ink-500">
              Previous comparable period: <b>{fmtMoney(m.prev.expensesTotal, currency)}</b>{" "}
              {m.prev.expensesTotal > 0 ? (
                <Badge tone={m.expensesTotal <= m.prev.expensesTotal ? "green" : "red"}>
                  {m.expensesTotal <= m.prev.expensesTotal ? "▼" : "▲"} {Math.abs(Math.round(((m.expensesTotal - m.prev.expensesTotal) / m.prev.expensesTotal) * 100))}%
                </Badge>
              ) : null}
            </p>
          ) : null}
          <TopList
            rows={expenseBreakdownInRange(db, periodStart(period), new Date()).map((x) => ({
              name: x.category,
              right: fmtMoney(x.value, currency),
              sub: `${Math.round((x.value / (m.expensesTotal || 1)) * 100)}% of expenses`,
            }))}
            empty="No expenses in this period."
            title="By category"
          />
        </div>
      ),
    },
    stock: {
      title: "Total stock",
      sub: "Live inventory snapshot",
      body: (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Mini label="Units in stock" value={String(m.stockQty)} strong />
            <Mini label="Products" value={String(m.productCount)} />
            <Mini label="Stock value (cost)" value={fmtMoney(m.stockValue, currency)} />
            <Mini label="Retail value" value={fmtMoney(m.stockRetail, currency)} />
            <Mini label="Low stock" value={String(m.lowStock)} tone="text-amber-600" />
            <Mini label="Out of stock" value={String(m.outOfStock)} tone="text-red-600" />
          </div>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-ink-100">
            <table className="w-full">
              <thead className="bg-ink-50"><tr><Th>Product</Th><Th className="text-right">Stock</Th><Th className="text-right">Value</Th></tr></thead>
              <tbody className="divide-y divide-ink-100">
                {[...db.products].sort((a, b) => b.stock * b.cost - a.stock * a.cost).slice(0, 12).map((p) => (
                  <tr key={p.id}>
                    <Td className="font-medium text-ink-800">{p.name}</Td>
                    <Td className="text-right">{p.stock} {p.unit}</Td>
                    <Td className="text-right font-semibold">{fmtMoney(p.stock * p.cost, currency)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ),
    },
    payable: {
      title: "Payable — what you owe suppliers",
      sub: "Outstanding supplier balance right now",
      body: (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Mini label="Total payable" value={fmtMoney(m.payableTotal, currency)} strong tone="text-red-600" />
            <Mini label="Suppliers owed" value={String(m.payableSuppliers)} />
            <Mini label={`New payable ${periodName(period)}`} value={fmtMoney(m.payableIncurred, currency)} />
          </div>
          <TopList
            rows={db.suppliers
              .map((s) => ({ s, due: supplierDue(db, s.id) }))
              .filter((x) => x.due > 0.009)
              .sort((a, b) => b.due - a.due)
              .slice(0, 8)
              .map(({ s, due }) => ({ name: s.name, right: fmtMoney(due, currency), sub: s.phone }))}
            empty="Nothing owed to suppliers. Excellent!"
            title="Suppliers with outstanding balances"
          />
        </div>
      ),
    },
    receivable: {
      title: "Receivable — what customers owe you",
      sub: "Outstanding customer balance right now",
      body: (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Mini label="Total receivable" value={fmtMoney(m.receivableTotal, currency)} strong tone="text-teal-600" />
            <Mini label="Customers owing" value={String(m.dueCustomers)} />
            <Mini label={`New receivable ${periodName(period)}`} value={fmtMoney(m.receivableIncurred, currency)} />
          </div>
          <TopList
            rows={db.customers
              .map((c) => ({ c, due: customerDue(db, c.id, c.openingDue) }))
              .filter((x) => x.due > 0.009)
              .sort((a, b) => b.due - a.due)
              .slice(0, 8)
              .map(({ c, due }) => ({ name: c.name, right: fmtMoney(due, currency), sub: c.phone }))}
            empty="No customer dues. Excellent!"
            title="Customers with dues"
          />
        </div>
      ),
    },
  };

  const c = content[statKey];
  return (
    <Modal
      open
      onClose={onClose}
      title={c.title}
      footer={foot(
        <Button variant="ghost" size="sm" onClick={() => { onClose(); navigate(modalNav(statKey) as never); }}>
          Open {modalNavLabel(statKey)} →
        </Button>
      )}
    >
      <p className="mb-4 text-xs text-ink-400">{c.sub}</p>
      {c.body}
    </Modal>
  );
}

function periodStart(key: PeriodKey): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (key === "today") return d;
  if (key === "weekly") { d.setDate(d.getDate() - 6); return d; }
  if (key === "monthly") { d.setDate(1); return d; }
  if (key === "yearly") { d.setMonth(0, 1); return d; }
  return new Date(2000, 0, 1);
}

function modalNav(key: StatKey): string {
  switch (key) {
    case "payable": return "suppliers";
    case "receivable": return "customers";
    case "stock": return "products";
    case "expenses": return "expenses";
    case "purchases": return "purchases";
    default: return "reports";
  }
}

function modalNavLabel(key: StatKey): string {
  switch (key) {
    case "payable": return "Suppliers";
    case "receivable": return "Customers";
    case "stock": return "Products";
    case "expenses": return "Expenses";
    case "purchases": return "Purchases";
    default: return "Reports";
  }
}

function Mini({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div className="rounded-lg border border-ink-100 bg-ink-50/50 px-3 py-2.5">
      <p className="text-[11px] font-medium text-ink-400">{label}</p>
      <p className={classNames("mt-0.5 text-base font-bold text-ink-900", strong && "text-lg", tone)}>{value}</p>
    </div>
  );
}

function TopList({ title, rows, empty }: { title: string; rows: { name: string; right: string; sub?: string }[]; empty: string }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-400">{empty}</p>
      ) : (
        <div className="divide-y divide-ink-100 rounded-lg border border-ink-100">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium text-ink-800">{r.name}</p>
                {r.sub ? <p className="text-xs text-ink-400">{r.sub}</p> : null}
              </div>
              <span className="ml-3 shrink-0 font-semibold text-ink-900">{r.right}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-3.5 py-2 text-sm font-medium text-ink-700 shadow-card transition-all hover:border-brand-300 hover:text-brand-700 hover:shadow-pop"
    >
      {icon} {label}
    </button>
  );
}

function Donut({ categories, currency }: { categories: { category: string; value: number }[]; currency: string }) {
  const total = categories.reduce((s, c) => s + c.value, 0);
  const colors = ["#1f6a4c", "#2e8560", "#52a17b", "#84bfa0", "#b4d9c3", "#414c5f", "#8493a9", "#d9ecdf"];
  const r = 54;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="flex items-center gap-5">
      <svg width="150" height="150" viewBox="0 0 150 150">
        <g transform="translate(75,75) rotate(-90)">
          {categories.map((d, i) => {
            const frac = d.value / (total || 1);
            const el = (
              <circle
                key={d.category}
                r={r}
                fill="none"
                stroke={colors[i % colors.length]}
                strokeWidth="22"
                strokeDasharray={`${frac * c} ${c}`}
                strokeDashoffset={-acc * c}
              />
            );
            acc += frac;
            return el;
          })}
        </g>
        <text x="75" y="72" textAnchor="middle" fontSize="16" fontWeight="700" fill="#1a1e26">
          {fmtCompact(total, currency)}
        </text>
        <text x="75" y="88" textAnchor="middle" fontSize="9" fill="#8493a9">SALES</text>
      </svg>
      <div className="min-w-0 flex-1 space-y-1.5">
        {categories.map((d, i) => (
          <div key={d.category} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors[i % colors.length] }} />
              <span className="truncate text-ink-700">{d.category}</span>
            </span>
            <span className="text-ink-500">{Math.round((d.value / (total || 1)) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
