"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useTx } from "@/lib/i18n";
import { api, explain, signedIn } from "@/lib/api";

type Organization = { id: string; name: string };

export default function NuevaCampana() {
  const { tx } = useTx();
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState("");
  const [operator, setOperator] = useState(false);
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("causa");
  const [jurisdiction, setJurisdiction] = useState("MX");
  const [storeUrl, setStoreUrl] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!signedIn()) {
      setReady(true);
      return;
    }
    Promise.all([api<Organization[]>("/organizations"), api<{ platformOperator: boolean }>("/auth/me")])
      .then(([rows, me]) => {
        setOrganizationId(rows[0]?.id ?? "");
        setOperator(me.platformOperator);
        setReady(true);
      })
      .catch((error) => {
        setMessage(explain(error));
        setReady(true);
      });
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      await api("/campaigns", {
        method: "POST",
        ...(organizationId ? { org: organizationId } : {}),
        body: JSON.stringify({
          name,
          currency: "USD",
          kind,
          jurisdiction,
          timeZone: "America/Mexico_City",
          ...(storeUrl ? { storeUrl } : {}),
        }),
      });
      router.push("/tablero");
    } catch (error) {
      setMessage(explain(error));
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-semibold">{tx("Campaña en borrador", "Campaign in draft")}</h1>
      {message ? <p>{message}</p> : null}
      {ready && !signedIn() ? (
        <p>
          <Link className="underline" href="/ingresar">
            {tx("Entra para crear la campaña.", "Sign in to create the campaign.")}
          </Link>
        </p>
      ) : null}
      {ready && operator && !organizationId ? (
        <p>
          {tx("El operador da de alta la organización en Plataforma.", "The operator creates the organization in Platform.")}{" "}
          <Link className="underline" href="/plataforma">
            {tx("Ir a Plataforma", "Go to Platform")}
          </Link>
        </p>
      ) : null}
      {ready && signedIn() && !(operator && !organizationId) ? (
      <>
      {!organizationId ? <p>{tx("La campaña queda a tu nombre.", "The campaign is saved under your name.")}</p> : null}
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <label className="flex flex-col gap-1">
          {tx("Nombre", "Name")}
          <input className="min-h-11 rounded border px-3" value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label className="flex flex-col gap-1">
          {tx("Tipo", "Type")}
          <select className="min-h-11 rounded border px-3" value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="causa">{tx("Causa", "Cause")}</option>
            <option value="electoral">{tx("Electoral", "Electoral")}</option>
            <option value="comercial">{tx("Comercial", "Commercial")}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          {tx("Jurisdicción", "Jurisdiction")}
          <input className="min-h-11 rounded border px-3" value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value)} required />
        </label>
        <label className="flex flex-col gap-1">
          {tx("Enlace de tienda", "Store link")}
          <input className="min-h-11 rounded border px-3" value={storeUrl} onChange={(event) => setStoreUrl(event.target.value)} placeholder="https://" />
        </label>
        {message ? <p>{message}</p> : null}
        <button className="min-h-11 rounded bg-neutral-900 px-4 text-white" type="submit">
          {tx("Guardar", "Save")}
        </button>
      </form>
      </>
      ) : null}
    </main>
  );
}
