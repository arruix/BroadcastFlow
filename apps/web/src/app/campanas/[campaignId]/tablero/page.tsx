"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, explain, watchEvents } from "@/lib/api";

type Organization = { id: string };
type Campaign = { id: string; name: string; currency: string; slug: string };
type Origin = {
  origin: string;
  views: number;
  viewShare: number;
  clicks: number;
  clickRate: number;
  donations: number;
  donationRate: number;
  cpcMinor: number | null;
};
type Metrics = {
  excludedCount: number;
  cpcVisible: boolean;
  origins: Origin[];
  series: { day: string; views: number; clicks: number }[];
};
type Spend = { id: string; network: string; amountMinor: number; closed: boolean };

const networks = ["facebook", "instagram", "tiktok", "youtube", "x", "linkedin", "other"];

function today() {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function percent(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}

export default function TableroCampana({ params }: { params: Promise<{ campaignId: string }> }) {
  const [organizationId, setOrganizationId] = useState("");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(today());
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [network, setNetwork] = useState("facebook");
  const [amount, setAmount] = useState("10");
  const [spend, setSpend] = useState<Spend | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(
    async (org: string, campaignId: string, start: string, end: string) => {
      setMetrics(await api<Metrics>(`/campaigns/${campaignId}/metrics?from=${start}&to=${end}`, { org }));
    },
    [],
  );

  useEffect(() => {
    let stop = false;
    params
      .then(async ({ campaignId }) => {
        const organizations = await api<Organization[]>("/organizations");
        const org = organizations[0]?.id ?? "";
        if (stop) return;
        setOrganizationId(org);
        const campaigns = await api<Campaign[]>("/campaigns", { org });
        setCampaign(campaigns.find((row) => row.id === campaignId) ?? null);
        await load(org, campaignId, from, to);
      })
      .catch((error) => setMessage(explain(error)));
    return () => {
      stop = true;
    };
  }, [params, load, from, to]);

  useEffect(() => {
    if (!organizationId || !campaign) return;
    const controller = new AbortController();
    let timer = 0;
    const connect = () => {
      watchEvents(organizationId, () => {
        load(organizationId, campaign.id, from, to).catch((error) => setMessage(explain(error)));
      }, controller.signal).catch(() => {
        if (controller.signal.aborted) return;
        timer = window.setTimeout(connect, 2000);
      });
    };
    connect();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        load(organizationId, campaign.id, from, to).catch((error) => setMessage(explain(error)));
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [organizationId, campaign, from, to, load]);

  async function saveSpend(event: FormEvent) {
    event.preventDefault();
    if (!campaign) return;
    setMessage("");
    try {
      setSpend(
        await api<Spend>(`/campaigns/${campaign.id}/spend`, {
          method: "POST",
          org: organizationId,
          body: JSON.stringify({
            network,
            periodStart: from,
            periodEnd: to,
            amountMinor: Math.round(Number(amount) * 100),
            currency: campaign.currency,
          }),
        }),
      );
      await load(organizationId, campaign.id, from, to);
    } catch (error) {
      setMessage(explain(error));
    }
  }

  async function closeSpend() {
    if (!campaign || !spend) return;
    setMessage("");
    try {
      setSpend(await api<Spend>(`/campaigns/${campaign.id}/spend/${spend.id}/close`, { method: "POST", org: organizationId }));
    } catch (error) {
      setMessage(explain(error));
    }
  }

  const views = metrics?.origins.reduce((sum, row) => sum + row.views, 0) ?? 0;
  const clicks = metrics?.origins.reduce((sum, row) => sum + row.clicks, 0) ?? 0;
  const widest = Math.max(1, ...(metrics?.series.map((row) => row.views) ?? [1]));

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-semibold">{campaign?.name ?? "Tablero"}</h1>
      <form className="flex flex-col gap-3 sm:flex-row">
        <label className="flex flex-col gap-1">
          Desde
          <input className="min-h-11 rounded border px-3" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          Hasta
          <input className="min-h-11 rounded border px-3" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
      </form>
      <section className="grid gap-3 sm:grid-cols-3">
        <p className="rounded border p-4">Vistas {views}</p>
        <p className="rounded border p-4">Clics en Donar {clicks}</p>
        <p className="rounded border p-4">Excluidas {metrics?.excludedCount ?? 0}</p>
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Por día</h2>
          {metrics?.series.map((row) => (
            <div key={row.day} className="flex items-center gap-3">
              <span className="w-28 text-sm">{row.day}</span>
              <span className="h-3 rounded bg-neutral-900" style={{ width: `${Math.max(4, (row.views / widest) * 100)}%` }} />
              <span className="text-sm">
                {row.views} {row.views === 1 ? "vista" : "vistas"} · {row.clicks} {row.clicks === 1 ? "clic" : "clics"}
              </span>
            </div>
          ))}
        </section>
        <section className="overflow-x-auto">
          <h2 className="mb-3 text-xl font-semibold">Por red</h2>
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="py-2">Red</th>
                <th>Vistas</th>
                <th>% vistas</th>
                <th>Clics</th>
                <th>% clic</th>
                <th>% donó</th>
                {metrics?.cpcVisible ? <th>CPC</th> : null}
              </tr>
            </thead>
            <tbody>
              {metrics?.origins.map((row) => (
                <tr key={row.origin}>
                  <td className="py-2">{row.origin}</td>
                  <td>{row.views}</td>
                  <td>{percent(row.viewShare)}</td>
                  <td>{row.clicks}</td>
                  <td>{percent(row.clickRate)}</td>
                  <td>{percent(row.donationRate)}</td>
                  {metrics.cpcVisible ? <td>{row.cpcMinor === null ? "—" : (row.cpcMinor / 100).toFixed(2)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      {message ? <p>{message}</p> : null}
      {metrics?.cpcVisible && campaign ? (
        <form className="flex flex-col gap-4 rounded border p-4" onSubmit={saveSpend}>
          <h2 className="text-xl font-semibold">Gasto de pauta</h2>
          <p>No es un asiento del libro. El directo no tiene CPC.</p>
          <label className="flex flex-col gap-1">
            Red
            <select className="min-h-11 rounded border px-3" value={network} onChange={(event) => setNetwork(event.target.value)}>
              {networks.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Monto en {campaign.currency}
            <input className="min-h-11 rounded border px-3" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </label>
          <button className="min-h-11 rounded bg-neutral-900 px-4 text-white" type="submit">
            Cargar gasto
          </button>
          {spend ? (
            <button className="min-h-11 rounded border px-4 text-left" type="button" onClick={closeSpend} disabled={spend.closed}>
              {spend.closed ? "Periodo cerrado" : "Cerrar periodo"}
            </button>
          ) : null}
        </form>
      ) : null}
      {campaign ? (
        <Link className="inline-flex min-h-11 items-center" href={`/c/${campaign.slug}`}>
          Ver página pública
        </Link>
      ) : null}
    </main>
  );
}
