"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useTx } from "@/lib/i18n";
import { api, explain } from "@/lib/api";

type Organization = { id: string };
type Campaign = { id: string; name: string; slug: string };
type Connection = { id: string; externalAccountId: string; status: string };
type Variant = { id: string; network: string; body: string; valid: boolean };
type Item = { id: string; status: string; variants: Variant[] };
type Share = { title: string; description: string; imageKey: string | null };
type Publication = { id: string; status: string };

export default function Pieza({ params }: { params: Promise<{ campaignId: string }> }) {
  const { tx } = useTx();
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
    <main className="console-page">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <p className="eyebrow">{tx("Pieza", "Piece")}</p>
          <h1 className="text-4xl">{campaign?.name ?? tx("Pieza", "Piece")}</h1>
        </div>
        {campaign ? (
          <Link className="chip" href={`/c/${campaign.slug}`}>
            {tx("Ver página pública", "See the public page")}
          </Link>
        ) : null}
      </header>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="sheet">
          <h2 className="text-2xl">{tx("Publicación", "Publishing")}</h2>
          <form className="flex flex-col gap-4" onSubmit={saveBody}>
            <label className="flex flex-col gap-1">
              {tx("Texto de Facebook", "Facebook text")}
              <textarea className="min-h-40 rounded border px-3 py-2" value={body} onChange={(event) => setBody(event.target.value)} />
            </label>
            <button className="min-h-11 rounded bg-neutral-900 px-4 text-white" type="submit">
              {tx("Guardar variante", "Save variant")}
            </button>
          </form>
          {valid === false ? <p>{tx("La variante no se puede programar.", "The variant cannot be scheduled.")}</p> : null}
          {valid === true ? <p>{tx("Lista para programar.", "Ready to schedule.")}</p> : null}
        </section>
        <section className="sheet">
          <h2 className="text-2xl">{tx("Ficha del enlace", "Link card")}</h2>
          <form className="flex flex-col gap-4" onSubmit={saveShare}>
            <label className="flex flex-col gap-1">
              {tx("Título", "Title")}
              <input className="min-h-11 rounded border px-3" value={title} onChange={(event) => setTitle(event.target.value)} required />
            </label>
            <label className="flex flex-col gap-1">
              {tx("Descripción", "Description")}
              <input className="min-h-11 rounded border px-3" value={description} onChange={(event) => setDescription(event.target.value)} required />
            </label>
            <label className="flex flex-col gap-1">
              {tx("Imagen https", "https image")}
              <input className="min-h-11 rounded border px-3" value={imageKey} onChange={(event) => setImageKey(event.target.value)} placeholder="https://" />
            </label>
            <button className="min-h-11 rounded border px-4 text-left" type="submit">
              {tx("Guardar ficha", "Save link card")}
            </button>
          </form>
          <article className="flex flex-col gap-2 rounded border p-3">
            {previewImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewImage} alt="" className="h-32 w-full object-cover" />
            ) : (
              <p>{tx("Sin vista previa. El enlace se publica igual.", "No preview. The link is still published.")}</p>
            )}
            <p className="font-semibold">{title || tx("Título de la ficha", "Link card title")}</p>
            <p>{description || tx("Descripción de la ficha", "Link card description")}</p>
          </article>
        </section>
      </div>
      {message ? <p className="note">{message}</p> : null}
      <form id="programar" className="sheet" onSubmit={schedule}>
        <h2 className="text-2xl">{tx("Programar", "Schedule")}</h2>
        <label className="flex flex-col gap-1">
          {tx("Página", "Page")}
          <select className="min-h-11 rounded border px-3" value={connectionId} onChange={(event) => setConnectionId(event.target.value)} required>
            <option value="">{tx("Elige una Página", "Choose a Page")}</option>
            {connections.map((connection) => (
              <option key={connection.id} value={connection.id}>
                {connection.externalAccountId} · {connection.status}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          {tx("Fecha", "Date")}
          <input className="min-h-11 rounded border px-3" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} required />
        </label>
        <button className="min-h-11 w-fit rounded bg-neutral-900 px-4 text-white" type="submit">
          {tx("Programar", "Schedule")}
        </button>
      </form>
      <section className="sheet">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl">{tx("Publicaciones", "Publications")}</h2>
          <button className="quiet" type="button" onClick={dispatch}>
            {tx("Publicar pendientes", "Publish pending")}
          </button>
        </div>
        {publications.length === 0 ? <p className="note">{tx("No hay publicaciones.", "There are no publications.")}</p> : null}
        <div className="flex flex-col gap-2">
          {publications.map((publication) => (
            <article key={publication.id} className="row">
              <span className="status">{publication.status}</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
