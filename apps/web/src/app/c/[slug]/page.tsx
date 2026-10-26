import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Idioma } from "@/lib/i18n";
import { pick, serverLocale } from "@/lib/locale";
import { Donar } from "./donar";
import { Pixel } from "./pixel";

type PublicCampaign = {
  name: string;
  slug: string;
  status: string;
  currency: string;
  donateEnabled: boolean;
  share: { title: string; description: string; imageKey: string | null } | null;
  notice: {
    version?: number;
    controller: string;
    purpose: string;
    dataCategories: string;
    retention: string;
  } | null;
  live: { playbackUrl: string } | null;
};

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

  return (
    <main className="mx-auto grid min-h-screen max-w-5xl items-start gap-8 px-4 py-12 lg:grid-cols-[minmax(0,1fr)_22rem]">
      {campaign.notice ? <Pixel slug={campaign.slug} /> : null}
      <section className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-indigo-600" />
            {tx("Página oficial de campaña", "Official campaign page")}
          </p>
          <Idioma />
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">{campaign.name}</h1>
        {campaign.live ? (
          <figure className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-rose-600 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-full">{tx("En vivo", "Live")}</span>
            </div>
            <video className="w-full rounded-xl bg-slate-950 shadow-md" controls src={campaign.live.playbackUrl} />
          </figure>
        ) : null}
        <div className="flex items-start gap-3.5 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/90 via-violet-50/70 to-purple-50/90 p-4 text-slate-800 shadow-2xs">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-2xs">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="flex flex-col gap-0.5">
            <h2 className="text-sm font-bold text-slate-900">
              {tx("Impacto en redes sociales", "Social media impact")}
            </h2>
            <p className="text-sm text-slate-600">
              {tx(
                "Entre más donaciones reciba esta campaña, más tiempo permanecerá transmitiendo y activa en las redes sociales.",
                "The more donations this campaign receives, the longer it will remain broadcasting and active on social networks."
              )}
            </p>
          </div>
        </div>
        {campaign.notice ? (
          <article id="aviso" className="flex flex-col gap-2 rounded border p-5">
            <h2 className="text-2xl">{tx("Aviso de privacidad", "Privacy notice")}</h2>
            <p>{tx("Responsable", "Controller")}: {campaign.notice.controller}</p>
            <p>{tx("Finalidad", "Purpose")}: {campaign.notice.purpose}</p>
            <p>{tx("Datos", "Data")}: {campaign.notice.dataCategories}</p>
            <p>{tx("Plazo", "Retention")}: {campaign.notice.retention}</p>
          </article>
        ) : (
          <p className="note">{tx("El aviso sigue en borrador. Esta página no mide ni cobra.", "The notice is still a draft. This page does not measure or charge.")}</p>
        )}
      </section>
      <section className="panel flex flex-col gap-4 p-5 lg:sticky lg:top-6">
        {campaign.donateEnabled ? <Donar slug={campaign.slug} currency={campaign.currency} noticeVersion={campaign.notice?.version ?? null} /> : null}
        {campaign.status === "pausada" ? <p>{tx("La página está en pausa.", "The page is paused.")}</p> : null}
        {campaign.notice && !campaign.donateEnabled && campaign.status !== "pausada" ? (
          <p>{tx("Donar se enciende cuando la campaña está activa.", "Donate turns on when the campaign is active.")}</p>
        ) : null}
      </section>
    </main>
  );
}
