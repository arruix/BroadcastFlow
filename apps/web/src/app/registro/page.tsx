"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Idioma, useI18n } from "@/lib/i18n";
import { api, explain } from "@/lib/api";

export default function Registro() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      await api("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) });
      setDone(true);
    } catch (error) {
      setMessage(explain(error));
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-4 py-12">
      <div className="flex items-center justify-between gap-3">
        <Link className="brand w-fit" href="/">
          BroadcastFlow
        </Link>
        <Idioma />
      </div>
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{t.auth.signupEyebrow}</p>
        <h1 className="text-4xl">{t.auth.create}</h1>
        <p>{t.auth.signupHelp}</p>
      </div>
      {done ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-5 text-emerald-950">
          <p className="font-semibold">{t.auth.checkEmail}</p>
          <Link className="inline-flex min-h-11 items-center justify-center rounded-xl bg-neutral-900 px-4 text-white text-sm font-semibold" href="/verificar">
            Ir a verificar correo
          </Link>
        </div>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <label className="flex flex-col gap-1">
            {t.auth.email}
            <input className="min-h-11 rounded border px-3" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label className="flex flex-col gap-1">
            {t.auth.password}
            <input className="min-h-11 rounded border px-3" type="password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          {message ? <p>{message}</p> : null}
          <button className="min-h-11 rounded bg-neutral-900 px-4 text-white" type="submit">
            {t.auth.create}
          </button>
        </form>
      )}
      <Link className="inline-flex min-h-11 items-center" href="/ingresar">
        {t.auth.haveAccount}
      </Link>
    </main>
  );
}
