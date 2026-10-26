"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useTx } from "@/lib/i18n";
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
  const { tx } = useTx();
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
    <main className="console-page">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <p className="eyebrow">{tx("Campaña", "Campaign")}</p>
          <h1 className="text-4xl">{campaign?.name ?? tx("Tablero", "Board")}</h1>
        </div>
        {campaign ? (
          <Link className="chip" href={`/c/${campaign.slug}`}>
            {tx("Ver página pública", "See the public page")}
          </Link>
        ) : null}
      </header>
      <div className="flex items-start gap-3 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/80 via-white to-violet-50/60 p-4 shadow-2xs">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-2xs">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-slate-900">
            {tx("Regla de difusión en redes sociales", "Social media broadcast rule")}
          </span>
          <p className="text-xs text-slate-600">
            {tx(
              "Entre más donaciones se registren, más tiempo permanecerá la campaña activa y con mayor presencia y pauta en las redes sociales conectadas.",
              "The more donations recorded, the longer the campaign will remain active with greater presence and broadcast time across connected social networks."
            )}
          </p>
        </div>
      </div>
      <form className="fields">
        <label className="flex flex-col gap-1">
          {tx("Desde", "From")}
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          {tx("Hasta", "To")}
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
      </form>
      {campaign && views === 0 && clicks === 0 ? (
        <section className="empty-act">
          <div>
            <h2 className="text-2xl">{tx("Esta semana no hay vistas ni clics.", "This week has no views or clicks.")}</h2>
            <p>{tx("Publica la pieza o el aviso. Sin aviso publicado no hay medición ni botón Donar.", "Publish the piece or the notice. Without a published notice there is no measurement and no Donate button.")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="inline-flex min-h-11 items-center rounded bg-neutral-900 px-4 text-white" href={`/campanas/${campaign.id}`}>
              {tx("Aviso", "Notice")}
            </Link>
            <Link className="chip" href={`/campanas/${campaign.id}/pieza`}>{tx("Pieza", "Piece")}</Link>
            <Link className="chip" href="/conexiones">{tx("Conexiones", "Connections")}</Link>
          </div>
        </section>
      ) : null}
      <section className="stat-grid">
        <article className="stat">
          <p className="stat-label">{tx("Vistas", "Views")}</p>
          <p className="stat-value">{views}</p>
        </article>
        <article className="stat">
          <p className="stat-label">{tx("Clics en Donar", "Donate clicks")}</p>
          <p className="stat-value">{clicks}</p>
        </article>
        <article className="stat">
          <p className="stat-label">{tx("Excluidas", "Excluded")}</p>
          <p className="stat-value">{metrics?.excludedCount ?? 0}</p>
        </article>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="sheet">
          <h2 className="text-2xl">{tx("Por día", "By day")}</h2>
          {metrics?.series.map((row) => (
            <div key={row.day} className="day-row">
              <span className="text-sm text-[var(--muted)]">{row.day}</span>
              <span className="day-track"><span className="day-fill" style={{ width: `${Math.max(4, (row.views / widest) * 100)}%` }} /></span>
              <span className="text-sm">
                {row.views} {row.views === 1 ? tx("vista", "view") : tx("vistas", "views")} · {row.clicks} {row.clicks === 1 ? tx("clic", "click") : tx("clics", "clicks")}
              </span>
            </div>
          ))}
        </section>
        <section className="sheet overflow-x-auto">
          <h2 className="text-2xl">{tx("Por red", "By network")}</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>{tx("Red", "Network")}</th>
                <th>{tx("Vistas", "Views")}</th>
                <th>{tx("% vistas", "% views")}</th>
                <th>{tx("Clics", "Clicks")}</th>
                <th>{tx("% clic", "% click")}</th>
                <th>{tx("% donó", "% donated")}</th>
                {metrics?.cpcVisible ? <th>CPC</th> : null}
              </tr>
            </thead>
            <tbody>
              {metrics?.origins.map((row) => (
                <tr key={row.origin}>
                  <td>{row.origin}</td>
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
      {message ? <p className="note">{message}</p> : null}
      {metrics?.cpcVisible && campaign ? (
        <form id="gasto" className="sheet" onSubmit={saveSpend}>
          <h2 className="text-2xl">{tx("Gasto de pauta", "Ad spend")}</h2>
          <p className="lede">{tx("No es un asiento del libro. El directo no tiene CPC.", "It is not a ledger entry. Live has no CPC.")}</p>
          <label className="flex flex-col gap-1">
            {tx("Red", "Network")}
            <select className="min-h-11 rounded border px-3" value={network} onChange={(event) => setNetwork(event.target.value)}>
              {networks.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            {tx("Monto en", "Amount in")} {campaign.currency}
            <input className="min-h-11 rounded border px-3" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </label>
          <button className="min-h-11 rounded bg-neutral-900 px-4 text-white" type="submit">
            {tx("Cargar gasto", "Load spend")}
          </button>
          {spend ? (
            <button className="quiet w-fit" type="button" onClick={closeSpend} disabled={spend.closed}>
              {spend.closed ? tx("Periodo cerrado", "Period closed") : tx("Cerrar periodo", "Close period")}
            </button>
          ) : null}
        </form>
      ) : null}
    </main>
  );
}
