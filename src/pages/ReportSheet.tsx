import { useMemo } from "react";
import { useApp } from "../App";
import { PERIODS, periodMetrics, periodRange, revenueSeries, categorySalesInRange, expenseBreakdownInRange, periodNameKey } from "../lib/period";
import type { PeriodKey } from "../lib/period";
import { fmtMoney, fmtDate } from "../lib/helpers";
import { printIsolated } from "../lib/print";
import { Button, Modal, Segmented } from "../ui";
import { IcPrint } from "../icons";
import { useState } from "react";

/**
 * One-click printable report (A4): branded header, P&L, top categories and
 * expense split for the selected period. Print → "Save as PDF" to share.
 */
export function ReportSheet({ onClose }: { onClose: () => void }) {
  const { db, currency, t } = useApp();
  const [period, setPeriod] = useState<PeriodKey>("monthly");

  const m = useMemo(() => periodMetrics(db, period), [db, period]);
  const r = useMemo(() => periodRange(period), [period]);
  const series = useMemo(() => revenueSeries(db, period), [db, period]);
  const catSales = useMemo(() => categorySalesInRange(db, r.start, r.end), [db, r.start, r.end]);
  const exp = useMemo(() => expenseBreakdownInRange(db, r.start, r.end), [db, r.start, r.end]);

  const grossProfit = m.salesTotal - m.costTotal;
  const netProfit = grossProfit - m.expensesTotal;
  const bestDay = [...series].sort((a, b) => b.value - a.value)[0];

  const Stat = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
    <div className="flex items-center justify-between border-b border-ink-100 py-2 text-sm">
      <span className="text-ink-600">{label}</span>
      <span className={strong ? "font-bold text-ink-900" : "font-medium text-ink-800"}>{value}</span>
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title="Export report (PDF)"
      wide
      footer={
        <div className="flex items-center justify-between">
          <Segmented
            options={PERIODS.map((p) => ({ value: p.value, label: t(p.labelKey) }))}
            value={period}
            onChange={(v) => setPeriod(v as PeriodKey)}
          />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Close</Button>
            <Button onClick={() => printIsolated("report-sheet-print", "report-printing")}><IcPrint size={15} /> Print / Save PDF</Button>
          </div>
        </div>
      }
    >
      {/* A4 sheet preview */}
      <div id="report-sheet-print" className="mx-auto rounded-xl bg-white p-8 text-ink-900 shadow-card" style={{ width: 620, minHeight: 760 }}>
        {/* Masthead */}
        <div className="flex items-start justify-between border-b-2 pb-4" style={{ borderColor: "#1f6a4c" }}>
          <div className="flex items-center gap-3">
            {db.settings.logo ? (
              <img src={db.settings.logo} alt="" className="h-12 w-12 rounded-lg object-cover" />
            ) : null}
            <div>
              <p className="text-lg font-extrabold">{db.settings.shopName}</p>
              <p className="text-xs text-ink-500">{db.settings.address}{db.settings.phone ? ` · ${db.settings.phone}` : ""}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-widest text-ink-400">Business report</p>
            <p className="text-sm font-bold" style={{ color: "#1f6a4c" }}>{t(periodNameKey(period))}</p>
            <p className="text-[11px] text-ink-400">Generated {fmtDate(new Date().toISOString())}</p>
          </div>
        </div>

        {/* P&L summary */}
        <h3 className="mt-5 text-xs font-bold uppercase tracking-widest text-ink-400">Profit & Loss</h3>
        <div className="mt-1">
          <Stat label="Revenue" value={fmtMoney(m.salesTotal, currency)} />
          <Stat label="Cost of goods sold" value={`− ${fmtMoney(m.costTotal, currency)}`} />
          <Stat label="Gross profit" value={fmtMoney(grossProfit, currency)} strong />
          <Stat label="Total expenses" value={`− ${fmtMoney(m.expensesTotal, currency)}`} />
          <Stat label="Net profit" value={fmtMoney(netProfit, currency)} strong />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            ["Invoices", String(m.salesCount)],
            ["Best day", bestDay && bestDay.value > 0 ? `${bestDay.label} · ${fmtMoney(bestDay.value, currency)}` : "—"],
            ["Net margin", m.salesTotal > 0 ? `${Math.round((netProfit / m.salesTotal) * 100)}%` : "—"],
          ].map(([l, v]) => (
            <div key={l} className="rounded-lg px-3 py-2" style={{ backgroundColor: "#f0f7f3" }}>
              <p className="text-[10px] font-bold uppercase tracking-wide text-ink-500">{l}</p>
              <p className="text-sm font-bold">{v}</p>
            </div>
          ))}
        </div>

        {/* Category sales */}
        <h3 className="mt-5 text-xs font-bold uppercase tracking-widest text-ink-400">Sales by category</h3>
        {catSales.length === 0 ? (
          <p className="py-2 text-xs text-ink-400">No sales this period.</p>
        ) : (
          <table className="mt-1 w-full text-sm">
            <tbody>
              {catSales.slice(0, 6).map((c) => {
                const pct = m.salesTotal > 0 ? Math.round((c.value / m.salesTotal) * 100) : 0;
                return (
                  <tr key={c.category}>
                    <td className="py-1.5 pr-2 text-ink-700">{c.category}</td>
                    <td className="w-1/2">
                      <div className="h-2 rounded-full bg-ink-100">
                        <div className="h-2 rounded-full" style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: "#1f6a4c" }} />
                      </div>
                    </td>
                    <td className="whitespace-nowrap pl-2 text-right font-medium">{fmtMoney(c.value, currency)} · {pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Expenses */}
        <h3 className="mt-5 text-xs font-bold uppercase tracking-widest text-ink-400">Expenses</h3>
        {exp.length === 0 ? (
          <p className="py-2 text-xs text-ink-400">No expenses this period.</p>
        ) : (
          <table className="mt-1 w-full text-sm">
            <tbody>
              {exp.map((e) => (
                <tr key={e.category}>
                  <td className="py-1.5 text-ink-700">{e.category}</td>
                  <td className="text-right font-medium">{fmtMoney(e.value, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="mt-8 border-t border-ink-100 pt-3 text-center text-[10px] text-ink-400">
          {db.settings.invoiceNote || `Prepared with Managix — ${db.settings.shopName}`}
        </p>
      </div>
    </Modal>
  );
}
