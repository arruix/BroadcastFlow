"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { api, explain } from "@/lib/api";
import { useTx } from "@/lib/i18n";
import { AuthAlert, AuthButton, AuthFrame, fieldClass } from "@/app/auth-frame";

export default function Recuperar() {
  const { locale, t, tx } = useTx();
  const copy = t.auth;
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/password/forgot", {
        method: "POST",
        body: JSON.stringify({ email, locale }),
      });
      setSent(true);
    } catch (caught) {
      setError(explain(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame eyebrow={copy.console} title={tx("Nueva contraseña", "New password")}>
      {sent ? (
        <p className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-5 text-sm leading-6 text-emerald-950">
          {tx("Si el correo tiene cuenta, llega un enlace que dura una hora.", "If the email has an account, a link arrives and lasts one hour.")}
        </p>
      ) : (
        <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
          <label className="grid gap-1 text-sm">
            {copy.email}
            <input className={fieldClass} onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          </label>
          {error ? <AuthAlert>{error}</AuthAlert> : null}
          <AuthButton busy={busy} busyLabel={copy.sending}>{tx("Enviar enlace", "Send link")}</AuthButton>
        </form>
      )}
      <Link className="text-sm text-[var(--accent)] underline" href="/ingresar">{copy.haveAccount}</Link>
    </AuthFrame>
  );
}
