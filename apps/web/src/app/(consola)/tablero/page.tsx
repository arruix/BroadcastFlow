"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fill, useI18n, useTx } from "@/lib/i18n";
import { api, explain, signedIn } from "@/lib/api";
import { CampaignCards, withProgress, type CampaignCard } from "../tarjetas";
import { Resumen } from "./resumen";

type Organization = { id: string; name: string };
type SupportVisit = { organization: string; enteredAt: string };

// Inicio: saludo, crear campaña y las campañas de la organización.
// El resumen de dinero vive en /dinero.
export default function Inicio() {
  const { t } = useI18n();
  const { tx } = useTx();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignCard[]>([]);
  const [operator, setOperator] = useState(false);
  const [support, setSupport] = useState<SupportVisit[]>([]);
  const [message, setMessage] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [loaded, setLoaded] = useState(false);

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
        if (rows[0]) setCampaigns(await withProgress(await api<CampaignCard[]>("/campaigns", { org: rows[0].id })));
      })
      .catch((error) => setMessage(explain(error)))
      .finally(() => setLoaded(true));
  }, []);

  const org = organizations[0];

  return (
    <main className="console-page">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="eyebrow">{t.nav.home}</p>
          <h1 className="text-4xl">{org ? fill(tx("Hola, {name}", "Hi, {name}"), { name: org.name }) : t.nav.home}</h1>
        </div>
        {org ? (
          <Link className="btn-primary" href="/campanas/nueva">
            + {tx("Crear campaña", "Create campaign")}
          </Link>
        ) : null}
      </header>
      {needsSignIn ? <p className="note">{t.dash.signInPrompt}</p> : null}
      {message ? <p className="note">{message}</p> : null}
      {!signedIn() ? (
        <Link className="btn-primary w-fit" href="/ingresar">
          {t.dash.signIn}
        </Link>
      ) : null}
      {signedIn() && !operator && loaded && organizations.length === 0 ? (
        <Link className="btn-primary w-fit" href="/organizacion">
          {t.dash.createOrg}
        </Link>
      ) : null}
      {operator ? (
        <Link className="chip w-fit" href="/plataforma">
          {t.nav.platform}
        </Link>
      ) : null}
      {support[0] ? <p className="note">{fill(t.dash.support, { name: support[0].organization })}</p> : null}
      {org && loaded && campaigns.length === 0 ? (
        <section className="sheet">
          <h2 className="text-2xl">{tx("Empieza en 3 pasos", "Start in 3 steps")}</h2>
          <ol className="steps">
            <li>{tx("Crea tu campaña: nombre, meta y fechas.", "Create your campaign: name, goal, and dates.")}</li>
            <li>{tx("Agrega el contenido que vas a publicar en cada red.", "Add the content you will post on each network.")}</li>
            <li>{tx("Comparte el enlace y mira los resultados aquí.", "Share the link and watch the results here.")}</li>
          </ol>
          <Link className="btn-primary w-fit" href="/campanas/nueva">
            {tx("Crear mi primera campaña", "Create my first campaign")}
          </Link>
        </section>
      ) : null}
      {org && campaigns.length > 0 ? <Resumen org={org.id} campaigns={campaigns} /> : null}
      {campaigns.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-2xl">{t.dash.campaigns}</h2>
            <Link className="text-sm font-semibold" href="/campanas">
              {tx("Ver todas", "See all")}
            </Link>
          </div>
          <CampaignCards campaigns={campaigns.slice(0, 6)} />
        </section>
      ) : null}
    </main>
  );
}
