import { useState } from "react";
import { LANGUAGES, langInfo } from "./lib/i18n";
import { useApp } from "./App";
import { IcCheck } from "./icons";

/*
 * Language switcher — globe pill + rich dropdown.
 *
 * - Lists the 4 supported languages with their native names first
 *   (English, বাংলা, हिन्दी, العربية) and English subtitles.
 * - Arabic rows carry an RTL badge; the active language gets a check.
 * - `placement` flips the panel (sidebar needs it to open upward,
 *   the login page downward to the right).
 */

export function LanguageMenu({
  variant,
  placement,
}: {
  /** dark = compact pill, dark-row = full-width sidebar row, light = on white pages */
  variant: "dark" | "dark-row" | "light";
  placement: "top-left" | "bottom-right" | "top-right";
}) {
  const { lang, setLang, t } = useApp();
  const [open, setOpen] = useState(false);
  const active = langInfo(lang);

  const panelPos =
    placement === "top-left"
      ? "bottom-full mb-2 left-0 origin-bottom-left"
      : placement === "top-right"
        ? "bottom-full mb-2 right-0 origin-bottom-right"
        : "top-full mt-2 right-0 origin-top-right";

  const triggerClass =
    variant === "dark"
      ? "flex h-8 items-center gap-1.5 rounded-lg bg-white/10 px-2 text-xs font-semibold text-white transition hover:bg-white/20"
      : variant === "dark-row"
        ? `flex h-11 w-full items-center gap-2.5 rounded-lg px-2 text-left transition hover:bg-white/10 ${open ? "bg-white/10" : ""}`
        : "flex h-9 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2.5 text-xs font-semibold text-ink-700 shadow-sm transition hover:bg-ink-50";

  return (
    <div className={variant === "dark-row" ? "relative w-full" : "relative"}>
      {open ? (
        <div
          className="fixed inset-0 z-40 cursor-default"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      ) : null}

      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={t("common.language")}
        aria-expanded={open}
        className={triggerClass}
      >
        {variant === "dark-row" ? (
          <>
            <span
              aria-hidden
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/10 text-[10px] font-bold uppercase tracking-wide text-white/80 ring-1 ring-white/15"
            >
              {active.code}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[9px] font-bold uppercase tracking-[0.12em] text-white/40">
                {t("common.language")}
              </span>
              <span className="block truncate text-[13px] font-semibold leading-tight text-white">
                {active.native}
              </span>
            </span>
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className={`shrink-0 text-white/45 transition-transform ${open ? "rotate-180" : ""}`}
            >
              <path d="m6 15 6-6 6 6" />
            </svg>
          </>
        ) : (
          <>
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="shrink-0"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
            </svg>
            <span>{active.native}</span>
          </>
        )}
      </button>

      {/* Panel */}
      {open ? (
        <div
          className={`absolute z-50 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-pop pop-in ${
            variant === "dark-row" ? "w-full" : "w-60"
          } ${panelPos}`}
          role="menu"
        >
          <p className="border-b border-ink-100 bg-ink-50/70 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-ink-400">
            {t("common.language")}
          </p>
          {LANGUAGES.map((l) => {
            const isActive = l.code === lang;
            return (
              <button
                key={l.code}
                onClick={() => {
                  setLang(l.code);
                  setOpen(false);
                }}
                role="menuitem"
                className={
                  isActive
                    ? "flex w-full items-center gap-2.5 bg-brand-50 px-2.5 py-2 text-left"
                    : "flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition hover:bg-ink-50"
                }
              >
                <span
                  aria-hidden
                  className={`flex h-7 w-9 shrink-0 items-center justify-center rounded-md text-[10px] font-bold uppercase tracking-wide ${
                    isActive ? "bg-brand-100 text-brand-700" : "bg-ink-100 text-ink-500"
                  }`}
                >
                  {l.code}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm font-semibold ${isActive ? "text-brand-700" : "text-ink-800"}`}>
                    {l.native}
                  </span>
                  <span className="block text-[11px] text-ink-400">{l.english}</span>
                </span>
                {l.dir === "rtl" ? (
                  <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-violet-700">
                    RTL
                  </span>
                ) : null}
                {isActive ? <IcCheck size={15} className="shrink-0 text-brand-600" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
