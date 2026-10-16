"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { api, explain } from "@/lib/api";

export default function Registro() {
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
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-semibold">Crear cuenta</h1>
      {done ? (
        <p>Revisa el correo para verificar la cuenta. El enlace dura 24 horas.</p>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <label className="flex flex-col gap-1">
            Correo
            <input className="min-h-11 rounded border px-3" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label className="flex flex-col gap-1">
            Contraseña
            <input className="min-h-11 rounded border px-3" type="password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          {message ? <p>{message}</p> : null}
          <button className="min-h-11 rounded bg-neutral-900 px-4 text-white" type="submit">
            Crear cuenta
          </button>
        </form>
      )}
      <Link className="inline-flex min-h-11 items-center" href="/ingresar">
        Ya tengo cuenta
      </Link>
    </main>
  );
}
