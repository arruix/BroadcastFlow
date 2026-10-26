"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTx } from "@/lib/i18n";
import { api, explain, signedIn } from "@/lib/api";
import { originLabel } from "@/lib/origen";

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

  return (
    <main className="console-page">
      <header className="flex flex-col gap-2">
        <p className="eyebrow">{tx("Medición", "Measurement")}</p>
        <h1 className="text-4xl">{tx("Resumen de medición", "Measurement overview")}</h1>
        <p className="lede">
          {tx(
            "Vistas, intención de donar e intenciones registradas de todas tus campañas. Abre el tablero de cada una para ver el detalle por red y UTM.",
            "Views, donate intent and recorded pledges across your campaigns. Open each dashboard for the network and UTM detail.",
          )}
        </p>
      </header>
      {!entered ? (
        <Link className="inline-flex min-h-11 w-fit items-center rounded bg-neutral-900 px-4 text-white" href="/ingresar">
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
          <Link className="inline-flex min-h-11 items-center rounded bg-neutral-900 px-4 text-white" href="/campanas/nueva">
            {tx("Nueva campaña", "New campaign")}
          </Link>
        </section>
      ) : null}
      {rows && rows.length > 0 ? (
        <>
          <section className="medicion-totales">
            <article className="stat">
              <p className="stat-label">{tx("Vistas", "Views")}</p>
              <p className="stat-value">{total.views}</p>
            </article>
            <article className="stat">
              <p className="stat-label">{tx("Visitantes únicos", "Unique visitors")}</p>
              <p className="stat-value">{total.visitors}</p>
            </article>
            <article className="stat">
              <p className="stat-label">{tx("Intención de donar (clics)", "Donate intent (clicks)")}</p>
              <p className="stat-value">{total.intent}</p>
            </article>
            <article className="stat">
              <p className="stat-label">{tx("Intenciones registradas", "Recorded pledges")}</p>
              <p className="stat-value">{total.pledges}</p>
              <p className="text-xs text-[var(--muted)]">{tx("Conversión", "Conversion")} {percent(total.pledges, total.visitors)}</p>
            </article>
          </section>
          <section className="sheet overflow-x-auto">
            <h2 className="text-2xl">{tx("Por campaña", "By campaign")}</h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{tx("Campaña", "Campaign")}</th>
                  <th>{tx("Vistas", "Views")}</th>
                  <th>{tx("Visitantes", "Visitors")}</th>
                  <th>{tx("Intención (clics)", "Intent (clicks)")}</th>
                  <th>{tx("Enlace de pago", "Payment link")}</th>
                  <th>{tx("Vistas CLABE", "CLABE views")}</th>
                  <th>{tx("Intenciones", "Pledges")}</th>
                  <th>{tx("Conversión", "Conversion")}</th>
                  <th>{tx("Origen principal", "Top origin")}</th>
                  <th><span className="sr-only">{tx("Tablero", "Dashboard")}</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.campaign.id}>
                    <td className="font-semibold">{row.campaign.name}</td>
                    <td>{row.views}</td>
                    <td>{row.visitors}</td>
                    <td>{row.intent}</td>
                    <td>{row.payLink}</td>
                    <td>{row.payTransfer}</td>
                    <td>{row.pledges}</td>
                    <td>{percent(row.pledges, row.visitors)}</td>
                    <td>{row.topOrigin ? originLabel(row.topOrigin, tx) : "—"}</td>
                    <td>
                      {row.error ? (
                        <span className="text-xs text-[var(--muted)]">{row.error}</span>
                      ) : (
                        <Link className="chip" href={`/campanas/${row.campaign.id}/tablero`}>
                          {tx("Ver tablero", "Open dashboard")}
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      ) : null}
      {message ? <p className="note">{message}</p> : null}
    </main>
  );
}
