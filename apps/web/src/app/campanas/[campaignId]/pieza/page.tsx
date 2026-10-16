"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { api, explain } from "@/lib/api";

type Organization = { id: string };
type Campaign = { id: string; name: string; slug: string };
type Connection = { id: string; externalAccountId: string; status: string };
type Variant = { id: string; network: string; body: string; valid: boolean };
type Item = { id: string; status: string; variants: Variant[] };
type Share = { title: string; description: string; imageKey: string | null };
type Publication = { id: string; status: string };

export default function Pieza({ params }: { params: Promise<{ campaignId: string }> }) {
  const [organizationId, setOrganizationId] = useState("");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [item, setItem] = useState<Item | null>(null);
  const [body, setBody] = useState("");
  const [valid, setValid] = useState<boolean | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageKey, setImageKey] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [publications, setPublications] = useState<Publication[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    params
      .then(async ({ campaignId }) => {
        const organizations = await api<Organization[]>("/organizations");
        const org = organizations[0]?.id ?? "";
        setOrganizationId(org);
        const campaigns = await api<Campaign[]>("/campaigns", { org });
        setCampaign(campaigns.find((row) => row.id === campaignId) ?? null);
        const linked = await api<Connection[]>("/connections", { org });
        setConnections(linked);
        setConnectionId(linked.find((row) => row.status === "active")?.id ?? "");
        const items = await api<Item[]>(`/campaigns/${campaignId}/content-items`, { org });
        const current = items.at(-1) ?? null;
        setItem(current);
        const variant = current?.variants.find((row) => row.network === "facebook");
        if (variant) {
          setBody(variant.body);
          setValid(variant.valid);
        }
      })
      .catch((error) => setMessage(explain(error)));
  }, [params]);

  async function saveShare(event: FormEvent) {
    event.preventDefault();
    if (!campaign) return;
    setMessage("");
    try {
      const saved = await api<Share>(`/campaigns/${campaign.id}/share`, {
        method: "PUT",
        org: organizationId,
        body: JSON.stringify({ title, description, imageKey: imageKey.trim() || null }),
      });
      setTitle(saved.title);
      setDescription(saved.description);
      setImageKey(saved.imageKey ?? "");
    } catch (error) {
      setMessage(explain(error));
    }
  }

  async function saveBody(event: FormEvent) {
    event.preventDefault();
    if (!campaign) return;
    setMessage("");
    try {
      const current =
        item ??
        (await api<Item>(`/campaigns/${campaign.id}/content-items`, {
          method: "POST",
          org: organizationId,
        }));
      setItem(current);
      const variant = await api<Variant>(`/content-items/${current.id}/variants`, {
        method: "POST",
        org: organizationId,
        body: JSON.stringify({ network: "facebook", body }),
      });
      setValid(variant.valid);
      setItem({ ...current, variants: [variant] });
    } catch (error) {
      setMessage(explain(error));
    }
  }

  async function schedule(event: FormEvent) {
    event.preventDefault();
    const variant = item?.variants.find((row) => row.network === "facebook");
    if (!variant) return;
    setMessage("");
    try {
      const publication = await api<Publication>("/publications", {
        method: "POST",
        org: organizationId,
        body: JSON.stringify({
          variantId: variant.id,
          connectionId,
          scheduledAt: new Date(scheduledAt).toISOString(),
        }),
      });
      setPublications((rows) => [...rows, publication]);
    } catch (error) {
      setMessage(explain(error));
    }
  }

  async function dispatch() {
    setMessage("");
    try {
      const rows = await api<Publication[]>("/publications/dispatch", { method: "POST", org: organizationId });
      setPublications(rows);
    } catch (error) {
      setMessage(explain(error));
    }
  }

  const previewImage = imageKey.startsWith("https://") ? imageKey : "";

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-semibold">{campaign?.name ?? "Pieza"}</h1>
      <div className="grid gap-6 md:grid-cols-2">
        <section className="flex flex-col gap-4 rounded border p-4">
          <h2 className="text-xl font-semibold">Publicación</h2>
          <form className="flex flex-col gap-4" onSubmit={saveBody}>
            <label className="flex flex-col gap-1">
              Texto de Facebook
              <textarea className="min-h-40 rounded border px-3 py-2" value={body} onChange={(event) => setBody(event.target.value)} />
            </label>
            <button className="min-h-11 rounded bg-neutral-900 px-4 text-white" type="submit">
              Guardar variante
            </button>
          </form>
          {valid === false ? <p>La variante no se puede programar.</p> : null}
          {valid === true ? <p>Lista para programar.</p> : null}
        </section>
        <section className="flex flex-col gap-4 rounded border p-4">
          <h2 className="text-xl font-semibold">Ficha del enlace</h2>
          <form className="flex flex-col gap-4" onSubmit={saveShare}>
            <label className="flex flex-col gap-1">
              Título
              <input className="min-h-11 rounded border px-3" value={title} onChange={(event) => setTitle(event.target.value)} required />
            </label>
            <label className="flex flex-col gap-1">
              Descripción
              <input className="min-h-11 rounded border px-3" value={description} onChange={(event) => setDescription(event.target.value)} required />
            </label>
            <label className="flex flex-col gap-1">
              Imagen https
              <input className="min-h-11 rounded border px-3" value={imageKey} onChange={(event) => setImageKey(event.target.value)} placeholder="https://" />
            </label>
            <button className="min-h-11 rounded border px-4 text-left" type="submit">
              Guardar ficha
            </button>
          </form>
          <article className="flex flex-col gap-2 rounded border p-3">
            {previewImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewImage} alt="" className="h-32 w-full object-cover" />
            ) : (
              <p>Sin vista previa. El enlace se publica igual.</p>
            )}
            <p className="font-semibold">{title || "Título de la ficha"}</p>
            <p>{description || "Descripción de la ficha"}</p>
          </article>
        </section>
      </div>
      {message ? <p>{message}</p> : null}
      <form className="flex flex-col gap-4" onSubmit={schedule}>
        <label className="flex flex-col gap-1">
          Página
          <select className="min-h-11 rounded border px-3" value={connectionId} onChange={(event) => setConnectionId(event.target.value)} required>
            <option value="">Elige una Página</option>
            {connections.map((connection) => (
              <option key={connection.id} value={connection.id}>
                {connection.externalAccountId} · {connection.status}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Fecha
          <input className="min-h-11 rounded border px-3" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} required />
        </label>
        <button className="min-h-11 rounded bg-neutral-900 px-4 text-white" type="submit">
          Programar
        </button>
      </form>
      <button className="min-h-11 rounded border px-4 text-left" type="button" onClick={dispatch}>
        Publicar pendientes
      </button>
      <ul className="flex flex-col gap-2">
        {publications.map((publication) => (
          <li key={publication.id}>{publication.status}</li>
        ))}
      </ul>
      {campaign ? (
        <Link className="inline-flex min-h-11 items-center" href={`/c/${campaign.slug}`}>
          Ver página pública
        </Link>
      ) : null}
    </main>
  );
}
