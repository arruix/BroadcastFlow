"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Cabecera } from "./cabecera";
import { useI18n } from "@/lib/i18n";
import { api, clearSession, signedIn } from "@/lib/api";

type Campaign = { id: string; name?: string; status?: string; slug?: string };

const entries = [
  { id: "board", path: (id: string | null) => (id ? `/campanas/${id}/tablero` : "/medicion") },
  { id: "spend", path: (id: string | null) => (id ? `/campanas/${id}/tablero#gasto` : "/gasto") },
  { id: "disputes", path: (id: string | null) => (id ? `/campanas/${id}/libro#disputas` : "/disputas") },
  { id: "campaigns", path: () => "/tablero" },
  { id: "pieces", path: (id: string | null) => (id ? `/campanas/${id}/pieza` : "/piezas") },
  { id: "schedule", path: (id: string | null) => (id ? `/campanas/${id}/pieza#programar` : "/programacion") },
  { id: "connections", path: () => "/conexiones" },
  { id: "notices", path: (id: string | null) => (id ? `/campanas/${id}` : "/avisos") },
  { id: "security", path: () => "/seguridad" },
  { id: "plan", path: () => "/plan" },
] as const;

export function ConsolaShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem("bf_rail") === "0");
  }, []);

  function setRail(next: boolean) {
    setCollapsed(next);
    window.localStorage.setItem("bf_rail", next ? "0" : "1");
  }

  const close = useCallback(() => setOpen(false), []);

  function showMenu() {
    if (window.matchMedia("(min-width: 1024px)").matches) setRail(false);
    else setOpen(true);
  }

  return (
    <div className={collapsed ? "console is-collapsed min-h-screen lg:grid lg:grid-cols-[4.25rem_minmax(0,1fr)]" : "console min-h-screen lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]"}>
      <Riel open={open} onClose={close} onCollapse={() => setRail(true)} />
      <div className="min-w-0">
        <Cabecera onMenu={showMenu} />
        <Lugar />
        {children}
      </div>
    </div>
  );
}

export function Riel({ open, onClose, onCollapse }: { open: boolean; onClose: () => void; onCollapse: () => void }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [hash, setHash] = useState("");
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [operator, setOperator] = useState(false);

  useEffect(() => {
    const read = () => setHash(window.location.hash);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [pathname]);

  useEffect(() => {
    onClose();
  }, [pathname, hash, onClose]);

  useEffect(() => {
    if (!signedIn()) return;
    let alive = true;
    const fromPath = pathname.match(/^\/campanas\/(?!nueva(?:\/|$))([^/]+)/)?.[1] ?? null;
    (async () => {
      const me = await api<{ platformOperator: boolean }>("/auth/me").catch(() => ({ platformOperator: false }));
      if (!alive) return;
      setOperator(me.platformOperator);
      if (fromPath) setCampaignId(fromPath);
      const organizations = await api<{ id: string }[]>("/organizations").catch(() => []);
      if (!alive) return;
      const open = pathname === "/empezar" || pathname === "/campanas/nueva" || pathname.startsWith("/invitar");
      if (!me.platformOperator && organizations.length === 0 && !open) {
        router.replace("/empezar");
        return;
      }
      if (fromPath || !organizations[0]) return;
      const campaigns = await api<Campaign[]>("/campaigns", { org: organizations[0].id }).catch(() => []);
      if (!alive) return;
      setCampaignId(campaigns[0]?.id ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [pathname, router]);

  function current(id: (typeof entries)[number]["id"]) {
    const campaignBoard = /^\/campanas\/[^/]+\/tablero$/.test(pathname);
    const campaignPiece = /^\/campanas\/[^/]+\/pieza$/.test(pathname);
    const campaignBook = /^\/campanas\/[^/]+\/libro$/.test(pathname);
    const campaignNotice = /^\/campanas\/[^/]+$/.test(pathname);
    if (id === "campaigns") return pathname === "/tablero" || pathname === "/campanas/nueva";
    if (id === "board") return pathname === "/medicion" || (campaignBoard && hash !== "#gasto");
    if (id === "spend") return pathname === "/gasto" || (campaignBoard && hash === "#gasto");
    if (id === "disputes") return pathname === "/disputas" || (campaignBook && hash === "#disputas");
    if (id === "pieces") return pathname === "/piezas" || (campaignPiece && hash !== "#programar");
    if (id === "schedule") return pathname === "/programacion" || (campaignPiece && hash === "#programar");
    if (id === "connections") return pathname.startsWith("/conexiones");
    if (id === "notices") return pathname === "/avisos" || campaignNotice;
    if (id === "security") return pathname === "/seguridad";
    if (id === "plan") return pathname.startsWith("/plan");
    return false;
  }

function NavIcon({ id }: { id: string }) {
  switch (id) {
    case "board":
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v18h18M7.5 15l4.5-5 3.5 3.5 5-6" />
        </svg>
      );
    case "spend":
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6H2.25m0 0v8.25m0 0a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V14.25m-15.797-2.101A60.07 60.07 0 0 1 18 10.05m-15.797 0V6.75m0 0A2.25 2.25 0 0 1 4.5 4.5h15A2.25 2.25 0 0 1 21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75Z" />
        </svg>
      );
    case "disputes":
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0 0 12 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-16.5-.52c-.99.203-1.99.377-3 .52m16.5 0-2.785 8.355a3 3 0 0 1-2.846 2.052H14.25M6.75 4.97 3.965 13.325a3 3 0 0 0 2.846 2.052H8.25" />
        </svg>
      );
    case "campaigns":
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.455a24.475 24.475 0 0 1-1.378-3.957m3.04-9.442c.253-.962.584-1.892.985-2.783.247-.55.06-1.21-.463-1.511l-.657-.38c-.551-.318-1.26-.117-1.527.455a24.475 24.475 0 0 0-1.378 3.957m3.04 9.442a48.49 48.49 0 0 0 6.66 0m-6.66-9.18a48.49 48.49 0 0 1 6.66 0m0 9.18a4.5 4.5 0 0 0 0-9.18" />
        </svg>
      );
    case "pieces":
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
        </svg>
      );
    case "schedule":
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
        </svg>
      );
    case "connections":
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856a9.75 9.75 0 0 1 13.788 0M12 18.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" />
        </svg>
      );
    case "notices":
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>
      );
    case "security":
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
        </svg>
      );
    case "plan":
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
        </svg>
      );
    case "platform":
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
        </svg>
      );
    case "signOut":
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
        </svg>
      );
    default:
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
  }
}

  return (
    <div>
      {open ? <button className="fixed inset-0 z-20 bg-black/20 lg:hidden" type="button" aria-label={t.nav.close} onClick={onClose} /> : null}
      <nav className={open ? "rail is-open" : "rail"} aria-label={t.nav.console}>
        <div className="mb-4 flex items-center justify-between gap-2 px-2">
          <Link className="brand group" href="/tablero">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 text-white shadow-md shadow-indigo-500/25 transition-transform group-hover:scale-105" aria-hidden="true">
              <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856a9.75 9.75 0 0 1 13.788 0M12 18.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" />
              </svg>
            </span>
            <span className="rail-label font-bold text-slate-900 tracking-tight">BroadcastFlow</span>
          </Link>
          <button className="rail-collapse hover:bg-slate-100 transition-colors" type="button" aria-label={t.nav.hide} onClick={onCollapse}>
            <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
        </div>
        {entries.map((entry) => {
          const href = entry.path(campaignId);
          return (
            <Link key={entry.id} className="rail-link" href={href} aria-current={current(entry.id) ? "page" : undefined} title={t.nav[entry.id]}>
              <span className="rail-mark" aria-hidden="true">
                <NavIcon id={entry.id} />
              </span>
              <span className="rail-label">{t.nav[entry.id]}</span>
            </Link>
          );
        })}
        {operator ? (
          <Link className="rail-link" href="/plataforma" title={t.nav.platform}>
            <span className="rail-mark" aria-hidden="true">
              <NavIcon id="platform" />
            </span>
            <span className="rail-label">{t.nav.platform}</span>
          </Link>
        ) : null}
        {signedIn() ? (
          <button
            className="rail-link mt-auto text-left"
            type="button"
            title={t.nav.signOut}
            onClick={async () => {
              await api("/auth/logout", { method: "POST" });
              clearSession();
              router.push("/ingresar");
            }}
          >
            <span className="rail-mark" aria-hidden="true">
              <NavIcon id="signOut" />
            </span>
            <span className="rail-label">{t.nav.signOut}</span>
          </button>
        ) : null}
      </nav>
    </div>
  );
}

