"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { api, explain } from "@/lib/api";

type Enroll = { secret: string; ticket: string };
type Confirmed = { recoveryCodes: string[] };
type Organization = { id: string; name: string };

export default function Mfa() {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [ticket, setTicket] = useState("");
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const current = sessionStorage.getItem("bf.ticket");
    if (!current) return;
    api<Enroll>("/auth/mfa/enroll", { method: "POST", body: JSON.stringify({ ticket: current }) })
      .then((started) => {
        setSecret(started.secret);
        setTicket(started.ticket);
      })
      .catch((error) => setMessage(explain(error)));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const confirmed = await api<Confirmed>("/auth/mfa/confirm", {
        method: "POST",
        body: JSON.stringify({ ticket, code }),
      });
      setCodes(confirmed.recoveryCodes);
      sessionStorage.removeItem("bf.ticket");
    } catch (error) {
      setMessage(explain(error));
    }
  }

  async function next() {
    const organizations = await api<Organization[]>("/organizations");
    router.push(organizations.length ? "/tablero" : "/organizacion");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-semibold">Segundo factor</h1>
      {codes.length ? (
        <>
          <p>Guarda estos ocho códigos. Se muestran una sola vez.</p>
          <ul className="font-mono">
            {codes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <button className="min-h-11 rounded bg-neutral-900 px-4 text-white" type="button" onClick={next}>
            Continuar
          </button>
        </>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <p>Agrega este secreto a tu aplicación de códigos y escribe uno válido.</p>
          <p className="break-all font-mono">{secret}</p>
          <label className="flex flex-col gap-1">
            Código
            <input className="min-h-11 rounded border px-3" inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)} required />
          </label>
          {message ? <p>{message}</p> : null}
          <button className="min-h-11 rounded bg-neutral-900 px-4 text-white" type="submit">
            Activar
          </button>
        </form>
      )}
    </main>
  );
}
