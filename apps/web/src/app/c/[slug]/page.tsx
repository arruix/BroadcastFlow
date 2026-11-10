import type { Metadata } from "next";
import { demoMode } from "@/lib/demo";
import { notFound } from "next/navigation";
import { Idioma } from "@/lib/i18n";
import { pick, serverLocale } from "@/lib/locale";
import type { Frame } from "@/lib/encuadre";
import { MetodoPago, type PaymentMethod } from "./metodo-pago";
import { Donar } from "./donar";
import { Pixel } from "./pixel";
import { PaginaPublica, type LandingDesign } from "./vista";

type PublicCampaign = {
  name: string;
  slug: string;
  status: string;
  currency: string;
  donateEnabled: boolean;
  paymentMethod: PaymentMethod | null;
  share: { title: string; description: string; imageKey: string | null } | null;
  landing: LandingDesign | null;
  coverFrame: Frame | null;
  notice: {
    version?: number;
    controller: string;
    purpose: string;
    dataCategories: string;
    retention: string;
  } | null;
  live: { playbackUrl: string } | null;
  goalMinor?: number | null;
  progress?: {
    confirmedMinor: number;
    confirmedCount: number;
    intentionMinor: number;
    intentionCount: number;
    pledgedMinor: number;
    donors: number;
  };
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

function httpsImage(value: string | null | undefined) {
  return value?.startsWith("https://") ? value : null;
}

async function loadCampaign(slug: string): Promise<PublicCampaign | null> {
  const response = await fetch(`${apiUrl}/public/campaigns/${slug}`, { cache: "no-store" });
  if (!response.ok) return null;
  return (await response.json()) as PublicCampaign;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const campaign = await loadCampaign(slug);
  if (!campaign) return {};
  const title = campaign.landing?.title || campaign.share?.title || campaign.name;
  const description = campaign.landing?.story || campaign.share?.description || undefined;
  const url = `${siteUrl}/c/${campaign.slug}`;
  const image = httpsImage(campaign.landing?.imageKey) || httpsImage(campaign.share?.imageKey) || `${siteUrl}/og-default.png`;
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
  const landing = campaign.landing;
  const hasExternal = Boolean(campaign.paymentMethod?.link || campaign.paymentMethod?.transfer);
  const cover = httpsImage(landing?.imageKey) || httpsImage(campaign.share?.imageKey);
  const story = landing?.story || campaign.share?.description || null;
  const title = landing?.title || campaign.name;
  const amounts = landing?.amountsMinor?.map((minor) => minor / 100);
  const cta = landing?.cta || undefined;

  return (
    <>
      {campaign.notice ? <Pixel slug={campaign.slug} /> : null}
      <PaginaPublica
        tx={tx}
        name={title}
        story={story}
        cover={cover}
        frame={landing?.hero ?? campaign.coverFrame}
        accent={landing?.accent ?? null}
        showProgress={landing ? landing.showProgress : true}
        goalMinor={campaign.goalMinor ?? null}
        confirmedMinor={campaign.progress?.confirmedMinor ?? 0}
        confirmedCount={campaign.progress?.confirmedCount ?? 0}
        intentionMinor={campaign.progress?.intentionMinor ?? 0}
        intentionCount={campaign.progress?.intentionCount ?? 0}
        currency={campaign.currency}
        liveUrl={campaign.live?.playbackUrl ?? null}
        idioma={<Idioma />}
        notice={campaign.notice}
        statusNote={
          campaign.status === "borrador" ? (
            <p className="note">
              {tx(
                "Esta página ya se puede abrir con el enlace mientras sigue en borrador. El pago externo y los clics de pago se muestran cuando la campaña está activa y el aviso está publicado.",
                "This page can already be opened with the link while it is still a draft. The external payment and payment clicks appear when the campaign is active and the notice is published.",
              )}
            </p>
          ) : !campaign.notice ? (
            <p className="note">{tx("El aviso sigue en borrador. Esta página no mide ni cobra.", "The notice is still a draft. This page does not measure or charge.")}</p>
          ) : null
        }
        measureNote={
          demoMode ? null : (
            <div className="flex items-start gap-3.5 rounded-2xl border border-teal-100 bg-teal-50/70 p-4 text-slate-800">
              <div className="flex flex-col gap-0.5">
                <h2 className="text-sm font-bold text-slate-900">{tx("Visitas y clics", "Visits and clicks")}</h2>
                <p className="text-sm text-slate-600">
                  {tx(
                    "BroadcastFlow cuenta visitas y clics al pago externo. No compra anuncios ni alarga una transmisión.",
                    "BroadcastFlow counts visits and clicks on the external payment. It does not buy ads or extend a broadcast.",
                  )}
                </p>
              </div>
            </div>
          )
        }
        donate={
          <>
            {campaign.donateEnabled && hasExternal ? <MetodoPago slug={campaign.slug} method={campaign.paymentMethod!} cta={cta} /> : null}
            {campaign.donateEnabled && hasExternal ? (
              <details>
                <summary>{tx("¿Solo quieres registrar tu intención de donar?", "Just want to register your intent to donate?")}</summary>
                <Donar slug={campaign.slug} currency={campaign.currency} noticeVersion={campaign.notice?.version ?? null} amounts={amounts} cta={cta} />
              </details>
            ) : null}
            {campaign.donateEnabled && !hasExternal ? (
              <Donar slug={campaign.slug} currency={campaign.currency} noticeVersion={campaign.notice?.version ?? null} amounts={amounts} cta={cta} />
            ) : null}
            {campaign.status === "pausada" ? <p>{tx("La página está en pausa.", "The page is paused.")}</p> : null}
            {campaign.notice && !campaign.donateEnabled && campaign.status !== "pausada" ? (
              <p>{tx("Donar se enciende cuando la campaña está activa.", "Donate turns on when the campaign is active.")}</p>
            ) : null}
          </>
        }
      />
    </>
  );
}
