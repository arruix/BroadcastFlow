"use client";

import Link from "next/link";
import { demoMode } from "@/lib/demo";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { fill, useTx } from "@/lib/i18n";
import { api, download, explain, watchEvents } from "@/lib/api";
import { originColor, originLabel } from "@/lib/origen";

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
type Conversion = {
  origins: { origin: string; visitors: number; pledges: number; amountMinor: number; conversion: number; payLinkClicks: number; payTransferViews: number }[];
  rows: {
    origin: string;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    utmContent: string | null;
    visitors: number;
    pledges: number;
    conversion: number;
    payLinkClicks: number;
    payTransferViews: number;
  }[];
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
  const [conversion, setConversion] = useState<Conversion | null>(null);
  const [network, setNetwork] = useState("facebook");
  const [amount, setAmount] = useState("10");
  const [spend, setSpend] = useState<Spend | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(
    async (org: string, campaignId: string, start: string, end: string) => {
      const query = `from=${start}&to=${end}`;
      const [nextMetrics, nextConversion] = await Promise.all([
        api<Metrics>(`/campaigns/${campaignId}/metrics?${query}`, { org }),
        api<Conversion>(`/campaigns/${campaignId}/conversion?${query}`, { org }),
      ]);
      setMetrics(nextMetrics);
      setConversion(nextConversion);
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

  async function exportConversion() {
    if (!campaign) return;
    setMessage("");
    try {
      const blob = await download(`/campaigns/${campaign.id}/conversion.csv?from=${from}&to=${to}`, organizationId);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `conversion-${campaign.slug}-${from}-${to}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
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
  const visitors = conversion?.origins.reduce((sum, row) => sum + row.visitors, 0) ?? 0;
  const pledges = conversion?.origins.reduce((sum, row) => sum + row.pledges, 0) ?? 0;
  const widest = Math.max(1, ...(metrics?.series.map((row) => row.views) ?? [1]));

  return (
    <main className="console-page">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <p className="eyebrow">{tx("Resultados", "Results")}</p>
          <h1 className="text-4xl">{campaign?.name ?? tx("Resultados", "Results")}</h1>
        </div>
        {campaign ? (
          <Link className="chip" href={`/c/${campaign.slug}`}>
            {tx("Ver página pública", "See the public page")}
          </Link>
        ) : null}
      </header>
      {demoMode ? null : (
      <div className="flex items-start gap-3 rounded-2xl border border-teal-100 bg-teal-50/60 p-4 shadow-2xs">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-700 text-white shadow-2xs">
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
      )}
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
            <p>{tx("Publica el contenido o el aviso. Sin aviso publicado no hay medición ni botón Donar.", "Publish the piece or the notice. Without a published notice there is no measurement and no Donate button.")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="inline-flex min-h-11 items-center rounded bg-neutral-900 px-4 text-white" href={`/campanas/${campaign.id}`}>
              {tx("Aviso", "Notice")}
            </Link>
            <Link className="chip" href={`/campanas/${campaign.id}/pieza`}>{tx("Pieza para redes", "Social piece")}</Link>
            {demoMode ? null : <Link className="chip" href="/conexiones">{tx("Conexiones", "Connections")}</Link>}
          </div>
        </section>
      ) : null}
      <section className="stat-grid">
        <article className="stat">
          <p className="stat-label">{tx("Visitas", "Visits")}</p>
          <p className="stat-value">{views}</p>
        </article>
        <article className="stat">
          <p className="stat-label">{tx("Quisieron donar", "Wanted to donate")}</p>
          <p className="stat-value">{clicks}</p>
          <p className="text-xs text-[var(--muted)]">{tx("Tocaron Donar, el enlace de pago o la CLABE", "Tapped Donate, the payment link, or the CLABE")}</p>
        </article>
        <article className="stat">
          <p className="stat-label">{tx("Donativos registrados", "Recorded donations")}</p>
          <p className="stat-value">{pledges}</p>
          <p className="text-xs text-[var(--muted)]">{fill(tx("{p} de quienes visitaron", "{p} of visitors"), { p: visitors > 0 ? percent(pledges / visitors) : "—" })}</p>
        </article>
        <article className="stat">
          <p className="stat-label">
            {tx("Visitas no contadas", "Uncounted visits")}{" "}
            <span
              className="info"
              tabIndex={0}
              title={tx("Visitas de robots, del propio equipo o repetidas en pocos segundos. No suman en los resultados.", "Visits from bots, your own team, or repeats within seconds. They are left out of the results.")}
              aria-label={tx("Qué son las visitas no contadas", "What uncounted visits are")}
            >
              ⓘ
            </span>
          </p>
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
                {row.views} {row.views === 1 ? tx("visita", "visit") : tx("visitas", "visits")} · {row.clicks} {tx("quisieron donar", "wanted to donate")}
              </span>
            </div>
          ))}
        </section>
        <section className="sheet">
          <h2 className="text-2xl">{tx("Por red", "By network")}</h2>
          <div className="flex flex-col gap-3">
            {metrics?.origins.map((row) => {
              const pledged = conversion?.origins.find((item) => item.origin === row.origin)?.pledges ?? 0;
              return (
                <div key={row.origin} className="net-row">
                  <span className="net-label">
                    <i className="net-dot" style={{ background: originColor(row.origin) }} />
                    {originLabel(row.origin, tx)}
                  </span>
                  <span className="day-track">
                    <span className="day-fill" style={{ width: `${Math.max(3, row.viewShare * 100)}%`, background: originColor(row.origin) }} />
                  </span>
                  <span className="text-sm text-[var(--muted)]">
                    {row.views} {tx("visitas", "visits")} · {row.clicks} {tx("quisieron donar", "wanted to donate")} · {pledged} {tx("donativos", "donations")}
                  </span>
                </div>
              );
            })}
          </div>
          {metrics?.origins.some((row) => row.origin === "other") ? (
            <p className="mt-2 text-xs text-[var(--muted)]">
              {tx("“Otros” agrupa WhatsApp, Telegram y fuentes sin red social; el desglose está en Ver detalle.", "“Other” groups WhatsApp, Telegram and non-social sources; see the detail below.")}
            </p>
          ) : null}
        </section>
      </div>
      <details className="sheet detail-box">
        <summary className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xl font-semibold">{tx("Ver detalle", "See detail")}</span>
          <span className="text-sm text-[var(--muted)]">{tx("Conversión, pagos, costo por clic y enlaces con UTM", "Conversion, payments, cost per click, and UTM links")}</span>
        </summary>
        <div className="flex justify-end">
          <button className="quiet w-fit" type="button" onClick={exportConversion}>
            {tx("Exportar CSV", "Export CSV")}
          </button>
        </div>
        <h3 className="text-lg font-semibold">{tx("Por red", "By network")}</h3>
        <div className="table-scroll">
          <table className="data-table cards-mobile">
            <thead>
              <tr>
                <th>{tx("Red", "Network")}</th>
                <th className="num">{tx("Personas", "People")}</th>
                <th className="num">{tx("Donativos", "Donations")}</th>
                <th className="num">{tx("Monto", "Amount")}</th>
                <th className="num">{metrics?.cpcVisible ? tx("Costo por clic", "Cost per click") : tx("Conversión", "Conversion")}</th>
              </tr>
            </thead>
            <tbody>
              {conversion?.origins.map((row) => {
                const cpc = metrics?.origins.find((item) => item.origin === row.origin)?.cpcMinor ?? null;
                return (
                  <tr key={row.origin}>
                    <td data-label={tx("Red", "Network")}>{originLabel(row.origin, tx)}</td>
                    <td data-label={tx("Personas", "People")} className="num">{row.visitors}</td>
                    <td data-label={tx("Donativos", "Donations")} className="num">
                      {row.pledges} <span className="text-xs text-[var(--muted)]">({percent(row.conversion)})</span>
                    </td>
                    <td data-label={tx("Monto", "Amount")} className="num">{(row.amountMinor / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td>
                    <td data-label={metrics?.cpcVisible ? tx("Costo por clic", "Cost per click") : tx("Conversión", "Conversion")} className="num">{metrics?.cpcVisible ? (cpc === null ? "—" : (cpc / 100).toFixed(2)) : percent(row.conversion)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <h3 className="text-lg font-semibold">{tx("Cómo pagaron", "How they paid")}</h3>
        <div className="table-scroll">
          <table className="data-table cards-mobile">
            <thead>
              <tr>
                <th>{tx("Red", "Network")}</th>
                <th className="num">{tx("Abrieron enlace de pago", "Opened payment link")}</th>
                <th className="num">{tx("Vieron la CLABE", "Saw the CLABE")}</th>
              </tr>
            </thead>
            <tbody>
              {conversion?.origins.map((row) => (
                <tr key={row.origin}>
                  <td data-label={tx("Red", "Network")}>{originLabel(row.origin, tx)}</td>
                  <td data-label={tx("Abrieron enlace de pago", "Opened payment link")} className="num">{row.payLinkClicks}</td>
                  <td data-label={tx("Vieron la CLABE", "Saw the CLABE")} className="num">{row.payTransferViews}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {conversion && conversion.rows.some((row) => row.utmCampaign) ? (
          <>
            <h3 className="text-lg font-semibold">{tx("Por enlace (UTM)", "By link (UTM)")}</h3>
            <div className="table-scroll">
              <table className="data-table cards-mobile">
                <thead>
                  <tr>
                    <th>{tx("Fuente / medio", "Source / medium")}</th>
                    <th>{tx("Campaña / contenido", "Campaign / content")}</th>
                    <th className="num">{tx("Personas", "People")}</th>
                    <th className="num">{tx("Donativos", "Donations")}</th>
                    <th className="num">{tx("Pagos abiertos", "Payments opened")}</th>
                  </tr>
                </thead>
                <tbody>
                  {conversion.rows.map((row, index) => (
                    <tr key={index}>
                      <td data-label={tx("Fuente / medio", "Source / medium")}>{row.utmSource ?? "—"} / {row.utmMedium ?? "—"}</td>
                      <td data-label={tx("Campaña / contenido", "Campaign / content")}>{row.utmCampaign ?? "—"}{row.utmContent ? ` / ${row.utmContent}` : ""}</td>
                      <td data-label={tx("Personas", "People")} className="num">{row.visitors}</td>
                      <td data-label={tx("Donativos", "Donations")} className="num">
                        {row.pledges} <span className="text-xs text-[var(--muted)]">({percent(row.conversion)})</span>
                      </td>
                      <td data-label={tx("Pagos abiertos", "Payments opened")} className="num">{row.payLinkClicks + row.payTransferViews}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </details>
      {message ? <p className="note">{message}</p> : null}
      {metrics?.cpcVisible && campaign ? (
        <form id="gasto" className="sheet" onSubmit={saveSpend}>
          <h2 className="text-2xl">{tx("Gasto en anuncios", "Ad spend")}</h2>
          <p className="lede">{tx("Anota lo que pagaste en anuncios para calcular el costo por clic. No es un movimiento de dinero de la campaña. Las transmisiones en vivo no tienen costo por clic.", "Enter what you paid for ads to work out the cost per click. It is not a money movement of the campaign. Live streams have no cost per click.")}</p>
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
            {tx("Guardar gasto", "Save spend")}
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
