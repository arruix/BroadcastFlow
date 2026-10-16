"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { api, explain } from "@/lib/api";

type Organization = { id: string };
type Campaign = { id: string; name: string; status: string; slug: string; kind: string };
type Notice = {
  id: string;
  version: number;
  controller: string;
  purpose: string;
  dataCategories: string;
  retention: string;
  publishedAt: string | null;
};

export default function Aviso({ params }: { params: Promise<{ campaignId: string }> }) {
  const [organizationId, setOrganizationId] = useState("");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [controller, setController] = useState("");
  const [purpose, setPurpose] = useState("");
  const [dataCategories, setDataCategories] = useState("");
  const [retention, setRetention] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    params.then(async ({ campaignId }) => {
      const organizations = await api<Organization[]>("/organizations");
      const org = organizations[0]?.id ?? "";
      setOrganizationId(org);
      const campaigns = await api<Campaign[]>("/campaigns", { org });
      const current = campaigns.find((item) => item.id === campaignId) ?? null;
      setCampaign(current);
      const notices = await api<Notice[]>(`/campaigns/${campaignId}/privacy-notices`, { org });
      const latest = notices[0] ?? null;
      setNotice(latest);
      if (latest && !latest.publishedAt) {
        setController(latest.controller);
        setPurpose(latest.purpose);
        setDataCategories(latest.dataCategories);
        setRetention(latest.retention);
      }
    }).catch((error) => setMessage(explain(error)));
  }, [params]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!campaign) return;
    setMessage("");
    try {
      const saved = await api<Notice>(`/campaigns/${campaign.id}/privacy-notices`, {
        method: "POST",
        org: organizationId,
        body: JSON.stringify({ controller, purpose, dataCategories, retention }),
      });
      setNotice(saved);
    } catch (error) {
      setMessage(explain(error));
    }
  }

  async function publish() {
    if (!campaign || !notice) return;
    setMessage("");
    try {
      setNotice(await api<Notice>(`/campaigns/${campaign.id}/privacy-notices/${notice.id}/publish`, { method: "POST", org: organizationId }));
    } catch (error) {
      setMessage(explain(error));
    }
  }

  async function activate() {
    if (!campaign) return;
    setMessage("");
    try {
      setCampaign(await api<Campaign>(`/campaigns/${campaign.id}/activate`, { method: "POST", org: organizationId }));
    } catch (error) {
      setMessage(explain(error));
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-semibold">{campaign?.name ?? "Aviso"}</h1>
      {campaign ? (
        <p>
          {campaign.kind} · {campaign.status}
        </p>
      ) : null}
      <form className="flex flex-col gap-4" onSubmit={save}>
        <label className="flex flex-col gap-1">
          Responsable
          <input className="min-h-11 rounded border px-3" value={controller} onChange={(event) => setController(event.target.value)} required />
        </label>
        <label className="flex flex-col gap-1">
          Finalidad
          <input className="min-h-11 rounded border px-3" value={purpose} onChange={(event) => setPurpose(event.target.value)} required />
        </label>
        <label className="flex flex-col gap-1">
          Datos
          <input className="min-h-11 rounded border px-3" value={dataCategories} onChange={(event) => setDataCategories(event.target.value)} required />
        </label>
        <label className="flex flex-col gap-1">
          Plazo
          <input className="min-h-11 rounded border px-3" value={retention} onChange={(event) => setRetention(event.target.value)} required />
        </label>
        {message ? <p>{message}</p> : null}
        <button className="min-h-11 rounded bg-neutral-900 px-4 text-white" type="submit">
          Guardar borrador
        </button>
      </form>
      {notice && !notice.publishedAt ? (
        <button className="min-h-11 rounded border px-4 text-left" type="button" onClick={publish}>
          Publicar versión {notice.version}
        </button>
      ) : null}
      {notice?.publishedAt ? <p>Versión {notice.version} publicada.</p> : null}
      {campaign?.status === "borrador" && campaign.kind !== "electoral" ? (
        <button className="min-h-11 rounded border px-4 text-left" type="button" onClick={activate}>
          Activar campaña
        </button>
      ) : null}
      {campaign?.kind === "electoral" ? <p>La electoral permanece en borrador hasta que exista el paquete.</p> : null}
      {campaign ? (
        <Link className="inline-flex min-h-11 items-center" href={`/campanas/${campaign.id}/tablero`}>
          Tablero
        </Link>
      ) : null}
      {campaign ? (
        <Link className="inline-flex min-h-11 items-center" href={`/campanas/${campaign.id}/pieza`}>
          Pieza y ficha
        </Link>
      ) : null}
      {campaign ? (
        <Link className="inline-flex min-h-11 items-center" href={`/c/${campaign.slug}`}>
          Ver página pública
        </Link>
      ) : null}
    </main>
  );
}
