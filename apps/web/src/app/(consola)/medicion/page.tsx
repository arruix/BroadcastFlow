"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fill, useTx } from "@/lib/i18n";
import { api, explain, signedIn } from "@/lib/api";
import { originColor, originLabel } from "@/lib/origen";

type Campaign = { id: string; name: string; slug: string; status?: string };
type Metrics = { excludedCount: number; origins: { origin: string; views: number; clicks: number }[] };
type Conversion = {
  origins: { origin: string; visitors: number; pledges: number; amountMinor: number; payLinkClicks: number; payTransferViews: number }[];
};
type Summary = {
  campaign: Campaign;
  views: number;
  intent: number;
  visitors: number;
  pledges: number;
  payLink: number;
  payTransfer: number;
  topOrigin: string | null;
  error?: string;
};

function isoDay(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() - offset);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function percent(part: number, whole: number) {
  return whole > 0 ? `${Math.round((part / whole) * 1000) / 10}%` : "—";
}

const ranges = [7, 30, 90];

// Resumen de medición de todas las campañas: suma métricas y conversión por campaña.
export default function Medicion() {
  const { tx } = useTx();
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<Summary[] | null>(null);
  const [message, setMessage] = useState("");
  const [entered, setEntered] = useState(true);

  useEffect(() => {
    let alive = true;
    if (!signedIn()) {
      setEntered(false);
      return;
    }
    const query = `from=${isoDay(days - 1)}&to=${isoDay(0)}`;
    api<{ id: string }[]>("/organizations")
      .then(async (organizations) => {
        const org = organizations[0]?.id;
        if (!org) return [] as Summary[];
        const campaigns = await api<Campaign[]>("/campaigns", { org });
        return Promise.all(
          campaigns.map(async (campaign): Promise<Summary> => {
            try {
              const [metrics, conversion] = await Promise.all([
                api<Metrics>(`/campaigns/${campaign.id}/metrics?${query}`, { org }),
                api<Conversion>(`/campaigns/${campaign.id}/conversion?${query}`, { org }),
              ]);
              const top = [...conversion.origins].sort((a, b) => b.visitors - a.visitors)[0];
              return {
                campaign,
                views: metrics.origins.reduce((sum, row) => sum + row.views, 0),
                intent: metrics.origins.reduce((sum, row) => sum + row.clicks, 0),
                visitors: conversion.origins.reduce((sum, row) => sum + row.visitors, 0),
                pledges: conversion.origins.reduce((sum, row) => sum + row.pledges, 0),
                payLink: conversion.origins.reduce((sum, row) => sum + row.payLinkClicks, 0),
                payTransfer: conversion.origins.reduce((sum, row) => sum + row.payTransferViews, 0),
                topOrigin: top && top.visitors > 0 ? top.origin : null,
              };
            } catch (error) {
              return { campaign, views: 0, intent: 0, visitors: 0, pledges: 0, payLink: 0, payTransfer: 0, topOrigin: null, error: explain(error) };
            }
          }),
        );
      })
      .then((next) => {
        if (alive) setRows(next);
      })
      .catch((error) => {
        if (alive) setMessage(explain(error));
      });
    return () => {
      alive = false;
    };
  }, [days]);

  const total = (rows ?? []).reduce(
    (sum, row) => ({
      views: sum.views + row.views,
      intent: sum.intent + row.intent,
      visitors: sum.visitors + row.visitors,
      pledges: sum.pledges + row.pledges,
    }),
    { views: 0, intent: 0, visitors: 0, pledges: 0 },
  );
  const leader = [...(rows ?? [])].filter((row) => row.topOrigin).sort((x, y) => y.views - x.views)[0]?.topOrigin ?? null;

  return (
    <main className="console-page">
      <header className="flex flex-col gap-2">
        <p className="eyebrow">{tx("Resultados", "Results")}</p>
        <h1 className="text-4xl">{tx("Resultados de tus campañas", "Your campaign results")}</h1>
        <p className="lede">
          {tx(
            "Cuántas personas vieron tus campañas, cuántas quisieron donar y cuántas registraron su donativo. Abre cada campaña para ver el detalle por red.",
            "How many people saw your campaigns, how many wanted to donate, and how many recorded a donation. Open each campaign for the detail by network.",
          )}
        </p>
      </header>
      {!entered ? (
        <Link className="btn-primary w-fit" href="/ingresar">
          {tx("Ingresar", "Sign in")}
        </Link>
      ) : null}
      {entered ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label={tx("Periodo", "Period")}>
          {ranges.map((range) => (
            <button key={range} type="button" className="chip" aria-pressed={days === range} onClick={() => setDays(range)}>
              {tx(`Últimos ${range} días`, `Last ${range} days`)}
            </button>
          ))}
        </div>
      ) : null}
      {entered && rows === null && !message ? <p className="note">{tx("Cargando…", "Loading…")}</p> : null}
      {rows && rows.length === 0 ? (
        <section className="empty-act">
          <p>{tx("Todavía no tienes campañas.", "You have no campaigns yet.")}</p>
          <Link className="btn-primary" href="/campanas/nueva">
            {tx("Crear campaña", "Create campaign")}
          </Link>
        </section>
      ) : null}
      {rows && rows.length > 0 ? (
        <>
          <section className="medicion-totales">
            <article className="stat">
              <p className="stat-label">{tx("Visitas", "Visits")}</p>
              <p className="stat-value">{total.views.toLocaleString("es-MX")}</p>
              <p className="text-xs text-[var(--muted)]">{fill(tx("{n} personas distintas", "{n} different people"), { n: total.visitors.toLocaleString("es-MX") })}</p>
            </article>
            <article className="stat">
              <p className="stat-label">{tx("Quisieron donar", "Wanted to donate")}</p>
              <p className="stat-value">{total.intent.toLocaleString("es-MX")}</p>
              <p className="text-xs text-[var(--muted)]">{tx("Tocaron el botón Donar", "Tapped the Donate button")}</p>
            </article>
            <article className="stat">
              <p className="stat-label">{tx("Donativos registrados", "Recorded donations")}</p>
              <p className="stat-value">{total.pledges.toLocaleString("es-MX")}</p>
              <p className="text-xs text-[var(--muted)]">{fill(tx("{p} de quienes visitaron", "{p} of visitors"), { p: percent(total.pledges, total.visitors) })}</p>
            </article>
            <article className="stat">
              <p className="stat-label">{tx("Red principal", "Top network")}</p>
              <p className="stat-value">{leader ? originLabel(leader, tx) : "—"}</p>
              <p className="text-xs text-[var(--muted)]">{tx("De donde llegó más gente", "Where most people came from")}</p>
            </article>
          </section>
          <section className="sheet">
            <h2 className="text-2xl">{tx("Por campaña", "By campaign")}</h2>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{tx("Campaña", "Campaign")}</th>
                    <th className="num">{tx("Visitas", "Visits")}</th>
                    <th className="num">{tx("Quisieron donar", "Wanted to donate")}</th>
                    <th className="num">{tx("Donativos", "Donations")}</th>
                    <th>{tx("Red principal", "Top network")}</th>
                    <th><span className="sr-only">{tx("Detalle", "Detail")}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.campaign.id}>
                      <td className="font-semibold">{row.campaign.name}</td>
                      <td className="num">{row.views}</td>
                      <td className="num">{row.intent}</td>
                      <td className="num">
                        {row.pledges} <span className="text-xs text-[var(--muted)]">({percent(row.pledges, row.visitors)})</span>
                      </td>
                      <td>{row.topOrigin ? <span className="net-label"><i className="net-dot" style={{ background: originColor(row.topOrigin) }} />{originLabel(row.topOrigin, tx)}</span> : "—"}</td>
                      <td>
                        {row.error ? (
                          <span className="text-xs text-[var(--muted)]">{row.error}</span>
                        ) : (
                          <Link className="chip" href={`/campanas/${row.campaign.id}/tablero`}>
                            {tx("Ver detalle", "See detail")}
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
      {message ? <p className="note">{message}</p> : null}
    </main>
  );
}
