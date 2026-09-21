import { Suspense, lazy, useState } from "react";
import { Button, Field, TextInput } from "../ui";
import { IcStore, IcCheck } from "../icons";
import { useApp } from "../App";
import { LanguageMenu } from "../LanguageMenu";

// Three.js hero is code-split so the main bundle stays lean.
const LoginHero3D = lazy(() => import("../three/LoginHero3D"));

export function LoginPage({ onLogin, shopName }: { onLogin: () => void; shopName: string }) {
  const { t } = useApp();
  const [email, setEmail] = useState("owner@brightleaf.market");
  const [password, setPassword] = useState("demo1234");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@") || password.length < 4) {
      setErr(t("login.err"));
      return;
    }
    setBusy(true);
    window.setTimeout(() => {
      setBusy(false);
      onLogin();
    }, 550);
  };

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      {/* Left brand panel */}
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-ink-950 p-12 text-white lg:flex">
        {/* Interactive 3D scene: drag to spin. Sits behind the copy. */}
        <Suspense fallback={null}>
          <LoginHero3D className="absolute inset-0 opacity-70" />
        </Suspense>
        <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-brand-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-16 h-[28rem] w-[28rem] rounded-full bg-brand-400/15 blur-3xl" />
        <div className="relative flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500">
            <IcStore size={20} className="text-white" />
          </div>
          <div>
            <p className="text-base font-bold leading-tight">Managix</p>
            <p className="text-xs text-white/55">Business Manager</p>
          </div>
        </div>
        <div className="relative z-10 max-w-md">
          <h1 className="text-3xl font-extrabold leading-tight">
            {t("login.heroTitle")}
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-white/65">
            {t("login.heroSub")}
          </p>
          <ul className="mt-8 space-y-3.5">
            {[
              t("login.feature1"),
              t("login.feature2"),
              t("login.feature3"),
              t("login.feature4"),
            ].map((t) => (
              <li key={t} className="flex items-start gap-3 text-sm text-white/80">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500/30 text-brand-300">
                  <IcCheck size={12} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative z-10 text-xs text-white/40">
          © 2026 Managix · Trusted by thousands of retail shops worldwide
        </p>
      </div>

      {/* Right form */}
      <div className="relative flex flex-1 items-center justify-center bg-white px-6 py-12">
        {/* Language switcher — pick a language before signing in */}
        <div className="absolute right-5 top-5 z-20">
          <LanguageMenu variant="light" placement="bottom-right" />
        </div>
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600">
              <IcStore size={20} className="text-white" />
            </div>
            <div>
              <p className="text-base font-bold leading-tight text-ink-900">Managix</p>
              <p className="text-xs text-ink-500">Business Manager</p>
            </div>
          </div>
          <h2 className="text-2xl font-bold text-ink-900">{t("login.welcome")}</h2>
          <p className="mt-1.5 text-sm text-ink-500">{t("login.signInTo")} {shopName}.</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <Field label={t("login.email")}>
              <TextInput value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@shop.com" />
            </Field>
            <Field label={t("login.password")}>
              <TextInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="••••••••"
              />
            </Field>
            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 text-ink-600">
                <input type="checkbox" defaultChecked className="h-3.5 w-3.5 rounded border-ink-300 text-brand-600 focus:ring-brand-500" />
                {t("login.keep")}
              </label>
              <a href="#" className="font-medium text-brand-600 hover:text-brand-700">{t("login.forgot")}</a>
            </div>
            {err ? <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{err}</p> : null}
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? t("login.signingIn") : t("login.signIn")}
            </Button>
            <p className="pt-1 text-center text-xs text-ink-400">
              {t("login.demoHint")} <span className="font-semibold text-ink-600">{t("login.signIn")}</span>.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
