"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { api, explain } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { AuthAlert, AuthButton, AuthFrame, fieldClass } from "@/app/auth-frame";

export default function Registro() {
  const { locale, t } = useI18n();
  const copy = t.auth;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, locale }),
      });
      setSent(true);
    } catch (caught) {
      setError(explain(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame eyebrow={copy.signupEyebrow} title={copy.create}>
      <p className="text-sm leading-6 text-neutral-600">{copy.signupHelp}</p>
      {sent ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-5 text-sm leading-6 text-emerald-950">
          <p className="font-semibold">{copy.checkEmail}</p>
          <Link className="inline-flex min-h-11 items-center text-[var(--accent)] underline" href="/ingresar">{copy.haveAccount}</Link>
        </div>
      ) : (
        <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
          <label className="grid gap-1 text-sm">
            {copy.email}
            <input className={fieldClass} onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          </label>
          <label className="grid gap-1 text-sm">
            {copy.password}
            <input className={fieldClass} minLength={12} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </label>
          {error ? <AuthAlert>{error}</AuthAlert> : null}
          <AuthButton busy={busy} busyLabel={copy.creating}>{copy.create}</AuthButton>
        </form>
      )}
      {sent ? null : (
        <Link className="text-sm text-[var(--accent)] underline" href="/ingresar">{copy.haveAccount}</Link>
      )}
    </AuthFrame>
  );
}
