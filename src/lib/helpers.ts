import { activeLang, activeLocale, localizeDigits } from "./i18n";

let n = 0;
export function uid(prefix = "id"): string {
  n += 1;
  return `${prefix}_${Date.now().toString(36)}_${n}_${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

export const round2 = (x: number) => Math.round(x * 100) / 100;

export function fmtMoney(value: number, symbol = "$"): string {
  const neg = value < 0;
  const v = Math.abs(value);
  const s = v.toLocaleString(activeLocale(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${neg ? "-" : ""}${symbol}${s}`;
}

export function fmtCompact(value: number, symbol = "$"): string {
  const abs = Math.abs(value);
  if (activeLang() === "bn") {
    if (abs >= 10_000_000) return `${symbol}${localizeDigits((value / 10_000_000).toFixed(1))} কোটি`;
    if (abs >= 100_000) return `${symbol}${localizeDigits((value / 100_000).toFixed(1))} লাখ`;
    if (abs >= 1_000) return `${symbol}${localizeDigits((value / 1_000).toFixed(1))} হাজার`;
  }
  if (abs >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${symbol}${(value / 1_000).toFixed(1)}K`;
  return fmtMoney(value, symbol);
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(activeLocale(), {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(activeLocale(), {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function dayKey(iso: string): string {
  const d = new Date(iso);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function daysAgoISO(n: number, hour = 10): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, Math.floor(Math.random() * 55), 0, 0);
  return d.toISOString();
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function csvEscape(v: string | number): string {
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadCSV(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function classNames(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}
