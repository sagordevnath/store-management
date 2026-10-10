import { Suspense, lazy, useState } from "react";
import { Button, Field, TextInput } from "../ui";
import { IcStore, IcCheck } from "../icons";
import { useApp } from "../App";
import { LanguageMenu } from "../LanguageMenu";
import { supabase } from "../lib/supabase";

const LoginHero3D = lazy(() => import("../three/LoginHero3D"));
type AuthMode = "signin" | "signup" | "reset";

export function LoginPage({
  onLogin,
  shopName,
  authError,
  recovery = false,
}: {
  onLogin: () => void;
  shopName: string;
  authError?: string;
  recovery?: boolean;
}) {
  const { t } = useApp();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setNotice("");
    if (!supabase) {
      setErr("Hosted sign-in is not configured. Set the Supabase URL and public anon key.");
      return;
    }
    setBusy(true);
    try {
      if (recovery) {
        if (newPassword.length < 8) throw new Error("Use a password with at least 8 characters.");
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
        setNotice("Password updated. Sign in with your new password.");
        setPassword("");
        setNewPassword("");
        onLogin();
      } else if (mode === "signup") {
        if (!businessName.trim()) throw new Error("Enter your shop or business name.");
        if (password.length < 8) throw new Error("Use a password with at least 8 characters.");
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { shop_name: businessName.trim() },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        if (data.session) onLogin();
        else setNotice("Check your email to confirm your account, then sign in.");
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setNotice("If an account exists for that email, a password-reset link has been sent.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        onLogin();
      }
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Authentication failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const title = recovery ? "Set a new password" : mode === "signup" ? "Create your account" : mode === "reset" ? "Reset password" : t("login.welcome");

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-ink-950 p-12 text-white lg:flex">
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
          <h1 className="text-3xl font-extrabold leading-tight">{t("login.heroTitle")}</h1>
          <p className="mt-4 text-sm leading-relaxed text-white/65">{t("login.heroSub")}</p>
          <ul className="mt-8 space-y-3.5">
            {[t("login.feature1"), t("login.feature2"), t("login.feature3"), t("login.feature4")].map((feature) => (
              <li key={feature} className="flex items-start gap-3 text-sm text-white/80">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500/30 text-brand-300">
                  <IcCheck size={12} />
                </span>
                {feature}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative z-10 text-xs text-white/40">© 2026 Managix · Business management for independent shops</p>
      </div>

      <div className="relative flex flex-1 items-center justify-center bg-white px-6 py-12">
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
          <h2 className="text-2xl font-bold text-ink-900">{title}</h2>
          <p className="mt-1.5 text-sm text-ink-500">
            {recovery || mode !== "signin" ? "Use your email to securely manage your Managix account." : `${t("login.signInTo")} ${shopName}.`}
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            {!recovery && (
              <Field label={t("login.email")}>
                <TextInput value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoComplete="email" placeholder="you@shop.com" />
              </Field>
            )}
            {mode === "signup" && !recovery && (
              <Field label="Shop or business name">
                <TextInput value={businessName} onChange={(e) => setBusinessName(e.target.value)} required autoComplete="organization" placeholder="Your shop name" />
              </Field>
            )}
            {(mode === "signin" || mode === "signup") && !recovery && (
              <Field label={t("login.password")}>
                <TextInput value={password} onChange={(e) => setPassword(e.target.value)} type="password" required autoComplete={mode === "signup" ? "new-password" : "current-password"} placeholder="At least 8 characters" />
              </Field>
            )}
            {recovery && (
              <Field label="New password">
                <TextInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" required autoComplete="new-password" placeholder="At least 8 characters" />
              </Field>
            )}
            {authError ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{authError}</p> : null}
            {err ? <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{err}</p> : null}
            {notice ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{notice}</p> : null}
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? "Please wait…" : recovery ? "Update password" : mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : t("login.signIn")}
            </Button>
          </form>

          {!recovery && (
            <div className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs">
              {mode === "signin" ? (
                <>
                  <button type="button" className="font-medium text-brand-600 hover:text-brand-700" onClick={() => { setMode("signup"); setErr(""); setNotice(""); }}>Create account</button>
                  <button type="button" className="font-medium text-ink-500 hover:text-ink-700" onClick={() => { setMode("reset"); setErr(""); setNotice(""); }}>Forgot password?</button>
                </>
              ) : (
                <button type="button" className="font-medium text-brand-600 hover:text-brand-700" onClick={() => { setMode("signin"); setErr(""); setNotice(""); }}>Back to sign in</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
