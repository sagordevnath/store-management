import { useEffect, useRef, useState } from "react";
import { classNames } from "../lib/helpers";

interface Msg {
  id: number;
  from: "you" | "support";
  text: string;
  at: string;
}

const CANNED = [
  "Thanks for reaching out! An agent will join shortly. Meanwhile, can you share your shop name and plan?",
  "Got it — I've noted that down. If it's about billing, check Billing & Plan for invoices and renewal status.",
  "For data questions: everything syncs automatically when you're online. The pill in the top bar shows sync state.",
  "Tip: the Tools page has WhatsApp orders, GPS delivery tracking, e-signatures and voice entry.",
  "Is there anything else I can help you with?",
];

/** Enterprise-only in-app support chat (FAB + drawer). */
export default function SupportChat({ open, onOpenChange }: { open: boolean; onOpenChange: (b: boolean) => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([
    { id: 1, from: "support", text: "👋 Hi! This is Managix priority support. How can we help today?", at: new Date().toISOString() },
  ]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const idRef = useRef(1);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [msgs, typing, open]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    const mine: Msg = { id: ++idRef.current, from: "you", text, at: new Date().toISOString() };
    setMsgs((m) => [...m, mine]);
    setDraft("");
    setTyping(true);
    window.setTimeout(() => {
      const reply: Msg = {
        id: ++idRef.current,
        from: "support",
        text: CANNED[Math.floor(Math.random() * CANNED.length)],
        at: new Date().toISOString(),
      };
      setMsgs((m) => [...m, reply]);
      setTyping(false);
    }, 900 + Math.random() * 800);
  };

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => onOpenChange(!open)}
        title="Priority support (Enterprise)"
        className={classNames(
          "fixed bottom-5 right-5 z-[70] flex h-12 w-12 items-center justify-center rounded-full bg-violet-600 text-xl text-white shadow-pop transition-transform hover:scale-105",
          open && "rotate-90",
        )}
      >
        {open ? "✕" : "💬"}
      </button>

      {/* Drawer */}
      {open ? (
        <div className="fixed bottom-20 right-5 z-[70] flex h-[26rem] w-80 flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-pop">
          <div className="flex items-center gap-2.5 border-b border-ink-100 bg-violet-600 px-4 py-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-sm">🎧</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">Priority support</p>
              <p className="text-[11px] text-white/70">Typically replies in minutes</p>
            </div>
          </div>
          <div ref={bodyRef} className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
            {msgs.map((m) => (
              <div key={m.id} className={classNames("flex", m.from === "you" ? "justify-end" : "justify-start")}>
                <div
                  className={classNames(
                    "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm",
                    m.from === "you" ? "rounded-br-md bg-brand-600 text-white" : "rounded-bl-md bg-ink-100 text-ink-800",
                  )}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {typing ? (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md bg-ink-100 px-4 py-2.5">
                  <span className="inline-flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-400" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-400" style={{ animationDelay: "0.15s" }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-400" style={{ animationDelay: "0.3s" }} />
                  </span>
                </div>
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2 border-t border-ink-100 px-3 py-2.5">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Type a message…"
              className="h-9 flex-1 rounded-lg border border-ink-200 px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
            />
            <button onClick={send} className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white hover:bg-brand-700">
              ➤
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
