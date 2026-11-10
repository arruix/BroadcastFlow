"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { api, explain } from "@/lib/api";
import { useTx } from "@/lib/i18n";
import { AuthAlert, AuthButton, AuthFrame, fieldClass } from "@/app/auth-frame";

function Formulario() {
  const params = useSearchParams();
  const initial = params.get("token") ?? "";
  const { t, tx } = useTx();
  const copy = t.auth;
  const [token, setToken] = useState(initial);
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/password/reset", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setDone(true);
    } catch (caught) {
      setError(explain(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame eyebrow={copy.console} title={tx("Elegir contraseña", "Choose a password")}>
      {done ? (
        <Link className="inline-flex min-h-11 items-center justify-center rounded-xl bg-neutral-900 px-4 text-sm font-semibold text-white" href="/ingresar">
          {copy.signIn}
        </Link>
      ) : (
        <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
          <label className="grid gap-1 text-sm">
            {tx("Token", "Token")}
            <input className={fieldClass} onChange={(event) => setToken(event.target.value)} required value={token} />
          </label>
          <label className="grid gap-1 text-sm">
            {tx("Contraseña nueva", "New password")}
            <input className={fieldClass} minLength={12} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </label>
          {error ? <AuthAlert>{error}</AuthAlert> : null}
          <AuthButton busy={busy} busyLabel={copy.saving}>{tx("Guardar", "Save")}</AuthButton>
        </form>
      )}
    </AuthFrame>
  );
}

export default function Restablecer() {
  return (
    <Suspense>
      <Formulario />
    </Suspense>
  );
}
