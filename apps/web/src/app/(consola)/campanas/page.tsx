"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n, useTx } from "@/lib/i18n";
import { api, explain, signedIn } from "@/lib/api";
import { CampaignCards, type CampaignCard } from "../tarjetas";

export default function Campanas() {
  const { t } = useI18n();
  const { tx } = useTx();
  const [campaigns, setCampaigns] = useState<CampaignCard[]>([]);
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!signedIn()) {
      setLoaded(true);
      return;
    }
    api<{ id: string }[]>("/organizations")
      .then(async (rows) => (rows[0] ? api<CampaignCard[]>("/campaigns", { org: rows[0].id }) : []))
      .then(setCampaigns)
      .catch((error) => setMessage(explain(error)))
      .finally(() => setLoaded(true));
  }, []);

  return (
    <main className="console-page">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="eyebrow">{t.dash.eyebrow}</p>
          <h1 className="text-4xl">{t.nav.campaigns}</h1>
        </div>
        <Link className="btn-primary" href="/campanas/nueva">
          + {tx("Crear campaña", "Create campaign")}
        </Link>
      </header>
      {message ? <p className="note">{message}</p> : null}
      {!signedIn() && loaded ? (
        <Link className="btn-primary w-fit" href="/ingresar">
          {t.dash.signIn}
        </Link>
      ) : null}
      {signedIn() && loaded && campaigns.length === 0 && !message ? <p className="note">{t.dash.noCampaigns}</p> : null}
      {campaigns.length > 0 ? <CampaignCards campaigns={campaigns} /> : null}
      <p className="text-sm text-[var(--muted)]">
        {tx("El contenido de cada campaña está dentro de la campaña.", "Each campaign's content lives inside the campaign.")}{" "}
        <Link href="/piezas">{t.nav.pieces}</Link>
      </p>
    </main>
  );
}
