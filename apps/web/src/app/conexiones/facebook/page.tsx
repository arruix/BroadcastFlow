"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { api, explain } from "@/lib/api";

type Connection = { id: string; externalAccountId: string; status: string };

export default function FacebookConnect() {
  const [state, setState] = useState("");
  const [pageId, setPageId] = useState("");
  const [canPublish, setCanPublish] = useState(true);
  const [saved, setSaved] = useState<Connection | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setState(new URLSearchParams(window.location.search).get("state") ?? "");
  }, []);

  async function finish(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      const connection = await api<Connection>("/connections/facebook/callback", {
        method: "POST",
        body: JSON.stringify({
          state,
          pageId,
          scopes: canPublish ? ["pages_show_list", "pages_manage_posts"] : ["pages_show_list"],
        }),
      });
      setSaved(connection);
    } catch (error) {
      setMessage(explain(error));
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-semibold">Página de Facebook</h1>
      <p>El token se guarda cifrado. Esta pantalla no lo muestra.</p>
      <form className="flex flex-col gap-4" onSubmit={finish}>
        <label className="flex flex-col gap-1">
          Identificador de la Página
          <input className="min-h-11 rounded border px-3" value={pageId} onChange={(event) => setPageId(event.target.value)} required />
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={canPublish} onChange={(event) => setCanPublish(event.target.checked)} />
          Puede publicar en la Página
        </label>
        {message ? <p>{message}</p> : null}
        <button className="min-h-11 rounded bg-neutral-900 px-4 text-white" type="submit" disabled={!state}>
          Guardar conexión
        </button>
      </form>
      {saved ? (
        <p>
          {saved.externalAccountId} · {saved.status === "active" ? "lista para publicar" : "falta permiso de publicación"}
        </p>
      ) : null}
      <Link className="inline-flex min-h-11 items-center" href="/conexiones">
        Volver a conexiones
      </Link>
    </main>
  );
}
