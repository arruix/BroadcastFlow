import type { Metadata } from "next";
import { demoMode } from "@/lib/demo";
import { notFound } from "next/navigation";
import { Idioma } from "@/lib/i18n";
import { pick, serverLocale } from "@/lib/locale";

function fillText(text: string, values: Record<string, string>) {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
}
import { MetodoPago, type PaymentMethod } from "./metodo-pago";
import { Donar } from "./donar";
import { Pixel } from "./pixel";

type PublicCampaign = {
  name: string;
  slug: string;
  status: string;
  currency: string;
  donateEnabled: boolean;
  paymentMethod: PaymentMethod | null;
  share: { title: string; description: string; imageKey: string | null } | null;
  notice: {
    version?: number;
    controller: string;
    purpose: string;
    dataCategories: string;
    retention: string;
  } | null;
  live: { playbackUrl: string } | null;
  goalMinor?: number | null;
  progress?: { pledgedMinor: number; donors: number };
};

function amount(minor: number, currency: string) {
  return `$${(minor / 100).toLocaleString("es-MX", { maximumFractionDigits: 0 })} ${currency}`;
}

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

async function loadCampaign(slug: string): Promise<PublicCampaign | null> {
  const response = await fetch(`${apiUrl}/public/campaigns/${slug}`, { cache: "no-store" });
  if (!response.ok) return null;
  return (await response.json()) as PublicCampaign;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const campaign = await loadCampaign(slug);
  if (!campaign) return {};
  const title = campaign.share?.title ?? campaign.name;
  const description = campaign.share?.description ?? undefined;
  const url = `${siteUrl}/c/${campaign.slug}`;
  const image = campaign.share?.imageKey?.startsWith("https://")
    ? campaign.share.imageKey
    : `${siteUrl}/og-default.png`;
  return {
    metadataBase: new URL(siteUrl),
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function CampaignLanding({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const locale = await serverLocale();
  const tx = (es: string, en: string) => pick(locale, es, en);
  const response = await fetch(`${apiUrl}/public/campaigns/${slug}`, { cache: "no-store" });
  if (response.status === 404) notFound();
  if (!response.ok) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 px-4 py-10">
        <Idioma />
        <h1 className="text-3xl font-semibold">{tx("Página pública", "Public page")}</h1>
        <p>{tx("No se pudo leer la campaña.", "The campaign could not be read.")}</p>
      </main>
    );
  }
  const campaign = (await response.json()) as PublicCampaign;
  const hasExternal = Boolean(campaign.paymentMethod?.link || campaign.paymentMethod?.transfer);

  const cover = campaign.share?.imageKey?.startsWith("https://") ? campaign.share.imageKey : null;
  const story = campaign.share?.description ?? null;
  const pledged = campaign.progress?.pledgedMinor ?? 0;
  const donors = campaign.progress?.donors ?? 0;
  const goal = campaign.goalMinor ?? null;
  const share = goal ? Math.min(100, Math.round((pledged / goal) * 100)) : null;

  return (
    <div className="public-page">
      {campaign.notice ? <Pixel slug={campaign.slug} /> : null}
      <header className="public-top">
        <p className="eyebrow flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
          {tx("Página oficial de campaña", "Official campaign page")}
        </p>
        <Idioma />
      </header>
      <main className="mx-auto grid max-w-5xl items-start gap-8 px-4 pb-12 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="flex flex-col gap-6">
          <div className="public-cover">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt="" />
            ) : (
              <span aria-hidden="true">{campaign.name.slice(0, 1)}</span>
            )}
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">{campaign.name}</h1>
          {campaign.live ? (
            <figure className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-rose-500"></span>
                </span>
                <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-rose-600">{tx("En vivo", "Live")}</span>
              </div>
              <video className="w-full rounded-xl bg-slate-950 shadow-md" controls src={campaign.live.playbackUrl} />
            </figure>
          ) : null}
          {story ? <p className="public-story">{story}</p> : null}
          {demoMode ? null : (
            <div className="flex items-start gap-3.5 rounded-2xl border border-teal-100 bg-teal-50/70 p-4 text-slate-800">
              <div className="flex flex-col gap-0.5">
                <h2 className="text-sm font-bold text-slate-900">{tx("Impacto en redes sociales", "Social media impact")}</h2>
                <p className="text-sm text-slate-600">
                  {tx(
                    "Entre más donaciones reciba esta campaña, más tiempo permanecerá transmitiendo y activa en las redes sociales.",
                    "The more donations this campaign receives, the longer it will remain broadcasting and active on social networks.",
                  )}
                </p>
              </div>
            </div>
          )}
          {!campaign.notice ? (
            <p className="note">{tx("El aviso sigue en borrador. Esta página no mide ni cobra.", "The notice is still a draft. This page does not measure or charge.")}</p>
          ) : null}
        </section>
        <aside className="panel donate-card flex flex-col gap-4 p-5 lg:sticky lg:top-6">
          <div className="flex flex-col gap-2">
            <p className="text-3xl font-extrabold text-slate-900">{amount(pledged, campaign.currency)}</p>
            <p className="text-sm text-[var(--muted)]">
              {goal
                ? fillText(tx("comprometidos de una meta de {goal}", "pledged of a {goal} goal"), { goal: amount(goal, campaign.currency) })
                : tx("comprometidos", "pledged")}
            </p>
            {share !== null ? (
              <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={share} aria-label={tx("Avance de la meta", "Goal progress")}>
                <span style={{ width: `${Math.max(2, share)}%` }} />
              </div>
            ) : null}
            <p className="text-sm text-slate-700">
              {share !== null ? `${share}% · ` : ""}
              {donors === 1 ? tx("1 donativo", "1 donation") : fillText(tx("{n} donativos", "{n} donations"), { n: String(donors) })}
            </p>
          </div>
          {campaign.donateEnabled && hasExternal ? <MetodoPago slug={campaign.slug} method={campaign.paymentMethod!} /> : null}
          {campaign.donateEnabled && hasExternal ? (
            <details>
              <summary>{tx("¿Solo quieres registrar tu intención de donar?", "Just want to register your intent to donate?")}</summary>
              <Donar slug={campaign.slug} currency={campaign.currency} noticeVersion={campaign.notice?.version ?? null} />
            </details>
          ) : null}
          {campaign.donateEnabled && !hasExternal ? <Donar slug={campaign.slug} currency={campaign.currency} noticeVersion={campaign.notice?.version ?? null} /> : null}
          {campaign.status === "pausada" ? <p>{tx("La página está en pausa.", "The page is paused.")}</p> : null}
          {campaign.notice && !campaign.donateEnabled && campaign.status !== "pausada" ? (
            <p>{tx("Donar se enciende cuando la campaña está activa.", "Donate turns on when the campaign is active.")}</p>
          ) : null}
        </aside>
      </main>
      <footer className="public-footer">
        {campaign.notice ? (
          <details id="aviso">
            <summary>{tx("Aviso de privacidad", "Privacy notice")}</summary>
            <div className="flex flex-col gap-1 pt-2">
              <p>{tx("Responsable", "Controller")}: {campaign.notice.controller}</p>
              <p>{tx("Finalidad", "Purpose")}: {campaign.notice.purpose}</p>
              <p>{tx("Datos", "Data")}: {campaign.notice.dataCategories}</p>
              <p>{tx("Plazo", "Retention")}: {campaign.notice.retention}</p>
            </div>
          </details>
        ) : null}
        <p>BroadcastFlow</p>
      </footer>
    </div>
  );
}
