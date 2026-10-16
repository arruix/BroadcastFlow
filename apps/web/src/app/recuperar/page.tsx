"use client";

import { FormEvent, useState } from "react";
import { api, explain } from "@/lib/api";

export default function Recuperar() {
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
      <h1 className="text-3xl font-semibold">Nueva contraseña</h1>
      {done ? (
        <p>Si el correo tiene cuenta, llega un enlace que dura una hora.</p>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <label className="flex flex-col gap-1">
            Correo
            <input className="min-h-11 rounded border px-3" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          {message ? <p>{message}</p> : null}
          <button className="min-h-11 rounded bg-neutral-900 px-4 text-white" type="submit">
            Enviar enlace
          </button>
        </form>
      )}
    </main>
  );
}
