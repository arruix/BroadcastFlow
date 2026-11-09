"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { api, explain } from "@/lib/api";
import { useTx } from "@/lib/i18n";
import { AuthAlert, AuthButton, AuthFrame, fieldClass } from "@/app/auth-frame";

const pending = new Map<string, Promise<void>>();

function verifyOnce(token: string) {
  const current = pending.get(token);
  if (current) return current;
  const request = api("/auth/verify", {
    method: "POST",
    body: JSON.stringify({ token }),
  })
    .then(() => undefined)
    .catch((error: unknown) => {
      pending.delete(token);
      throw error;
    });
  pending.set(token, request);
  return request;
}

function Formulario() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const { locale, t, tx } = useTx();
  const copy = t.auth;
  const [state, setState] = useState<"loading" | "ok" | "used" | "error">(
    token ? "loading" : "error",
  );
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let active = true;
    verifyOnce(token).then(
      () => {
        if (active) setState("ok");
      },
      (caught: unknown) => {
        if (!active) return;
        const detail = explain(caught);
        if (detail === t.errors.link_invalid) {
          setError("");
          setState("used");
          return;
        }
        setError(detail);
        setState("error");
      },
    );
    return () => {
      active = false;
    };
  }, [token, t.errors.link_invalid]);

  async function resend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/verify/resend", {
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
    <AuthFrame eyebrow={copy.console} title={tx("Verificar correo", "Verify email")}>
      {state === "loading" ? (
        <p className="text-sm text-neutral-600" role="status">{tx("Verificando…", "Verifying…")}</p>
      ) : null}
      {state === "ok" ? (
        <section className="grid gap-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-5 text-emerald-950">
          <h2 className="text-lg font-semibold">{copy.verifiedTitle}</h2>
          <p className="text-sm leading-6">{copy.verifiedBody}</p>
          <Link className="inline-flex min-h-11 items-center justify-center rounded-xl bg-neutral-900 px-4 text-sm font-semibold text-white" href="/ingresar">
            {copy.signIn}
          </Link>
        </section>
      ) : null}
      {state === "used" ? (
        <section className="grid gap-4">
          <div className="rounded-2xl border bg-white p-5">
            <h2 className="text-lg font-semibold">{copy.linkUsedTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-600">{copy.linkUsedBody}</p>
          </div>
          {sent ? (
            <p className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-5 text-sm leading-6 text-emerald-950">{copy.resendSent}</p>
          ) : (
            <form className="grid gap-4" onSubmit={(event) => void resend(event)}>
              <label className="grid gap-1 text-sm">
                {copy.email}
                <input className={fieldClass} onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
              </label>
              {error ? <AuthAlert>{error}</AuthAlert> : null}
              <AuthButton busy={busy} busyLabel={copy.sending}>{copy.resend}</AuthButton>
            </form>
          )}
        </section>
      ) : null}
      {state === "error" ? (
        <section className="grid gap-4">
          <AuthAlert>{error || copy.missingLink}</AuthAlert>
          <Link className="text-sm text-[var(--accent)] underline" href="/ingresar">{copy.haveAccount}</Link>
        </section>
      ) : null}
    </AuthFrame>
  );
}

export default function Verificar() {
  return (
    <Suspense>
      <Formulario />
    </Suspense>
  );
}
