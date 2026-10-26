"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Idioma, useTx } from "@/lib/i18n";
import { afterAuthPath, api, explain } from "@/lib/api";

type Enroll = { secret: string; ticket: string };
type Confirmed = { recoveryCodes: string[] };
type Organization = { id: string; name: string };

export default function Mfa() {
  const { tx } = useTx();
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
    const me = await api<{ platformOperator: boolean }>("/auth/me");
    const organizations = await api<Organization[]>("/organizations");
    router.push(afterAuthPath(me.platformOperator, organizations.length));
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-4 py-10">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">{tx("Segundo factor", "Second factor")}</h1>
        <Idioma />
      </div>
      {codes.length ? (
        <>
          <p>{tx("Guarda estos ocho códigos. Se muestran una sola vez.", "Save these eight codes. They are shown only once.")}</p>
          <ul className="font-mono">
            {codes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <button className="min-h-11 rounded bg-neutral-900 px-4 text-white" type="button" onClick={next}>
            {tx("Continuar", "Continue")}
          </button>
        </>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <p>{tx("Agrega este secreto a tu aplicación de códigos y escribe uno válido.", "Add this secret to your code app and type a valid one.")}</p>
          <p className="break-all font-mono">{secret}</p>
          <label className="flex flex-col gap-1">
            {tx("Código", "Code")}
            <input className="min-h-11 rounded border px-3" inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)} required />
          </label>
          {message ? <p>{message}</p> : null}
          <button className="min-h-11 rounded bg-neutral-900 px-4 text-white" type="submit">
            {tx("Activar", "Turn on")}
          </button>
        </form>
      )}
    </main>
  );
}
