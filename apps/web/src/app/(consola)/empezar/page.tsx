"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useTx } from "@/lib/i18n";
import { api, explain, signedIn } from "@/lib/api";

type Organization = { id: string; name: string };

export default function Empezar() {
  const { tx } = useTx();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [signed, setSigned] = useState(false);
  const [organizationId, setOrganizationId] = useState("");
  const [name, setName] = useState("");
  const [country, setCountry] = useState("MX");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!signedIn()) {
      setReady(true);
      return;
    }
    setSigned(true);
    Promise.all([api<Organization[]>("/organizations"), api<{ platformOperator: boolean }>("/auth/me")])
      .then(([rows, me]) => {
        if (me.platformOperator) {
          router.replace("/plataforma");
          return;
        }
        setOrganizationId(rows[0]?.id ?? "");
        setReady(true);
      })
      .catch((error) => {
        setMessage(explain(error));
        setReady(true);
      });
  }, [router]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      const created = await api<Organization>("/organizations", {
        method: "POST",
        body: JSON.stringify({ name, country }),
      });
      setOrganizationId(created.id);
    } catch (error) {
      setMessage(explain(error));
    }
  }

  async function connect(network: "facebook" | "youtube") {
    setMessage("");
    try {
      sessionStorage.setItem("bf_connect_next", "/empezar");
      const started = await api<{ authorizationUrl: string }>(`/connections/${network}/start`, {
        method: "POST",
        org: organizationId,
      });
      window.location.assign(started.authorizationUrl);
    } catch (error) {
      setMessage(explain(error));
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-4 py-12">
      <p className="eyebrow">{tx("Primer ingreso", "First sign-in")}</p>
      <h1 className="text-4xl">{tx("Antes del tablero", "Before the board")}</h1>
      {message ? <p>{message}</p> : null}
      {ready && !signed ? (
        <p>
          <Link className="underline" href="/ingresar">
            {tx("Entra para continuar.", "Sign in to continue.")}
          </Link>
        </p>
      ) : null}
      {ready && signed && !organizationId ? (
        <>
          <p>{tx("Quedas como owner, con el plan fundador.", "You become the owner, on the founder plan.")}</p>
          <form className="flex flex-col gap-4" onSubmit={create}>
            <label className="flex flex-col gap-1">
              {tx("Nombre de la organización", "Organization name")}
              <input className="min-h-11 rounded border px-3" value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            <label className="flex flex-col gap-1">
              {tx("País", "Country")}
              <input className="min-h-11 rounded border px-3" maxLength={2} value={country} onChange={(event) => setCountry(event.target.value)} required />
            </label>
            <button className="min-h-11 rounded bg-neutral-900 px-4 text-white" type="submit">
              {tx("Crear organización", "Create organization")}
            </button>
          </form>
        </>
      ) : null}
      {organizationId ? (
        <>
          <p>
            {tx(
              "Conecta la Página de Facebook y el canal de YouTube. Puedes entrar al tablero y conectarlas después.",
              "Connect the Facebook Page and the YouTube channel. You can open the board and connect them later.",
            )}
          </p>
          <button className="min-h-11 rounded bg-neutral-900 px-4 text-white" type="button" onClick={() => connect("facebook")}>
            {tx("Conectar Página de Facebook", "Connect Facebook Page")}
          </button>
          <button className="min-h-11 rounded border px-4 text-left" type="button" onClick={() => connect("youtube")}>
            {tx("Conectar canal de YouTube", "Connect YouTube channel")}
          </button>
          <Link className="inline-flex min-h-11 items-center" href="/tablero">
            {tx("Entrar al tablero", "Open the board")}
          </Link>
        </>
      ) : null}
    </main>
  );
}
