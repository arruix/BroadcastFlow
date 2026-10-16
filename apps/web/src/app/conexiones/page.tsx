"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, explain, signedIn } from "@/lib/api";

type Organization = { id: string; name: string };
type Connection = { id: string; network: string; externalAccountId: string; status: string };

export default function Conexiones() {
  const [organizationId, setOrganizationId] = useState("");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!signedIn()) {
      setMessage("Entra para conectar una Página.");
      return;
    }
    api<Organization[]>("/organizations")
      .then(async (rows) => {
        const org = rows[0]?.id ?? "";
        setOrganizationId(org);
        if (!org) return;
        setConnections(await api<Connection[]>("/connections", { org }));
      })
      .catch((error) => setMessage(explain(error)));
  }, []);

  async function connect() {
    setMessage("");
    try {
      const started = await api<{ authorizationUrl: string }>("/connections/facebook/start", {
        method: "POST",
        org: organizationId,
      });
      window.location.assign(started.authorizationUrl);
    } catch (error) {
      setMessage(explain(error));
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-semibold">Conexiones</h1>
      {message ? <p>{message}</p> : null}
      {!signedIn() ? (
        <Link className="inline-flex min-h-11 items-center" href="/ingresar">
          Entrar
        </Link>
      ) : null}
      <ul className="flex flex-col gap-3">
        {connections.map((connection) => (
          <li key={connection.id}>
            <p>
              {connection.network} · {connection.externalAccountId}
            </p>
            <p className="text-sm">{connection.status === "active" ? "Lista para publicar" : "Falta permiso de publicación"}</p>
          </li>
        ))}
      </ul>
      {organizationId ? (
        <button className="min-h-11 rounded bg-neutral-900 px-4 text-white" type="button" onClick={connect}>
          Conectar Página de Facebook
        </button>
      ) : null}
      <Link className="inline-flex min-h-11 items-center" href="/tablero">
        Volver a la consola
      </Link>
    </main>
  );
}
