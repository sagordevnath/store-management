import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { classNames } from "./lib/helpers";
import { buildTree, UNCATEGORIZED_ID } from "./lib/categories";
import type { DB } from "./types";
import { minimumTierForFeature, type FeatureKey } from "./lib/plans";

/* ---------------- Buttons ---------------- */

export function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 disabled:opacity-50 disabled:cursor-not-allowed";
  const sizes = {
    sm: "h-8 px-3 text-xs",
    md: "h-10 px-4 text-sm",
    lg: "h-11 px-5 text-sm",
  };
  const variants = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
    secondary: "bg-white text-ink-700 border border-ink-200 hover:bg-ink-50",
    ghost: "text-ink-600 hover:bg-ink-100",
    danger: "bg-red-600 text-white hover:bg-red-700",
    success: "bg-emerald-600 text-white hover:bg-emerald-700",
  };
  return (
    <button className={classNames(base, sizes[size], variants[variant], className)} {...rest}>
      {children}
    </button>
  );
}

/* ---------------- Inputs ---------------- */

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-ink-400">{hint}</span> : null}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 placeholder-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={classNames(inputCls, props.className)} />;
}

export function NumberInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input type="number" {...props} className={classNames(inputCls, props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={classNames(inputCls, "pr-8", props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={classNames(inputCls, props.className)} />;
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={classNames(
        "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
        checked ? "border-brand-300 bg-brand-50" : "border-ink-200 bg-white hover:bg-ink-50",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span className="min-w-0">
        <span className={"block text-sm font-medium " + (checked ? "text-brand-800" : "text-ink-700")}>{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-ink-400">{hint}</span> : null}
      </span>
      <span
        className={classNames(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-brand-600" : "bg-ink-300",
        )}
      >
        <span
          className={classNames(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
            checked ? "left-[18px]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

/* ---------------- Badges ---------------- */

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "green" | "red" | "amber" | "blue" | "violet";
}) {
  const tones = {
    neutral: "bg-ink-100 text-ink-600",
    green: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60",
    red: "bg-red-50 text-red-700 ring-1 ring-red-200/60",
    amber: "bg-amber-50 text-amber-700 ring-1 ring-amber-200/60",
    blue: "bg-blue-50 text-blue-700 ring-1 ring-blue-200/60",
    violet: "bg-violet-50 text-violet-700 ring-1 ring-violet-200/60",
  };
  return (
    <span className={classNames("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
}

/* ---------------- Card ---------------- */

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={classNames("rounded-xl border border-ink-200/80 bg-white shadow-card", className)}>{children}</div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
      <div>
        <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-xs text-ink-500">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

/* ---------------- Modal ---------------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <div className="fixed inset-0 bg-ink-950/45 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={classNames(
          "relative z-10 w-full rounded-2xl bg-white shadow-pop",
          wide ? "max-w-3xl" : "max-w-md"
        )}
      >
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <h2 className="text-base font-semibold text-ink-900">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-600"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="border-t border-ink-100 px-5 py-3.5">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ---------------- Toasts ---------------- */

type Toast = { id: number; message: string; tone: "success" | "error" | "info" };
const ToastCtx = createContext<(msg: string, tone?: Toast["tone"]) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const push = useCallback((message: string, tone: Toast["tone"] = "success") => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, message, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={classNames(
              "pointer-events-auto rounded-xl px-4 py-3 text-sm font-medium shadow-pop animate-[toast_.25s_ease-out]",
              t.tone === "success" && "bg-ink-900 text-white",
              t.tone === "error" && "bg-red-600 text-white",
              t.tone === "info" && "bg-white text-ink-800 ring-1 ring-ink-200"
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}

/* ---------------- Empty state ---------------- */

export function EmptyState({ icon, title, subtitle }: { icon?: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-ink-100 text-ink-400">
        {icon ?? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 7h16M4 12h10M4 17h7" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <p className="text-sm font-semibold text-ink-700">{title}</p>
      {subtitle ? <p className="mt-1 max-w-sm text-xs text-ink-500">{subtitle}</p> : null}
    </div>
  );
}

/* ---------------- Charts (hand-rolled SVG) ---------------- */

export function AreaChart({
  data,
  height = 220,
  color = "#1f6a4c",
  formatY,
}: {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
  formatY?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 720;
  const h = height;
  const pad = { l: 44, r: 12, t: 12, b: 26 };
  const max = Math.max(...data.map((d) => d.value), 1);
  const stepX = (w - pad.l - pad.r) / Math.max(data.length - 1, 1);
  const scaleY = (v: number) => pad.t + (1 - v / max) * (h - pad.t - pad.b);

  const pts = data.map((d, i) => [pad.l + i * stepX, scaleY(d.value)] as const);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${(pad.l + (data.length - 1) * stepX).toFixed(1)},${h - pad.b} L${pad.l},${h - pad.b} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }}>
        <defs>
          <linearGradient id={`ag-${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {ticks.map((t, i) => {
          const y = scaleY(t);
          return (
            <g key={i}>
              <line x1={pad.l} x2={w - pad.r} y1={y} y2={y} stroke="#eceef2" strokeWidth="1" />
              <text x={pad.l - 6} y={y + 3.5} textAnchor="end" fontSize="10" fill="#8493a9">
                {formatY ? formatY(t) : Math.round(t)}
              </text>
            </g>
          );
        })}
        <path d={area} fill={`url(#ag-${color.slice(1)})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <circle
            key={i}
            cx={p[0]}
            cy={p[1]}
            r={hover === i ? 4.5 : 0}
            fill="#fff"
            stroke={color}
            strokeWidth="2"
          />
        ))}
        {data.map((d, i) => (
          <rect
            key={i}
            x={pad.l + i * stepX - stepX / 2}
            y={0}
            width={stepX}
            height={h}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        {data.map((d, i) =>
          i % Math.ceil(data.length / 8) === 0 || i === data.length - 1 ? (
            <text key={i} x={pad.l + i * stepX} y={h - 8} textAnchor="middle" fontSize="10" fill="#8493a9">
              {d.label}
            </text>
          ) : null
        )}
        {hover !== null ? (
          <g>
            <line
              x1={pts[hover]![0]}
              x2={pts[hover]![0]}
              y1={pad.t}
              y2={h - pad.b}
              stroke={color}
              strokeDasharray="3 3"
              opacity="0.4"
            />
            <g transform={`translate(${Math.min(Math.max(pts[hover]![0], 60), w - 70)},${Math.max(pts[hover]![1] - 12, 24)})`}>
              <rect x={-56} y={-18} width={112} height={26} rx={6} fill="#1a1e26" opacity={0.92} />
              <text x={0} y={-1} textAnchor="middle" fontSize="10.5" fill="#fff" fontWeight="600">
                {data[hover]!.label}: {formatY ? formatY(data[hover]!.value) : data[hover]!.value}
              </text>
            </g>
          </g>
        ) : null}
      </svg>
    </div>
  );
}

export function BarChartH({
  data,
  formatValue,
}: {
  data: { label: string; value: number }[];
  formatValue?: (v: number) => string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const palette = ["#1f6a4c", "#2e8560", "#52a17b", "#84bfa0", "#b4d9c3", "#d9ecdf", "#0a2119", "#414c5f"];
  return (
    <div className="space-y-3">
      {data.map((d, i) => (
        <div key={d.label}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-medium text-ink-700">{d.label}</span>
            <span className="text-ink-500">{formatValue ? formatValue(d.value) : d.value}</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-ink-100">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.max((d.value / max) * 100, 2)}%`, backgroundColor: palette[i % palette.length] }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DonutChart({ data, size = 168 }: { data: { label: string; value: number }[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const colors = ["#1f6a4c", "#2e8560", "#52a17b", "#84bfa0", "#b4d9c3", "#414c5f", "#8493a9", "#d9ecdf"];
  const r = 60;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="flex items-center gap-6">
      <svg width={size} height={size} viewBox="0 0 160 160">
        <g transform="translate(80,80) rotate(-90)">
          {data.map((d, i) => {
            const frac = d.value / total;
            const dash = `${frac * c} ${c}`;
            const el = (
              <circle
                key={i}
                r={r}
                fill="none"
                stroke={colors[i % colors.length]}
                strokeWidth="26"
                strokeDasharray={dash}
                strokeDashoffset={-acc * c}
              />
            );
            acc += frac;
            return el;
          })}
        </g>
        <text x="80" y="76" textAnchor="middle" fontSize="18" fontWeight="700" fill="#1a1e26">
          {total >= 1000 ? `${(total / 1000).toFixed(1)}K` : total.toFixed(0)}
        </text>
        <text x="80" y="92" textAnchor="middle" fontSize="9" fill="#8493a9">
          TOTAL
        </text>
      </svg>
      <div className="min-w-0 flex-1 space-y-2">
        {data.map((d, i) => (
          <div key={d.label} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors[i % colors.length] }} />
              <span className="truncate font-medium text-ink-700">{d.label}</span>
            </span>
            <span className="shrink-0 text-ink-500">{Math.round((d.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Tabs ---------------- */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-ink-200 bg-ink-50 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={classNames(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            value === o.value ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-700"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Table shell ---------------- */

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={classNames("whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-ink-500", className)}>
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={classNames("whitespace-nowrap px-4 py-3 text-sm text-ink-700", className)}>{children}</td>;
}

/* ============================ Phase 2 ============================ */

/* ---------------- Dark mode ---------------- */

const THEME_KEY = "Managix_theme";

export function useDarkMode(): [boolean, () => void] {
  const [dark, setDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem(THEME_KEY) === "dark";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
    } catch {
      /* ignore */
    }
  }, [dark]);
  return [dark, useCallback(() => setDark((d) => !d), [])];
}

/* ---------------- Locked module card ---------------- */

export function LockedCard({
  feature,
  title,
  description,
  onBilling,
}: {
  feature: FeatureKey;
  title?: string;
  description?: string;
  onBilling?: () => void;
}) {
  const tier = minimumTierForFeature(feature);
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-ink-300 bg-white px-8 py-12 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-100 text-2xl">🔒</div>
      <h3 className="text-base font-semibold text-ink-900">{title ?? "This module is locked"}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-ink-500">
        {description ?? "Upgrade your plan to unlock this feature and get the most out of Managix."}
      </p>
      <div className="mt-5 flex items-center justify-center gap-3">
        <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-200">
          {tier.charAt(0).toUpperCase() + tier.slice(1)} plan required
        </span>
        {onBilling ? (
          <Button variant="primary" size="sm" onClick={onBilling}>
            Go to Billing
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------- Category filter chips ---------------- */

export function CategoryChips({
  db,
  value,
  onChange,
}: {
  db: DB;
  value: string | null; // null = all
  onChange: (id: string | null) => void;
}) {
  const rows = useMemo(() => buildTree(db), [db]);
  const roots = rows.filter((r) => r.depth === 0);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        onClick={() => onChange(null)}
        className={classNames(
          "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
          value === null ? "bg-brand-600 text-white shadow-sm" : "bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50",
        )}
      >
        All
      </button>
      {roots.map((r) => (
        <button
          key={r.id}
          onClick={() => onChange(r.id)}
          title={r.id === UNCATEGORIZED_ID ? "Products without a category" : `${r.productCount} products incl. sub-categories`}
          className={classNames(
            "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            value === r.id ? "bg-brand-600 text-white shadow-sm" : "bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50",
          )}
        >
          <span className="mr-1">{r.icon}</span>
          {r.name}
          <span className={classNames("ml-1.5", value === r.id ? "text-white/70" : "text-ink-400")}>{r.productCount}</span>
        </button>
      ))}
    </div>
  );
}

/* ---------------- E-signature pad ---------------- */

export function SignPad({
  onChange,
  height = 150,
}: {
  onChange: (dataUrl: string | null) => void;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [dirty, setDirty] = useState(false);

  const ctx = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const c = canvas.getContext("2d");
    if (!c) return null;
    c.lineWidth = 2.2;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.strokeStyle = "#1a1e26";
    return c as CanvasRenderingContext2D;
  };

  const posOf = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const toDataUrl = () => {
    const canvas = canvasRef.current;
    return canvas ? canvas.toDataURL("image/png") : null;
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={520}
        height={height}
        className="w-full touch-none rounded-lg border border-dashed border-ink-300 bg-ink-50"
        style={{ height }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          last.current = posOf(e);
          setDirty(true);
        }}
        onPointerMove={(e) => {
          if (!drawing.current || !last.current) return;
          const c = ctx();
          const p = posOf(e);
          if (c) {
            c.beginPath();
            c.moveTo(last.current.x, last.current.y);
            c.lineTo(p.x, p.y);
            c.stroke();
          }
          last.current = p;
        }}
        onPointerUp={() => {
          if (drawing.current) onChange(toDataUrl());
          drawing.current = false;
          last.current = null;
        }}
        onPointerLeave={() => {
          if (drawing.current) onChange(toDataUrl());
          drawing.current = false;
          last.current = null;
        }}
      />
      <div className="mt-1 flex items-center justify-between text-xs text-ink-400">
        <span>Draw the signature above</span>
        <button
          className="font-medium text-ink-500 hover:text-ink-700"
          onClick={() => {
            const canvas = canvasRef.current;
            const c = ctx();
            if (canvas && c) c.clearRect(0, 0, canvas.width, canvas.height);
            setDirty(false);
            onChange(null);
          }}
        >
          Clear
        </button>
      </div>
      {!dirty ? <span className="sr-only">Signature pad empty</span> : null}
    </div>
  );
}

/* ---------------- Voice input (Web Speech API) ---------------- */

export function VoiceButton({
  lang,
  onText,
  onError,
}: {
  lang: "en-US" | "bn-BD";
  onText: (text: string) => void;
  onError?: (msg: string) => void;
}) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);

  const supported = typeof window !== "undefined" && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const start = () => {
    if (!supported) {
      onError?.("Voice input is not supported in this browser.");
      return;
    }
    try {
      const Rec = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
      const rec = new Rec();
      recRef.current = rec;
      rec.lang = lang;
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (e: any) => {
        const t = e.results?.[0]?.[0]?.transcript ?? "";
        if (t) onText(t);
      };
      rec.onend = () => setListening(false);
      rec.onerror = (e: any) => {
        setListening(false);
        onError?.(e?.error === "not-allowed" ? "Microphone permission denied." : "Voice input failed. Try again.");
      };
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
      onError?.("Voice input failed to start.");
    }
  };

  const stop = () => {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  };

  return (
    <button
      type="button"
      onClick={listening ? stop : start}
      title={listening ? "Stop listening" : "Voice input"}
      className={classNames(
        "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors",
        listening ? "bg-red-600 text-white animate-pulse" : "bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50",
      )}
    >
      🎤 {listening ? "Listening…" : "Voice"}
    </button>
  );
}
