import { useMemo, useState } from "react";
import { useApp } from "../App";
import type { Expense, ExpenseCategory } from "../types";
import { addExpense } from "../lib/store";
import { softDelete } from "../lib/recycle";
import { logAudit } from "../lib/audit";
import { fmtMoney, fmtDate, uid, downloadCSV } from "../lib/helpers";
import {
  PERIODS,
  periodRange,
  periodMetrics,
  periodName,
  expenseBreakdownInRange,
  inRange,
  type PeriodKey,
} from "../lib/period";
import { Badge, Button, Card, CardHeader, Field, Modal, NumberInput, Segmented, Select, TextInput, useToast, Th, Td, EmptyState } from "../ui";
import { IcPlus, IcTrash, IcDownload, IcWallet } from "../icons";

const CATEGORIES: ExpenseCategory[] = ["Rent", "Utilities", "Salaries", "Transport", "Marketing", "Supplies", "Maintenance", "Other"];

const TONES: Record<ExpenseCategory, "green" | "red" | "amber" | "blue" | "violet" | "neutral"> = {
  Rent: "violet", Utilities: "blue", Salaries: "green", Transport: "amber",
  Marketing: "red", Supplies: "neutral", Maintenance: "amber", Other: "neutral",
};

export default function ExpensesPage() {
  const { db, update, currency, t } = useApp();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState("All");
  const [period, setPeriod] = useState<PeriodKey>("monthly");

  const r = useMemo(() => periodRange(period), [period]);
  const m = useMemo(() => periodMetrics(db, period), [db, period]);

  const inPeriod = useMemo(
    () => db.expenses.filter((e) => inRange(e.at, r.start, r.end)),
    [db.expenses, r.start, r.end]
  );
  const sorted = useMemo(() => [...inPeriod].sort((a, b) => (a.at < b.at ? 1 : -1)), [inPeriod]);
  const filtered = sorted.filter((e) => category === "All" || e.category === category);

  const breakdown = useMemo(() => expenseBreakdownInRange(db, r.start, r.end), [db, r.start, r.end]);

  const pctDelta = (cur: number, prev: number | undefined) =>
    prev && prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;
  const expDelta = m.prev ? pctDelta(m.expensesTotal, m.prev.expensesTotal) : null;

  const exportCSV = () => {
    downloadCSV(`expenses-${period}.csv`, [
      ["Expenses", m.rangeText, category === "All" ? "All categories" : category],
      [],
      ["Date", "Category", "Description", "Amount"],
      ...filtered.map((e) => [e.at.slice(0, 10), e.category, e.description, e.amount]),
      [],
      ["Total", filtered.reduce((s, e) => s + e.amount, 0)],
    ]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Expenses</h1>
          <p className="text-sm text-ink-500">
            {fmtMoney(m.expensesTotal, currency)} {periodName(period)} · {m.expensesCount} {m.expensesCount === 1 ? "entry" : "entries"} · {m.rangeText}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            options={PERIODS.map((p) => ({ value: p.value, label: t(p.labelKey) }))}
            value={period}
            onChange={(v) => setPeriod(v as PeriodKey)}
          />
          <Button variant="secondary" onClick={exportCSV}><IcDownload size={15} /> Export</Button>
          <Button onClick={() => setAdding(true)}><IcPlus size={16} /> Add expense</Button>
        </div>
      </div>

      {/* Period summary tiles */}
      <Card>
        <div className="grid gap-px bg-ink-100 sm:grid-cols-4">
          {[
            ["Total expenses", fmtMoney(m.expensesTotal, currency), "text-ink-900"],
            ["Entries", `${m.expensesCount}`, "text-ink-900"],
            ["Avg per entry", fmtMoney(m.expensesCount ? m.expensesTotal / m.expensesCount : 0, currency), "text-ink-900"],
            ["% of revenue", `${m.salesTotal > 0 ? Math.round((m.expensesTotal / m.salesTotal) * 100) : 0}%`, "text-ink-900"],
          ].map(([label, value, tone]) => (
            <div key={label} className="bg-white px-5 py-4">
              <p className="text-xs text-ink-400">{label}</p>
              <p className={`mt-0.5 text-lg font-bold ${tone}`}>{value}</p>
            </div>
          ))}
        </div>
        {expDelta !== null ? (
          <div className="border-t border-ink-100 px-5 py-3">
            <Badge tone={expDelta <= 0 ? "green" : "red"}>
              {expDelta >= 0 ? "▲" : "▼"} {Math.abs(expDelta)}% expenses vs previous {period === "all" ? "period" : periodName(period)}
            </Badge>
          </div>
        ) : null}
      </Card>

      <div className="grid gap-3.5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Expense history"
            subtitle={`Filtered to ${periodName(period)}${category === "All" ? "" : ` · ${category}`}`}
            action={
              <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-40">
                <option value="All">All categories</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            }
          />
          {filtered.length === 0 ? (
            <EmptyState icon={<IcWallet size={20} />} title={`No expenses ${periodName(period)}`} subtitle="Track rent, utilities, salaries and daily overheads to see true profit." />
          ) : (
            <div className="max-h-[480px] overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 border-b border-ink-100 bg-ink-50/90 backdrop-blur">
                  <tr><Th>Date</Th><Th>Category</Th><Th>Description</Th><Th className="text-right">Amount</Th><Th /></tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {filtered.map((e) => (
                    <tr key={e.id} className="hover:bg-ink-50/60">
                      <Td className="text-ink-500">{fmtDate(e.at)}</Td>
                      <Td><Badge tone={TONES[e.category]}>{e.category}</Badge></Td>
                      <Td className="max-w-[280px] truncate">{e.description}</Td>
                      <Td className="text-right font-semibold text-ink-900">{fmtMoney(e.amount, currency)}</Td>
                      <Td className="text-right">
                        <button
                          className="text-ink-300 hover:text-red-500"
                          title="Delete expense"
                          onClick={() => { update((d) => { const next = softDelete(d, "expense", e.id, d.settings.ownerName); return { ...next, audit: logAudit(next.audit, "delete", "Expense", e.category, "Moved to recycle bin") }; }); toast("Moved to recycle bin — restore within 30 days", "info"); }}
                        >
                          <IcTrash size={14} />
                        </button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-3.5">
          <Card>
            <CardHeader title={`By category · ${periodName(period)}`} />
            <div className="space-y-3 px-5 py-4">
              {breakdown.map((b) => (
                <div key={b.category}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-medium text-ink-700">{b.category}</span>
                    <span className="text-ink-500">{fmtMoney(b.value, currency)}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${(b.value / Math.max(...breakdown.map((x) => x.value), 1)) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
              {breakdown.length === 0 ? <p className="text-sm text-ink-400">No expenses {periodName(period)}.</p> : null}
            </div>
          </Card>

          <Card className="p-5">
            <p className="text-xs font-medium text-ink-500">{period === "all" ? "All-time overhead" : `${periodLabel(period)} overhead`}</p>
            <p className="mt-1 text-2xl font-bold text-ink-900">{fmtMoney(m.expensesTotal, currency)}</p>
            <p className="mt-1 text-xs text-ink-400">Included automatically in net profit on Reports.</p>
          </Card>
        </div>
      </div>

      <AddExpenseModal open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function periodLabel(key: PeriodKey): string {
  return key === "all" ? "All-time" : periodName(key).replace(/^\w/, (c) => c.toUpperCase());
}

function AddExpenseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, update } = useApp();
  const toast = useToast();
  const [category, setCategory] = useState<ExpenseCategory>("Supplies");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const save = () => {
    const expense: Expense = {
      id: uid("e"),
      at: new Date(`${date}T12:00:00`).toISOString(),
      category,
      description: description.trim() || category,
      amount: Math.round(amount * 100) / 100,
    };
    update((d) => addExpense(d, expense));
    toast("Expense recorded");
    setDescription("");
    setAmount(0);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add expense"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={amount <= 0} onClick={save}>Save expense</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <Select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Amount">
            <NumberInput value={amount} min={0} step="0.01" onChange={(e) => setAmount(Number(e.target.value) || 0)} />
          </Field>
        </div>
        <Field label="Description">
          <TextInput value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Electricity bill" />
        </Field>
        <Field label="Date">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
