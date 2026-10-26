"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { api, signedIn } from "@/lib/api";

type Campaign = { id: string; name: string; slug: string; status: string; kind: string; organization: string };

const sections = [
  { id: "board", path: (campaignId: string | null) => (campaignId ? `/campanas/${campaignId}/tablero` : "/medicion") },
  { id: "spend", path: (campaignId: string | null) => (campaignId ? `/campanas/${campaignId}/tablero#gasto` : "/gasto") },
  { id: "disputes", path: (campaignId: string | null) => (campaignId ? `/campanas/${campaignId}/libro#disputas` : "/disputas") },
  { id: "campaigns", path: () => "/tablero" },
  { id: "pieces", path: (campaignId: string | null) => (campaignId ? `/campanas/${campaignId}/pieza` : "/piezas") },
  { id: "schedule", path: (campaignId: string | null) => (campaignId ? `/campanas/${campaignId}/pieza#programar` : "/programacion") },
  { id: "connections", path: () => "/conexiones" },
  { id: "notices", path: (campaignId: string | null) => (campaignId ? `/campanas/${campaignId}` : "/avisos") },
  { id: "security", path: () => "/seguridad" },
  { id: "plan", path: () => "/plan" },
  { id: "platform", path: () => "/plataforma" },
] as const;

export function Busqueda() {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [operator, setOperator] = useState(false);
  const [manager, setManager] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  useEffect(() => {
    function onShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  useEffect(() => {
    if (!signedIn()) return;
    api<{ platformOperator: boolean }>("/auth/me")
      .then((me) => setOperator(me.platformOperator))
      .catch(() => setOperator(false));
    api<{ id: string; name: string; role?: string }[]>("/organizations")
      .then(async (organizations) => {
        setManager(organizations.some((organization) => organization.role === "owner" || organization.role === "admin"));
        const lists = await Promise.all(
          organizations.map(async (organization) => {
            const rows = await api<Omit<Campaign, "organization">[]>("/campaigns", { org: organization.id });
            return rows.map((row) => ({ ...row, organization: organization.name }));
          }),
        );
        setCampaigns(lists.flat());
      })
      .catch(() => setCampaigns([]));
  }, []);

  useEffect(() => {
    setQuery("");
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  const focusId = pathname.match(/^\/campanas\/(?!nueva(?:\/|$))([^/]+)/)?.[1] ?? campaigns[0]?.id ?? null;
  const needle = query.trim().toLocaleLowerCase();

  const campaignHits = useMemo(() => {
    if (!needle) return [];
    return campaigns
      .filter((campaign) => `${campaign.name} ${campaign.slug} ${campaign.organization}`.toLocaleLowerCase().includes(needle))
      .slice(0, 8);
  }, [campaigns, needle]);

  const sectionHits = useMemo(() => {
    if (!needle) return [];
    const catalog: { id: string; path: (campaignId: string | null) => string }[] = [
      ...sections,
      ...(manager ? [{ id: "team", path: () => "/equipo" }] : []),
    ];
    return catalog.filter((section) => {
      if (section.id === "platform" && !operator) return false;
      const label = (section.id === "team" ? t.header.team : t.nav[section.id as keyof typeof t.nav]).toLocaleLowerCase();
      return label.startsWith(needle) || label.split(/\s+/).some((word) => word.startsWith(needle));
    });
  }, [needle, operator, manager, t]);

  const hits = [
    ...campaignHits.map((campaign) => ({
      key: campaign.id,
      href: `/campanas/${campaign.id}`,
      title: campaign.name,
      detail: `${t.kind[campaign.kind as keyof typeof t.kind] ?? campaign.kind} · /${campaign.slug}`,
    })),
    ...sectionHits.map((section) => ({
      key: section.id,
      href: section.path(focusId),
      title: section.id === "team" ? t.header.team : t.nav[section.id as keyof typeof t.nav],
      detail: t.header.searchSections,
    })),
  ];

  useEffect(() => {
    setActive(0);
  }, [needle]);

  function onKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!hits.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((value) => (value + 1) % hits.length);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((value) => (value - 1 + hits.length) % hits.length);
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const hit = hits[active] ?? hits[0];
      if (!hit) return;
      setOpen(false);
      router.push(hit.href);
    }
  }

  return (
    <div className="finder relative" ref={box}>
      <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
      </svg>
      <input
        ref={inputRef}
        aria-label={t.header.searchLabel}
        placeholder={t.header.search}
        role="combobox"
        aria-expanded={open && needle.length > 0}
        aria-controls="console-search"
        value={query}
        className="pl-9 pr-11"
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
        ⌘K
      </kbd>
      {open && needle ? (
        <div className="finder-panel" id="console-search" role="listbox">
          {hits.length === 0 ? <p className="px-2 py-2">{t.header.searchEmpty}</p> : null}
          {campaignHits.length > 0 ? <p className="finder-label">{t.header.searchCampaigns}</p> : null}
          {hits
            .filter((hit) => campaignHits.some((campaign) => campaign.id === hit.key))
            .map((hit) => {
              const index = hits.findIndex((item) => item.key === hit.key);
              return (
                <Link key={hit.key} className="finder-hit" href={hit.href} role="option" aria-selected={index === active} data-active={index === active} onMouseEnter={() => setActive(index)}>
                  <span className="font-semibold">{hit.title}</span>
                  <span className="text-sm text-[var(--muted)]">{hit.detail}</span>
                </Link>
              );
            })}
          {sectionHits.length > 0 ? <p className="finder-label">{t.header.searchSections}</p> : null}
          {hits
            .filter((hit) => sectionHits.some((section) => section.id === hit.key))
            .map((hit) => {
              const index = hits.findIndex((item) => item.key === hit.key);
              return (
                <Link key={hit.key} className="finder-hit" href={hit.href} role="option" aria-selected={index === active} data-active={index === active} onMouseEnter={() => setActive(index)}>
                  <span className="font-semibold">{hit.title}</span>
                </Link>
              );
            })}
        </div>
      ) : null}
    </div>
  );
}
