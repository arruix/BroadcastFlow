"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { api, explain } from "@/lib/api";

type Organization = { id: string; name: string };

export default function NuevaCampana() {
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState("causa");
  const [jurisdiction, setJurisdiction] = useState("MX");
  const [storeUrl, setStoreUrl] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    api<Organization[]>("/organizations")
      .then((rows) => setOrganizationId(rows[0]?.id ?? ""))
      .catch((error) => setMessage(explain(error)));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await api("/campaigns", {
        method: "POST",
        org: organizationId,
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
      <h1 className="text-3xl font-semibold">Campaña en borrador</h1>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <label className="flex flex-col gap-1">
          Nombre
          <input className="min-h-11 rounded border px-3" value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label className="flex flex-col gap-1">
          Tipo
          <select className="min-h-11 rounded border px-3" value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="causa">Causa</option>
            <option value="electoral">Electoral</option>
            <option value="comercial">Comercial</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Jurisdicción
          <input className="min-h-11 rounded border px-3" value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value)} required />
        </label>
        <label className="flex flex-col gap-1">
          Enlace de tienda
          <input className="min-h-11 rounded border px-3" value={storeUrl} onChange={(event) => setStoreUrl(event.target.value)} placeholder="https://" />
        </label>
        {message ? <p>{message}</p> : null}
        <button className="min-h-11 rounded bg-neutral-900 px-4 text-white" type="submit">
          Guardar
        </button>
      </form>
    </main>
  );
}
