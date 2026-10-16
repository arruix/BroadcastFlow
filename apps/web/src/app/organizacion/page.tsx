"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { api, explain } from "@/lib/api";

export default function Organizacion() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [country, setCountry] = useState("MX");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await api("/organizations", { method: "POST", body: JSON.stringify({ name, country }) });
      router.push("/tablero");
    } catch (error) {
      setMessage(explain(error));
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-semibold">Tu organización</h1>
      <p>Quedas como owner, con el plan fundador.</p>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <label className="flex flex-col gap-1">
          Nombre
          <input className="min-h-11 rounded border px-3" value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label className="flex flex-col gap-1">
          País
          <input className="min-h-11 rounded border px-3" maxLength={2} value={country} onChange={(event) => setCountry(event.target.value)} required />
        </label>
        {message ? <p>{message}</p> : null}
        <button className="min-h-11 rounded bg-neutral-900 px-4 text-white" type="submit">
          Crear
        </button>
      </form>
    </main>
  );
}
