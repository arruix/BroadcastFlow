"use client";

import { useEffect, useState } from "react";
import { useTx } from "@/lib/i18n";
import { api } from "@/lib/api";
import { originColor, originLabel } from "@/lib/origen";
import type { CampaignCard } from "../tarjetas";

type Metrics = { origins: { origin: string; views: number; clicks: number }[]; series: { day: string; views: number; clicks: number }[] };
type Conversion = { origins: { origin: string; pledges: number; amountMinor: number }[] };
type Totals = { views: number; intent: number; pledges: number; amountMinor: number };
export type Overview = {
  current: Totals;
  previous: Totals;
  series: { day: string; views: number; clicks: number }[];
  networks: { origin: string; views: number }[];
  currency: string;
};

const DAYS = 30;

function isoDay(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() - offset);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

const empty = (): Totals => ({ views: 0, intent: 0, pledges: 0, amountMinor: 0 });

// Junta métricas y conversión de todas las campañas en dos periodos de 30 días
// (actual y anterior) para calcular la tendencia. Todo sale de endpoints existentes.
export async function loadOverview(org: string, campaigns: CampaignCard[]): Promise<Overview> {
  const now = `from=${isoDay(DAYS - 1)}&to=${isoDay(0)}`;
  const before = `from=${isoDay(DAYS * 2 - 1)}&to=${isoDay(DAYS)}`;
  const current = empty();
  const previous = empty();
  const byDay = new Map<string, { views: number; clicks: number }>();
  const byNetwork = new Map<string, number>();
  for (let offset = DAYS - 1; offset >= 0; offset -= 1) byDay.set(isoDay(offset), { views: 0, clicks: 0 });
  await Promise.all(
    campaigns.map(async (campaign) => {
      const [m, c, mp, cp] = await Promise.all([
        api<Metrics>(`/campaigns/${campaign.id}/metrics?${now}`, { org }),
        api<Conversion>(`/campaigns/${campaign.id}/conversion?${now}`, { org }),
        api<Metrics>(`/campaigns/${campaign.id}/metrics?${before}`, { org }),
        api<Conversion>(`/campaigns/${campaign.id}/conversion?${before}`, { org }),
      ]).catch(() => [null, null, null, null] as const);
      const add = (target: Totals, metrics: Metrics | null, conversion: Conversion | null) => {
        for (const row of metrics?.origins ?? []) {
          target.views += row.views;
          target.intent += row.clicks;
        }
        for (const row of conversion?.origins ?? []) {
          target.pledges += row.pledges;
          target.amountMinor += row.amountMinor;
        }
      };
      add(current, m, c);
      add(previous, mp, cp);
      for (const point of m?.series ?? []) {
        const slot = byDay.get(point.day.slice(0, 10));
        if (slot) {
          slot.views += point.views;
          slot.clicks += point.clicks;
        }
      }
      for (const row of m?.origins ?? []) byNetwork.set(row.origin, (byNetwork.get(row.origin) ?? 0) + row.views);
    }),
  );
  return {
    current,
    previous,
    series: [...byDay].map(([day, value]) => ({ day, ...value })),
    networks: [...byNetwork].map(([origin, views]) => ({ origin, views })).filter((row) => row.views > 0).sort((a, b) => b.views - a.views),
    currency: campaigns[0]?.currency ?? "MXN",
  };
}

function money(minor: number, currency: string) {
  return `$${(minor / 100).toLocaleString("es-MX", { maximumFractionDigits: 0 })} ${currency}`;
}

function Trend({ now, before }: { now: number; before: number }) {
  const { tx } = useTx();
  if (before === 0 && now === 0) return <span className="trend trend-flat">{tx("Sin cambios", "No change")}</span>;
  if (before === 0) return <span className="trend trend-up">▲ {tx("nuevo", "new")}</span>;
  const change = Math.round(((now - before) / before) * 100);
  const kind = change > 0 ? "up" : change < 0 ? "down" : "flat";
  return (
    <span className={`trend trend-${kind}`}>
      {change > 0 ? "▲" : change < 0 ? "▼" : "•"} {Math.abs(change)}% <span className="trend-note">{tx("vs. 30 días antes", "vs. prior 30 days")}</span>
    </span>
  );
}

export function Resumen({ org, campaigns }: { org: string; campaigns: CampaignCard[] }) {
  const { tx } = useTx();
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    let alive = true;
    if (!campaigns.length) return;
    loadOverview(org, campaigns).then((value) => alive && setData(value));
    return () => {
      alive = false;
    };
  }, [org, campaigns]);

  if (!data) return <p className="note">{tx("Cargando resumen…", "Loading overview…")}</p>;
  const cards = [
    { label: tx("Visitas", "Visits"), now: data.current.views, before: data.previous.views, value: data.current.views.toLocaleString("es-MX") },
    { label: tx("Quisieron donar", "Wanted to donate"), now: data.current.intent, before: data.previous.intent, value: data.current.intent.toLocaleString("es-MX") },
    { label: tx("Donativos registrados", "Recorded donations"), now: data.current.pledges, before: data.previous.pledges, value: data.current.pledges.toLocaleString("es-MX") },
    { label: tx("Monto comprometido", "Pledged amount"), now: data.current.amountMinor, before: data.previous.amountMinor, value: money(data.current.amountMinor, data.currency) },
  ];
  const peak = Math.max(1, ...data.series.map((point) => point.views));
  const top = Math.max(1, ...data.networks.map((row) => row.views));
  return (
    <>
      <section className="kpi-grid" aria-label={tx("Últimos 30 días", "Last 30 days")}>
        {cards.map((card) => (
          <article key={card.label} className="kpi">
            <p className="kpi-label">{card.label}</p>
            <p className="kpi-value">{card.value}</p>
            <Trend now={card.now} before={card.before} />
          </article>
        ))}
      </section>
      <div className="home-charts">
        <section className="sheet">
          <h2 className="text-xl">{tx("Visitas por día", "Visits per day")}</h2>
          <p className="text-sm text-[var(--muted)]">{tx("Últimos 30 días, todas las campañas", "Last 30 days, all campaigns")}</p>
          <div className="day-chart" role="img" aria-label={tx("Visitas por día", "Visits per day")}>
            {data.series.map((point) => (
              <span key={point.day} className="day-bar" title={`${point.day}: ${point.views}`} style={{ height: `${Math.max(2, (point.views / peak) * 100)}%` }} />
            ))}
          </div>
          <p className="day-axis"><span>{data.series[0]?.day.slice(5)}</span><span>{data.series.at(-1)?.day.slice(5)}</span></p>
        </section>
        <section className="sheet">
          <h2 className="text-xl">{tx("Visitas por red", "Visits by network")}</h2>
          {data.networks.length === 0 ? <p className="note">{tx("Aún no hay visitas.", "No visits yet.")}</p> : null}
          <ul className="flex flex-col gap-3 pt-2">
            {data.networks.slice(0, 7).map((row) => (
              <li key={row.origin} className="home-net">
                <span className="net-label"><i className="net-dot" style={{ background: originColor(row.origin) }} />{originLabel(row.origin, tx)}</span>
                <span className="home-track"><span style={{ width: `${(row.views / top) * 100}%`, background: originColor(row.origin) }} /></span>
                <span className="num">{row.views}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
