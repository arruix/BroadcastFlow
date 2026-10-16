"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, clearSession, explain, signedIn } from "@/lib/api";

type Organization = { id: string; name: string };
type Campaign = { id: string; name: string; status: string; slug: string; kind: string };

export default function Tablero() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!signedIn()) {
      setMessage("Entra para ver la consola.");
      return;
    }
    api<Organization[]>("/organizations")
      .then(async (rows) => {
        setOrganizations(rows);
        if (!rows[0]) return;
        setCampaigns(await api<Campaign[]>("/campaigns", { org: rows[0].id }));
      })
      .catch((error) => setMessage(explain(error)));
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-semibold">Consola</h1>
      {message ? <p>{message}</p> : null}
      {!signedIn() ? (
        <Link className="inline-flex min-h-11 items-center" href="/ingresar">
          Entrar
        </Link>
      ) : null}
      {signedIn() && organizations.length === 0 ? (
        <Link className="inline-flex min-h-11 items-center" href="/organizacion">
          Crear organización
        </Link>
      ) : null}
      {organizations[0] ? <p>{organizations[0].name}</p> : null}
      <ul className="flex flex-col gap-3">
        {campaigns.map((campaign) => (
          <li key={campaign.id}>
            <Link className="inline-flex min-h-11 items-center" href={`/campanas/${campaign.id}`}>
              {campaign.name}
            </Link>
            <p className="text-sm">
              {campaign.kind} · {campaign.status}
            </p>
          </li>
        ))}
      </ul>
      {organizations[0] ? (
        <Link className="inline-flex min-h-11 items-center" href="/campanas/nueva">
          Nueva campaña
        </Link>
      ) : null}
      {organizations[0] ? (
        <Link className="inline-flex min-h-11 items-center" href="/conexiones">
          Conectar Facebook
        </Link>
      ) : null}
      {signedIn() ? (
        <button
          className="min-h-11 text-left"
          type="button"
          onClick={async () => {
            await api("/auth/logout", { method: "POST" });
            clearSession();
            router.push("/ingresar");
          }}
        >
          Salir
        </button>
      ) : null}
    </main>
  );
}
