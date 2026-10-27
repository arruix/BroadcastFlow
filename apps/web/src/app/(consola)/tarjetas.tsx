"use client";

import Link from "next/link";
import { demoMode } from "@/lib/demo";
import { fill, useI18n, useTx } from "@/lib/i18n";

export type CampaignCard = {
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

function named(table: Record<string, string>, key: string) {
  return table[key] ?? key;
}

// Tarjetas de campaña: portada, estado, meta y accesos directos.
export function CampaignCards({ campaigns }: { campaigns: CampaignCard[] }) {
  const { t } = useI18n();
  const { tx } = useTx();
  return (
    <div className="card-grid">
      {campaigns.map((campaign) => (
        <article key={campaign.id} className="campaign-card">
          <Link className="campaign-cover" href={`/campanas/${campaign.id}`} aria-hidden="true" tabIndex={-1}>
            <span>{campaign.name.slice(0, 1)}</span>
          </Link>
          <div className="flex flex-1 flex-col gap-2 p-4">
            <p className="flex flex-wrap gap-2">
              <span className={`status status-${campaign.status}`}>{named(t.status, campaign.status)}</span>
              <span className="status">{named(t.kind, campaign.kind)}</span>
            </p>
            <Link className="text-lg font-semibold leading-snug" href={`/campanas/${campaign.id}`}>
              {campaign.name}
            </Link>
            {campaign.goalMinor ? (
              <p className="text-sm text-[var(--muted)]">
                {fill(t.dash.goal, { amount: (campaign.goalMinor / 100).toLocaleString("es-MX", { maximumFractionDigits: 0 }), currency: campaign.currency })}
              </p>
            ) : null}
            {campaign.startsOn || campaign.endsOn ? (
              <p className="text-sm text-[var(--muted)]">
                {fill(t.dash.dates, { start: campaign.startsOn ?? t.dash.noStart, end: campaign.endsOn ?? t.dash.noEnd })}
              </p>
            ) : null}
            <div className="mt-auto flex flex-wrap gap-2 pt-2">
              <Link className="chip" href={`/campanas/${campaign.id}/tablero`}>{t.nav.results}</Link>
              <Link className="chip" href={`/c/${campaign.slug}`}>{tx("Página pública", "Public page")}</Link>
              {demoMode ? null : (
                <Link className="chip live-chip ml-auto" href={`/campanas/${campaign.id}/en-vivo`}>
                  Live
                </Link>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
