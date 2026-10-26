"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { Idioma, useTx } from "@/lib/i18n";
import { api, explain } from "@/lib/api";

function RestablecerForm() {
  const { tx } = useTx();
  const params = useSearchParams();
  const [token, setToken] = useState(params.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await api("/auth/password/reset", { method: "POST", body: JSON.stringify({ token, password }) });
      setDone(true);
    } catch (error) {
      setMessage(explain(error));
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-4 py-10">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">{tx("Elegir contraseña", "Choose a password")}</h1>
        <Idioma />
      </div>
      {done ? (
        <Link className="inline-flex min-h-11 items-center" href="/ingresar">
          {tx("Entrar", "Sign in")}
        </Link>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <label className="flex flex-col gap-1">
            {tx("Token", "Token")}
            <input className="min-h-11 rounded border px-3" value={token} onChange={(event) => setToken(event.target.value)} required />
          </label>
          <label className="flex flex-col gap-1">
            {tx("Contraseña nueva", "New password")}
            <input className="min-h-11 rounded border px-3" type="password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          {message ? <p>{message}</p> : null}
          <button className="min-h-11 rounded bg-neutral-900 px-4 text-white" type="submit">
            {tx("Guardar", "Save")}
          </button>
        </form>
      )}
    </main>
  );
}

export default function Restablecer() {
  return (
    <Suspense>
      <RestablecerForm />
    </Suspense>
  );
}
