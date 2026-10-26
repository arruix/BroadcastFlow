"use client";

import { FormEvent, useState } from "react";
import { Idioma, useTx } from "@/lib/i18n";
import { api, explain } from "@/lib/api";

export default function Recuperar() {
  const { tx } = useTx();
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await api("/auth/password/forgot", { method: "POST", body: JSON.stringify({ email }) });
      setDone(true);
    } catch (error) {
      setMessage(explain(error));
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-4 py-10">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">{tx("Nueva contraseña", "New password")}</h1>
        <Idioma />
      </div>
      {done ? (
        <p>{tx("Si el correo tiene cuenta, llega un enlace que dura una hora.", "If the email has an account, a link arrives and lasts one hour.")}</p>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <label className="flex flex-col gap-1">
            {tx("Correo", "Email")}
            <input className="min-h-11 rounded border px-3" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          {message ? <p>{message}</p> : null}
          <button className="min-h-11 rounded bg-neutral-900 px-4 text-white" type="submit">
            {tx("Enviar enlace", "Send link")}
          </button>
        </form>
      )}
    </main>
  );
}