function Lugar() {
  const { t } = useI18n();
  const pathname = usePathname();
  const campaignId = pathname.match(/^\/campanas\/(?!nueva(?:\/|$))([^/]+)/)?.[1] ?? null;
  const [campaign, setCampaign] = useState<Campaign | null>(null);

  useEffect(() => {
    if (!campaignId || !signedIn()) {
      setCampaign(null);
      return;
    }
    let alive = true;
    api<{ id: string }[]>("/organizations")
      .then(async (organizations) => {
        if (!organizations[0]) return [] as Campaign[];
        return api<Campaign[]>("/campaigns", { org: organizations[0].id });
      })
      .then((rows) => {
        if (!alive) return;
        setCampaign(rows.find((row) => row.id === campaignId) ?? null);
      })
      .catch(() => {
        if (alive) setCampaign(null);
      });
    return () => {
      alive = false;
    };
  }, [campaignId]);

  if (!campaign?.name || !campaignId) return null;
  const status = campaign.status ?? "";
  return (
    <div className="place-bar">
      <div className="min-w-0">
        <p className="eyebrow">{t.nav.campaigns}</p>
        <p className="place-name">{campaign.name}</p>
      </div>
      {status ? <span className={`status status-${status}`}>{t.status[status as keyof typeof t.status] ?? status}</span> : null}
      <nav className="jumps ml-auto" aria-label={campaign.name}>
        <Link className="chip" href={`/campanas/${campaignId}/tablero`}>{t.nav.board}</Link>
        <Link className="chip" href={`/campanas/${campaignId}/pieza`}>{t.nav.pieces}</Link>
        <Link className="chip" href={`/campanas/${campaignId}`}>{t.nav.notices}</Link>
        <Link className="chip" href={`/campanas/${campaignId}/libro`}>{t.dash.ledger}</Link>
        <Link className="chip text-rose-600 border-rose-200 hover:bg-rose-50" href={`/campanas/${campaignId}/en-vivo`}>
          <span className="inline-block w-2 h-2 rounded-full bg-rose-500 mr-1.5 animate-pulse" />
          Live
        </Link>
        {campaign.slug ? <Link className="chip" href={`/c/${campaign.slug}`}>{t.header.publicPage}</Link> : null}
      </nav>
    </div>
  );
}
