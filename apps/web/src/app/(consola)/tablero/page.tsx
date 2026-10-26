"use client";

import Link from "next/link";
import { demoMode } from "@/lib/demo";
import { useEffect, useRef, useState } from "react";
import { fill, useI18n } from "@/lib/i18n";
import { api, explain, signedIn } from "@/lib/api";

type Organization = { id: string; name: string };
type SupportVisit = { organization: string; enteredAt: string };
type Campaign = {
  id: string;
  name: string;
  status: string;
  slug: string;
  kind: string;
  currency: string;
  goalMinor?: number;
  startsOn?: string;
  endsOn?: string;
};
type MoneyPoint = { currency: string; spendMinor: number; grossMinor: number };
type OrgSummary = {
  id: string;
  name: string;
  spendVisible: boolean;
  moneyVisible: boolean;
  totals: (MoneyPoint & { availableMinor: number })[];
  months: { month: string; points: MoneyPoint[] }[];
};

function money(minor: number, currency: string) {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

function monthLabel(month: string, locale: string) {
  const [year, mon] = month.split("-");
  return new Date(Date.UTC(Number(year), Number(mon) - 1, 1)).toLocaleString(locale === "en" ? "en-US" : "es-MX", { month: "short", timeZone: "UTC" });
}

function named(table: Record<string, string>, key: string) {
  return table[key] ?? key;
}

function leadCurrency(org: OrgSummary) {
  return org.totals.reduce<(typeof org.totals)[number] | null>((best, row) => {
    const size = row.grossMinor + row.spendMinor + Math.abs(row.availableMinor);
    if (!best) return row;
    const bestSize = best.grossMinor + best.spendMinor + Math.abs(best.availableMinor);
    return size > bestSize ? row : best;
  }, null);
}

export default function Tablero() {
  const { locale, t } = useI18n();
  const scroller = useRef<HTMLDivElement>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [figures, setFigures] = useState<OrgSummary[]>([]);
  const [operator, setOperator] = useState(false);
  const [support, setSupport] = useState<SupportVisit[]>([]);
  const [message, setMessage] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);

  useEffect(() => {
    if (!signedIn()) {
      setNeedsSignIn(true);
      return;
    }
    api<Organization[]>("/organizations")
      .then(async (rows) => {
        setOrganizations(rows);
        const me = await api<{ platformOperator: boolean }>("/auth/me");
        setOperator(me.platformOperator);
        setSupport(await api<SupportVisit[]>("/support-access"));
        setFigures(await api<OrgSummary[]>("/organizations/summary"));
        if (!rows[0]) return;
        setCampaigns(await api<Campaign[]>("/campaigns", { org: rows[0].id }));
      })
      .catch((error) => setMessage(explain(error)));
  }, []);

  function move(direction: number) {
    const node = scroller.current;
    if (!node) return;
    node.scrollBy({ left: direction * Math.min(node.clientWidth * 0.86, 340), behavior: "smooth" });
  }

  return (
    <main className="console-page">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="eyebrow">{t.dash.eyebrow}</p>
          <h1 className="text-4xl">{organizations[0]?.name ?? t.dash.eyebrow}</h1>
        </div>
      </header>
      {needsSignIn ? <p className="note">{t.dash.signInPrompt}</p> : null}
      {message ? <p className="note">{message}</p> : null}
      {!signedIn() ? (
        <Link className="inline-flex min-h-11 w-fit items-center rounded bg-neutral-900 px-4 text-white" href="/ingresar">
          {t.dash.signIn}
        </Link>
      ) : null}
      {signedIn() && !operator && organizations.length === 0 ? (
        <Link className="inline-flex min-h-11 w-fit items-center rounded bg-neutral-900 px-4 text-white" href="/organizacion">
          {t.dash.createOrg}
        </Link>
      ) : null}
      {support[0] ? <p className="note">{fill(t.dash.support, { name: support[0].organization })}</p> : null}
      <section className="sheet">
        <h2 className="text-2xl">{t.dash.moneyTitle}</h2>
        <p className="text-sm text-[var(--muted)]">{t.dash.moneyNote}</p>
        {figures.length === 0 ? (
          <section className="empty-act">
            <p>{t.dash.noOrg}</p>
            <Link className="inline-flex min-h-11 items-center rounded bg-neutral-900 px-4 text-white" href={operator ? "/plataforma" : "/campanas/nueva"}>
              {operator ? t.nav.platform : t.dash.newCampaign}
            </Link>
          </section>
        ) : null}
        {figures.map((org) => {
          const lead = leadCurrency(org);
          const peak = Math.max(
            1,
            ...org.months.flatMap((month) =>
              month.points.filter((point) => point.currency === lead?.currency).flatMap((point) => [point.spendMinor, point.grossMinor]),
            ),
          );
          return (
            <article key={org.id} className="flex flex-col gap-4">
              <h3 className="text-xl">{org.name}</h3>
              {!org.moneyVisible ? <p>{t.dash.roleHidden}</p> : null}
              {org.moneyVisible && !lead ? <p>{t.dash.noMoney}</p> : null}
              {lead ? (
                <div className="stat-grid">
                  <div className="stat">
                    <div className="flex items-center justify-between">
                      <span className="stat-label">{t.dash.spend}</span>
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6H2.25m0 0v8.25m0 0a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V14.25m-15.797-2.101A60.07 60.07 0 0 1 18 10.05m-15.797 0V6.75m0 0A2.25 2.25 0 0 1 4.5 4.5h15A2.25 2.25 0 0 1 21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75Z" />
                        </svg>
                      </span>
                    </div>
                    <span className="stat-value">{org.spendVisible ? money(lead.spendMinor, lead.currency) : "—"}</span>
                  </div>
                  <div className="stat">
                    <div className="flex items-center justify-between">
                      <span className="stat-label">{t.dash.raised}</span>
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                        </svg>
                      </span>
                    </div>
                    <span className="stat-value text-emerald-700">{money(lead.grossMinor, lead.currency)}</span>
                  </div>
                  <div className="stat">
                    <div className="flex items-center justify-between">
                      <span className="stat-label">{t.dash.available}</span>
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v18h18M7.5 15l4.5-5 3.5 3.5 5-6" />
                        </svg>
                      </span>
                    </div>
                    <span className="stat-value text-indigo-600">{money(lead.availableMinor, lead.currency)}</span>
                  </div>
                </div>
              ) : null}
              {org.totals.filter((row) => row.currency !== lead?.currency).map((row) => (
                <p key={row.currency}>
                  {fill(t.dash.otherCurrency, {
                    currency: row.currency,
                    spend: org.spendVisible ? money(row.spendMinor, row.currency) : "—",
                    raised: money(row.grossMinor, row.currency),
                    available: money(row.availableMinor, row.currency),
                  })}
                </p>
              ))}
              {lead ? (
                <div className="chart" role="img" aria-label={fill(t.dash.chart, { name: org.name, currency: lead.currency })}>
                  {org.months.map((month) => {
                    const point = month.points.find((item) => item.currency === lead.currency);
                    return (
                      <div key={month.month} className="chart-col">
                        <div className="chart-bars">
                          {org.spendVisible ? <span className="bar bar-spend" style={{ height: `${((point?.spendMinor ?? 0) / peak) * 100}%` }} /> : null}
                          <span className="bar bar-income" style={{ height: `${((point?.grossMinor ?? 0) / peak) * 100}%` }} />
                        </div>
                        <span className="chart-label">{monthLabel(month.month, locale)}</span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {lead ? (
                <p className="flex gap-4 text-sm">
                  {org.spendVisible ? <span><i className="swatch bar-spend" /> {t.dash.spend}</span> : <span>{t.dash.spendHidden}</span>}
                  <span><i className="swatch bar-income" /> {t.dash.raised}</span>
                </p>
              ) : null}
            </article>
          );
        })}
      </section>
      <section className="sheet">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl">{t.dash.campaigns}</h2>
          {campaigns.length > 1 ? (
            <div className="flex gap-2">
              <button className="carousel-control" type="button" aria-label={t.dash.previous} onClick={() => move(-1)}>
                ‹
              </button>
              <button className="carousel-control" type="button" aria-label={t.dash.next} onClick={() => move(1)}>
                ›
              </button>
            </div>
          ) : null}
        </div>
        {organizations[0] && campaigns.length === 0 ? (
          <section className="empty-act">
            <p>{t.dash.noCampaigns}</p>
            <Link className="inline-flex min-h-11 items-center rounded bg-neutral-900 px-4 text-white" href="/campanas/nueva">
              {t.dash.newCampaign}
            </Link>
          </section>
        ) : null}
        {campaigns.length > 0 ? (
          <div className="carousel" ref={scroller}>
            {campaigns.map((campaign) => (
              <article key={campaign.id} className="carousel-card flex flex-col gap-3 p-4">
                <Link className="text-xl" href={`/campanas/${campaign.id}`}>
                  {campaign.name}
                </Link>
                <p className="flex flex-wrap gap-2">
                  <span className="status">{named(t.kind, campaign.kind)}</span>
                  <span className={`status status-${campaign.status}`}>{named(t.status, campaign.status)}</span>
                </p>
                <p className="text-sm text-[var(--muted)]">/{campaign.slug}</p>
                {campaign.goalMinor ? (
                  <p>
                    {fill(t.dash.goal, { amount: (campaign.goalMinor / 100).toFixed(2), currency: campaign.currency })}
                  </p>
                ) : null}
                {campaign.startsOn || campaign.endsOn ? (
                  <p className="text-sm">
                    {fill(t.dash.dates, { start: campaign.startsOn ?? t.dash.noStart, end: campaign.endsOn ?? t.dash.noEnd })}
                  </p>
                ) : null}
                <div className="mt-auto flex flex-wrap gap-2 pt-2">
                  <Link className="inline-flex min-h-10 items-center rounded-xl border border-slate-200/90 bg-white px-3.5 text-xs font-semibold hover:border-indigo-300 hover:text-indigo-600 shadow-2xs transition-all" href={`/campanas/${campaign.id}/tablero`}>
                    {t.dash.board}
                  </Link>
                  <Link className="inline-flex min-h-10 items-center rounded-xl border border-slate-200/90 bg-white px-3.5 text-xs font-semibold hover:border-indigo-300 hover:text-indigo-600 shadow-2xs transition-all" href={`/campanas/${campaign.id}/libro`}>
                    {t.dash.ledger}
                  </Link>
                  {demoMode ? null : (
                    <Link className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/60 px-3 text-xs font-semibold text-rose-600 hover:bg-rose-100/80 transition-all ml-auto" href={`/campanas/${campaign.id}/en-vivo`}>
                      <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                      Live
                    </Link>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
