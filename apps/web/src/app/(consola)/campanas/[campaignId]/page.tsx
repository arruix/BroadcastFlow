"use client";

import { FormEvent, useEffect, useState } from "react";
import { useTx } from "@/lib/i18n";
import { api, explain } from "@/lib/api";
import { MetodoPagoForm, type CampaignPaymentMethod } from "./metodo-pago-form";

type Organization = { id: string };
type Campaign = { id: string; name: string; status: string; slug: string; kind: string; paymentMethod?: CampaignPaymentMethod };
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
  const { t, tx } = useTx();
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
    <main className="console-page">
      <header className="flex flex-col gap-2">
        <p className="eyebrow">{tx("Campaña", "Campaign")}</p>
        <h1 className="text-4xl">{campaign?.name ?? tx("Aviso", "Notice")}</h1>
        {campaign ? (
          <p className="flex flex-wrap gap-2">
            <span className="status">{(t.kind as Record<string, string>)[campaign.kind] ?? campaign.kind}</span>
            <span className={`status status-${campaign.status}`}>{(t.status as Record<string, string>)[campaign.status] ?? campaign.status}</span>
          </p>
        ) : null}
      </header>
      <details className="sheet notice-box" open={!notice?.publishedAt}>
        <summary className="notice-summary">
          <span className="font-semibold">{tx("Aviso de privacidad", "Privacy notice")}</span>
          <span className="text-sm text-[var(--muted)]">
            {notice?.publishedAt
              ? tx(`Versión ${notice.version} publicada`, `Version ${notice.version} published`)
              : notice
                ? tx(`Versión ${notice.version} en borrador`, `Version ${notice.version} in draft`)
                : tx("Pendiente: dinos quién recibe los datos de quienes donan y para qué", "Pending: who receives donors' data and why")}
          </span>
        </summary>
      <form className="flex flex-col gap-4 pt-4" onSubmit={save}>
        <label className="flex flex-col gap-1">
          {tx("Responsable (persona u organización)", "Controller (person or organization)")}
          <input className="min-h-11 rounded border px-3" value={controller} onChange={(event) => setController(event.target.value)} required />
        </label>
        <label className="flex flex-col gap-1">
          {tx("Finalidad", "Purpose")}
          <input className="min-h-11 rounded border px-3" value={purpose} onChange={(event) => setPurpose(event.target.value)} required />
        </label>
        <label className="flex flex-col gap-1">
          {tx("Datos que se piden", "Data collected")}
          <input className="min-h-11 rounded border px-3" value={dataCategories} onChange={(event) => setDataCategories(event.target.value)} required />
        </label>
        <label className="flex flex-col gap-1">
          {tx("Plazo de conservación", "Retention period")}
          <input className="min-h-11 rounded border px-3" value={retention} onChange={(event) => setRetention(event.target.value)} required />
        </label>
        {message ? <p className="note">{message}</p> : null}
        <button className="min-h-11 rounded bg-neutral-900 px-4 text-white" type="submit">
          {tx("Guardar borrador", "Save draft")}
        </button>
      </form>
      </details>
      <div className="flex flex-wrap gap-2">
        {notice && !notice.publishedAt ? (
          <button className="quiet" type="button" onClick={publish}>
            {tx(`Publicar versión ${notice.version}`, `Publish version ${notice.version}`)}
          </button>
        ) : null}
        {campaign?.status === "borrador" && campaign.kind !== "electoral" ? (
          <button className="min-h-11 w-fit rounded bg-neutral-900 px-4 text-white" type="button" onClick={activate}>
            {tx("Activar campaña", "Activate campaign")}
          </button>
        ) : null}
      </div>
      {campaign ? <MetodoPagoForm key={campaign.id} campaignId={campaign.id} organizationId={organizationId} initial={campaign.paymentMethod ?? null} /> : null}
      {campaign?.kind === "electoral" ? <p className="note">{tx("La electoral permanece en borrador hasta que exista el paquete.", "The electoral campaign stays in draft until the package exists.")}</p> : null}
    </main>
  );
}
