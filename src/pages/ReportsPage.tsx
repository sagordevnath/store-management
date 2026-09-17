import { useMemo, useState } from "react";
import { useApp } from "../App";
import { fmtMoney, fmtCompact, downloadCSV } from "../lib/helpers";
import { hasFeature } from "../lib/plans";
import { categoryReport } from "../lib/categories";
import {
  PERIODS,
  periodMetrics,
  periodRange,
  periodName,
  revenueSeries,
  inRange,
  productPerformanceInRange,
  expenseBreakdownInRange,
  categorySalesInRange,
  type PeriodKey,
} from "../lib/period";
import { AreaChart, BarChartH, Badge, Button, Card, CardHeader, LockedCard, Segmented, Th, Td } from "../ui";
import { IcDownload } from "../icons";

type Tab = "pl" | "category" | "expenses";

export default function ReportsPage() {
  const { db, currency, navigate } = useApp();
  const [period, setPeriod] = useState<PeriodKey>("monthly");
  const [tab, setTab] = useState<Tab>("pl");
  const canCategory = hasFeature(db.subscription, "categories_report");

  const m = useMemo(() => periodMetrics(db, period), [db, period]);
  const r = useMemo(() => periodRange(period), [period]);
  const series = useMemo(() => revenueSeries(db, period), [db, period]);
  const top = useMemo(() => productPerformanceInRange(db, r.start, r.end, 8), [db, r.start, r.end]);
  const catSales = useMemo(() => categorySalesInRange(db, r.start, r.end), [db, r.start, r.end]);
  const exp = useMemo(() => expenseBreakdownInRange(db, r.start, r.end), [db, r.start, r.end]);
  const logRows = useMemo(
    () => db.expenses.filter((e) => inRange(e.at, r.start, r.end)).sort((a, b) => +new Date(b.at) - +new Date(a.at)),
    [db, r.start, r.end]
  );
  const catRows = useMemo(
    () => (canCategory ? categoryReport(db, "all", { start: r.start, end: r.end }) : []),
    [db, r.start, r.end, canCategory]
  );

  const grossProfit = m.salesTotal - m.costTotal;
  const netProfit = grossProfit - m.expensesTotal;
  const netMargin = m.salesTotal > 0 ? Math.round((netProfit / m.salesTotal) * 100) : 0;
  const grossMargin = m.salesTotal > 0 ? Math.round((grossProfit / m.salesTotal) * 100) : 0;
  const expenseRatio = m.salesTotal > 0 ? Math.round((m.expensesTotal / m.salesTotal) * 100) : 0;
  const topExpense = exp[0];

  /* Previous-period deltas */
  const pctDelta = (cur: number, prev: number | undefined) =>
    prev && prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;
  const salesDelta = m.prev ? pctDelta(m.salesTotal, m.prev.salesTotal) : null;
  const profitDelta = m.prev ? pctDelta(netProfit, m.prev.profit - m.prev.expensesTotal) : null;
  const expDelta = m.prev ? pctDelta(m.expensesTotal, m.prev.expensesTotal) : null;

  const exportPL = () => {
    downloadCSV("profit-and-loss.csv", [
      ["Profit & Loss", m.rangeText],
      [],
      ["Revenue", m.salesTotal],
      ["Cost of goods sold", -m.costTotal],
      ["Gross profit", grossProfit],
      [],
      ["Expenses"],
      ...exp.map((e) => [e.category, -e.value]),
      ["Total expenses", -m.expensesTotal],
      [],
      ["Net profit", netProfit],
      ["Net margin", `${netMargin}%`],
    ]);
  };

  const DeltaBadge = ({ delta, invert = false }: { delta: number | null; invert?: boolean }) => {
    if (delta === null) return <Badge tone="neutral">No comparison</Badge>;
    const up = delta >= 0;
    const good = invert ? !up : up;
    return (
      <Badge tone={good ? "green" : "red"}>
        {up ? "▲" : "▼"} {Math.abs(delta)}% vs previous
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header: period selector + tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Reports</h1>
          <p className="text-sm text-ink-500">
            {m.rangeText} · sales, profit, categories and expenses for {periodName(period)}
          </p>
        </div>
        <Segmented
          options={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
          value={period}
          onChange={(v) => setPeriod(v as PeriodKey)}
        />
      </div>

      <Segmented
        options={[
          { value: "pl", label: "P&L" },
          { value: "category", label: "By Category" },
          { value: "expenses", label: "Expenses" },
        ]}
        value={tab}
        onChange={(v) => setTab(v as Tab)}
      />

      {/* ============================== P&L ============================== */}
      {tab === "pl" ? (
        <>
          <Card>
            <CardHeader
              title="Profit & Loss statement"
              subtitle={`Period: ${m.rangeText}`}
              action={
                <Button variant="secondary" size="sm" onClick={exportPL}>
                  <IcDownload size={13} /> CSV
                </Button>
              }
            />
            <div className="grid gap-px bg-ink-100 sm:grid-cols-4">
              {[
                ["Revenue", fmtMoney(m.salesTotal, currency), "text-ink-900"],
                ["Cost of goods", fmtMoney(m.costTotal, currency), "text-ink-900"],
                ["Gross profit", fmtMoney(grossProfit, currency), "text-brand-700"],
                ["Net profit", fmtMoney(netProfit, currency), netProfit >= 0 ? "text-emerald-700" : "text-red-600"],
              ].map(([label, value, tone]) => (
                <div key={label} className="bg-white px-5 py-4">
                  <p className="text-xs text-ink-400">{label}</p>
                  <p className={`mt-0.5 text-lg font-bold ${tone}`}>{value}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-ink-100 px-5 py-4">
              <div className="flex flex-wrap gap-2">
                <Badge tone="neutral">{m.salesCount} orders</Badge>
                <Badge tone="neutral">Avg order {fmtMoney(m.avgOrder, currency)}</Badge>
                <Badge tone={netMargin >= 15 ? "green" : netMargin >= 8 ? "amber" : "red"}>{netMargin}% net margin</Badge>
                <DeltaBadge delta={salesDelta} />
                <DeltaBadge delta={profitDelta} />
                <Badge tone="neutral">Purchases {fmtMoney(m.purchasesTotal, currency)}</Badge>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Revenue trend" subtitle={`Granularity matches the selected period — ${periodName(period)}`} />
            <div className="px-4 pb-4 pt-2">
              <AreaChart data={series} formatY={(v) => fmtCompact(v, currency)} />
            </div>
          </Card>

          <div className="grid gap-3.5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Top products" subtitle="By revenue in this period" />
              <div className="px-5 py-4">
                <BarChartH data={top.map((t) => ({ label: t.name, value: t.revenue }))} formatValue={(v) => fmtMoney(v, currency)} />
              </div>
            </Card>
            <Card>
              <CardHeader title="Payment mix" subtitle="Cash collected by method" />
              <div className="px-5 py-4">
                <BarChartH
                  data={m.byMethod.map((x) => ({ label: x.method, value: x.amount }))}
                  formatValue={(v) => fmtMoney(v, currency)}
                />
              </div>
            </Card>
          </div>

          <div className="grid gap-3.5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Sales by category" />
              <div className="px-5 py-4">
                <BarChartH data={catSales.map((c) => ({ label: c.category, value: c.value }))} formatValue={(v) => fmtMoney(v, currency)} />
              </div>
            </Card>
            <Card>
              <CardHeader title="Expenses by category" />
              <div className="px-5 py-4">
                <BarChartH data={exp.map((e) => ({ label: e.category, value: e.value }))} formatValue={(v) => fmtMoney(v, currency)} />
              </div>
            </Card>
          </div>

          {/* Detailed product table */}
          <Card>
            <CardHeader
              title="Product performance"
              subtitle="Quantity sold, revenue and profit per product in this period"
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    downloadCSV("product-performance.csv", [
                      ["Product", "Units sold", "Revenue", "Profit"],
                      ...top.map((t) => [t.name, t.qty, t.revenue, t.profit]),
                    ])
                  }
                >
                  <IcDownload size={13} /> CSV
                </Button>
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-ink-100 bg-ink-50/50">
                  <tr>
                    <Th>Product</Th>
                    <Th className="text-right">Units sold</Th>
                    <Th className="text-right">Revenue</Th>
                    <Th className="text-right">Profit</Th>
                    <Th className="text-right">Margin</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {top.map((t) => (
                    <tr key={t.id} className="hover:bg-ink-50/60">
                      <Td className="font-medium text-ink-900">{t.name}</Td>
                      <Td className="text-right text-ink-500">{t.qty}</Td>
                      <Td className="text-right font-semibold">{fmtMoney(t.revenue, currency)}</Td>
                      <Td className="text-right text-emerald-700">{fmtMoney(t.profit, currency)}</Td>
                      <Td className="text-right text-ink-500">{t.revenue > 0 ? Math.round((t.profit / t.revenue) * 100) : 0}%</Td>
                    </tr>
                  ))}
                  {top.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-sm text-ink-400">
                        No product sales in this period.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}

      {/* ============================ Category ============================ */}
      {tab === "category" ? (
        canCategory ? (
          <Card>
            <CardHeader
              title="Category performance"
              subtitle={`Sales, profit, margin and stock value per category · ${m.rangeText}`}
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    downloadCSV("category-performance.csv", [
                      ["Category", "Revenue", "Cost", "Profit", "Margin %", "Units", "Orders", "Stock value"],
                      ...catRows.map((x) => [x.label, x.revenue, x.cost, x.profit, x.margin, x.units, x.orders, x.stockValue]),
                    ])
                  }
                >
                  <IcDownload size={13} /> CSV
                </Button>
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-ink-100 bg-ink-50/50">
                  <tr>
                    <Th>Category</Th>
                    <Th className="text-right">Revenue</Th>
                    <Th className="text-right">Profit</Th>
                    <Th className="text-right">Margin</Th>
                    <Th className="text-right">Units</Th>
                    <Th className="text-right">Orders</Th>
                    <Th className="text-right">Stock value</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {catRows.map((row) => (
                    <tr key={row.id} className="hover:bg-ink-50/60">
                      <Td>
                        <span className="mr-1.5">{row.icon}</span>
                        <span className="font-medium text-ink-900">{row.label}</span>
                      </Td>
                      <Td className="text-right font-semibold">{fmtMoney(row.revenue, currency)}</Td>
                      <Td className={`text-right ${row.profit >= 0 ? "text-emerald-700" : "text-red-600"}`}>{fmtMoney(row.profit, currency)}</Td>
                      <Td className="text-right text-ink-500">{row.margin}%</Td>
                      <Td className="text-right text-ink-500">{row.units}</Td>
                      <Td className="text-right text-ink-500">{row.orders}</Td>
                      <Td className="text-right text-ink-500">{fmtMoney(row.stockValue, currency)}</Td>
                    </tr>
                  ))}
                  {catRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-sm text-ink-400">
                        No category activity in this period.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <div className="py-8">
            <LockedCard feature="categories_report" title="Category reports are a Pro feature" onBilling={() => navigate("billing")} />
          </div>
        )
      ) : null}

      {/* ============================ Expenses ============================ */}
      {tab === "expenses" ? (
        <>
          <Card>
            <CardHeader title="Expense summary" subtitle={`Period: ${m.rangeText}`} />
            <div className="grid gap-px bg-ink-100 sm:grid-cols-4">
              {[
                ["Total expenses", fmtMoney(m.expensesTotal, currency), "text-ink-900"],
                ["Entries", `${m.expensesCount}`, "text-ink-900"],
                ["Avg per entry", fmtMoney(m.expensesCount ? m.expensesTotal / m.expensesCount : 0, currency), "text-ink-900"],
                ["% of revenue", `${expenseRatio}%`, expenseRatio > 30 ? "text-red-600" : "text-emerald-700"],
              ].map(([label, value, tone]) => (
                <div key={label} className="bg-white px-5 py-4">
                  <p className="text-xs text-ink-400">{label}</p>
                  <p className={`mt-0.5 text-lg font-bold ${tone}`}>{value}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-ink-100 px-5 py-4">
              <div className="flex flex-wrap gap-2">
                <DeltaBadge delta={expDelta} invert />
                {topExpense ? <Badge tone="neutral">Biggest: {topExpense.category} {fmtMoney(topExpense.value, currency)}</Badge> : null}
                <Badge tone={grossMargin >= 0 ? "neutral" : "red"}>
                  Gross margin {grossMargin}%
                </Badge>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Expenses by category" subtitle="Where the money went in this period" />
            <div className="px-5 py-4">
              {exp.length ? (
                <BarChartH data={exp.map((e) => ({ label: e.category, value: e.value }))} formatValue={(v) => fmtMoney(v, currency)} />
              ) : (
                <p className="py-8 text-center text-sm text-ink-400">No expenses recorded in this period.</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Expense log"
              subtitle="Every expense entry in this period, newest first"
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    downloadCSV("expenses.csv", [
                      ["Date", "Category", "Description", "Amount"],
                      ...logRows.map((e) => [new Date(e.at).toLocaleString("en-US"), e.category, e.description, e.amount]),
                    ])
                  }
                >
                  <IcDownload size={13} /> CSV
                </Button>
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-ink-100 bg-ink-50/50">
                  <tr>
                    <Th>Date</Th>
                    <Th>Category</Th>
                    <Th>Description</Th>
                    <Th className="text-right">Amount</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {logRows.map((e) => (
                    <tr key={e.id} className="hover:bg-ink-50/60">
                      <Td className="whitespace-nowrap text-ink-500">{new Date(e.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</Td>
                      <Td><Badge tone="neutral">{e.category}</Badge></Td>
                      <Td className="font-medium text-ink-900">{e.description}</Td>
                      <Td className="text-right font-semibold text-red-600">{fmtMoney(e.amount, currency)}</Td>
                    </tr>
                  ))}
                  {logRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-12 text-center text-sm text-ink-400">
                        No expenses in this period.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
