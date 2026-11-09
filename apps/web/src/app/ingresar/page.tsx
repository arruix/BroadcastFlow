"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { afterAuthPath, ApiError, api, explain, signedIn } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { AuthAlert, AuthButton, AuthFrame, fieldClass } from "@/app/auth-frame";

type Organization = { id: string; name: string };

export default function Ingresar() {
  const router = useRouter();
  const { t } = useI18n();
  const copy = t.auth;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [needCode, setNeedCode] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState(false);
  const [busy, setBusy] = useState(false);

  async function openConsole() {
    const me = await api<{ platformOperator: boolean }>("/auth/me");
    const organizations = await api<Organization[]>("/organizations");
    router.push(afterAuthPath(me.platformOperator, organizations.length));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    let entered = false;
    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, ...(totp ? { totp } : {}) }),
      });
      entered = true;
      setSession(true);
      await openConsole();
    } catch (caught) {
      if (!entered && caught instanceof ApiError && caught.code === "mfa_required") {
        setNeedCode(true);
        setError(explain(caught));
        return;
      }
      if (!entered && caught instanceof ApiError && caught.code === "mfa_enroll_required" && caught.ticket) {
        sessionStorage.setItem("bf.ticket", caught.ticket);
        router.push("/mfa");
        return;
      }
      if (entered || signedIn()) setSession(true);
      setError(explain(caught));
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    setBusy(true);
    setError("");
    try {
      await openConsole();
    } catch (caught) {
      setError(explain(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame eyebrow={copy.console} title={copy.signIn}>
      {session ? (
        <section className="grid gap-4 rounded-2xl border bg-white p-5">
          <h2 className="text-lg font-semibold">{copy.sessionTitle}</h2>
          <p className="text-sm leading-6 text-neutral-600">{copy.sessionBody}</p>
          {error ? <AuthAlert>{error}</AuthAlert> : null}
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-neutral-900 px-4 text-sm font-semibold text-white disabled:opacity-70"
            disabled={busy}
            onClick={() => void retry()}
            type="button"
          >
            {busy ? copy.entering : copy.retry}
          </button>
        </section>
      ) : (
        <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
          <label className="grid gap-1 text-sm">
            {copy.email}
            <input className={fieldClass} onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          </label>
          <label className="grid gap-1 text-sm">
            {copy.password}
            <input className={fieldClass} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </label>
          {needCode ? (
            <label className="grid gap-1 text-sm">
              {copy.code}
              <input className={fieldClass} inputMode="numeric" onChange={(event) => setTotp(event.target.value)} required value={totp} />
            </label>
          ) : null}
          {error ? <AuthAlert>{error}</AuthAlert> : null}
          <AuthButton busy={busy} busyLabel={copy.entering}>{copy.signIn}</AuthButton>
          <div className="flex flex-wrap gap-4 text-sm">
            <Link className="inline-flex min-h-11 items-center text-[var(--accent)] underline" href="/registro">{copy.create}</Link>
            <Link className="inline-flex min-h-11 items-center text-[var(--accent)] underline" href="/recuperar">{copy.forgot}</Link>
          </div>
        </form>
      )}
    </AuthFrame>
  );
}
