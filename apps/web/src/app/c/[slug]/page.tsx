import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
    controller: string;
    purpose: string;
    dataCategories: string;
    retention: string;
  } | null;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";

async function loadCampaign(slug: string): Promise<PublicCampaign | null> {
  const response = await fetch(`${apiUrl}/public/campaigns/${slug}`, { cache: "no-store" });
  if (!response.ok) return null;
  return (await response.json()) as PublicCampaign;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const campaign = await loadCampaign(slug);
  if (!campaign) return {};
  const image = campaign.share?.imageKey?.startsWith("https://") ? campaign.share.imageKey : undefined;
  return {
    title: campaign.share?.title ?? campaign.name,
    description: campaign.share?.description ?? undefined,
    openGraph: {
      title: campaign.share?.title ?? campaign.name,
      description: campaign.share?.description ?? undefined,
      images: image ? [image] : undefined,
    },
  };
}

export default async function CampaignLanding({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const response = await fetch(`${apiUrl}/public/campaigns/${slug}`, { cache: "no-store" });
  if (response.status === 404) notFound();
  if (!response.ok) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 px-4 py-10">
        <h1 className="text-3xl font-semibold">Página pública</h1>
        <p>No se pudo leer la campaña.</p>
      </main>
    );
  }
  const campaign = (await response.json()) as PublicCampaign;

  return (
    <main className="mx-auto grid min-h-screen max-w-5xl gap-6 px-4 py-10 lg:grid-cols-2">
      {campaign.notice ? <Pixel slug={campaign.slug} /> : null}
      <section className="flex flex-col gap-4">
        <p className="text-sm">Página pública</p>
        <h1 className="text-3xl font-semibold">{campaign.name}</h1>
        {campaign.notice ? (
          <article className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold">Aviso de privacidad</h2>
            <p>Responsable: {campaign.notice.controller}</p>
            <p>Finalidad: {campaign.notice.purpose}</p>
            <p>Datos: {campaign.notice.dataCategories}</p>
            <p>Plazo: {campaign.notice.retention}</p>
          </article>
        ) : (
          <p>El aviso sigue en borrador. Esta página no mide ni cobra.</p>
        )}
      </section>
      <section className="flex flex-col gap-4">
        {campaign.donateEnabled ? <Donar slug={campaign.slug} currency={campaign.currency} /> : null}
        {campaign.notice && !campaign.donateEnabled ? <p>Donar se enciende cuando la campaña está activa.</p> : null}
      </section>
    </main>
  );
}
