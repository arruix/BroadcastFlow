"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { api, signedIn } from "@/lib/api";

type Campaign = { id: string; name: string };

const targets = {
  medicion: { href: (id: string) => `/campanas/${id}/tablero` },
  gasto: { href: (id: string) => `/campanas/${id}/tablero#gasto` },
  disputas: { href: (id: string) => `/campanas/${id}/libro#disputas` },
  piezas: { href: (id: string) => `/campanas/${id}/pieza` },
  programacion: { href: (id: string) => `/campanas/${id}/pieza#programar` },
  avisos: { href: (id: string) => `/campanas/${id}` },
} as const;

const screenCopy = {
  medicion: ["boardTitle", "boardBody"],
  gasto: ["spendTitle", "spendBody"],
  disputas: ["disputesTitle", "disputesBody"],
  piezas: ["piecesTitle", "piecesBody"],
  programacion: ["scheduleTitle", "scheduleBody"],
  avisos: ["noticesTitle", "noticesBody"],
} as const;

export function Destino({ kind }: { kind: keyof typeof targets }) {
  const { t } = useI18n();
  const router = useRouter();
  const screen = targets[kind];
  const [titleKey, bodyKey] = screenCopy[kind];
  const title = t.screens[titleKey];
  const description = t.screens[bodyKey];
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [ready, setReady] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!signedIn()) {
      setEntered(false);
      setReady(true);
      return;
    }
    setEntered(true);
    api<{ id: string }[]>("/organizations")
      .then(async (organizations) => {
        if (!organizations[0]) return [] as Campaign[];
        return api<Campaign[]>("/campaigns", { org: organizations[0].id });
      })
      .then((rows) => {
        if (!alive) return;
        if (rows.length === 1) {
          router.replace(screen.href(rows[0].id));
          return;
        }
        setCampaigns(rows);
        setReady(true);
      })
      .catch(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [router, screen]);

  if (!ready) {
    return (
      <main className="console-page">
        <p className="eyebrow">{t.dash.eyebrow}</p>
        <h1 className="text-4xl">{title}</h1>
        <p className="note">{t.screens.loading}</p>
      </main>
    );
  }

  return (
    <main className="console-page">
      <header className="flex flex-col gap-2">
        <p className="eyebrow">{t.dash.eyebrow}</p>
        <h1 className="text-4xl">{title}</h1>
        <p className="lede">{description}</p>
      </header>
      {!entered ? (
        <Link className="inline-flex min-h-11 w-fit items-center rounded bg-neutral-900 px-4 text-white" href="/ingresar">
          {t.screens.signIn}
        </Link>
      ) : null}
      {entered && campaigns.length === 0 ? (
        <section className="empty-act">
          <div>
            <h2 className="text-2xl">{title}</h2>
            <p>{t.screens.noCampaigns}</p>
          </div>
          <Link className="inline-flex min-h-11 items-center rounded bg-neutral-900 px-4 text-white" href="/campanas/nueva">
            {t.dash.newCampaign}
          </Link>
        </section>
      ) : null}
      {campaigns.length > 1 ? (
        <section className="sheet">
          <div className="flex flex-col gap-2">
            {campaigns.map((campaign) => (
              <article key={campaign.id} className="row">
                <p className="font-semibold">{campaign.name}</p>
                <Link className="chip" href={screen.href(campaign.id)}>
                  {title}
                </Link>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
