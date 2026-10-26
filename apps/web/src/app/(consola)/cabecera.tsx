"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { fill, Idioma, useI18n } from "@/lib/i18n";
import { api, clearSession, signedIn } from "@/lib/api";
import { Busqueda } from "./busqueda";

type Account = { email: string };
type Organization = { id: string; name: string; role?: string };
type Notice = { id: string; event: string; createdAt: string };

function initials(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
  const compact = value.split("@")[0] ?? value;
  return compact.slice(0, 2).toUpperCase();
}

export function Cabecera({ onMenu }: { onMenu: () => void }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const panel = useRef<HTMLDivElement>(null);
  const accountPanel = useRef<HTMLDivElement>(null);
  const noticeText: Record<string, string> = {
    "live.destination.failed": t.header.liveFailed,
    "support.entered": t.header.supportEntered,
  };
  const dateLocale = locale === "en" ? "en-US" : "es-MX";
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!signedIn()) return;
    setEntered(true);
    api<Account>("/auth/me")
      .then((me) => setEmail(me.email))
      .catch(() => setEmail(""));
    api<Organization[]>("/organizations")
      .then((rows) => setOrganization(rows[0] ?? null))
      .catch(() => setOrganization(null));
    api<Notice[]>("/notifications")
      .then(setNotices)
      .catch(() => setNotices([]));
  }, []);

  useEffect(() => {
    setOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open && !accountOpen) return;
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (open && !panel.current?.contains(target)) setOpen(false);
      if (accountOpen && !accountPanel.current?.contains(target)) setAccountOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setAccountOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, accountOpen]);

  async function signOut() {
    await api("/auth/logout", { method: "POST" });
    clearSession();
    router.push("/ingresar");
  }

  return (
    <header className="console-header">
      <button className="rail-toggle min-h-11 items-center gap-2 px-3 text-slate-700 hover:text-indigo-600 font-semibold transition-colors" type="button" onClick={onMenu}>
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
        <span className="hidden sm:inline">{t.nav.menu}</span>
      </button>
      {entered ? <Busqueda /> : <span className="finder" />}
      <div className="ml-auto flex items-center gap-2">
        {organization?.role === "owner" || organization?.role === "admin" ? (
          <Link className="inline-flex min-h-10 items-center px-2.5 text-sm font-semibold text-slate-600 hover:text-indigo-600 transition-colors" href="/equipo">
            {t.header.team}
          </Link>
        ) : null}
        {entered ? (
          <Link className="header-create inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 px-3.5 text-sm font-semibold text-white shadow-sm shadow-indigo-500/20 hover:from-indigo-500 hover:to-indigo-600 hover:shadow-indigo-500/30 transition-all" href="/campanas/nueva">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span>{t.dash.newCampaign}</span>
          </Link>
        ) : null}
        <Idioma />
        {organization ? (
          <span className="who inline-flex items-center gap-2 px-2.5 py-1 rounded-xl bg-slate-100/80 border border-slate-200/60" title={organization.name}>
            <span className="mark mark-org" aria-hidden="true">{initials(organization.name)}</span>
            <span className="who-name text-xs font-semibold text-slate-700">{organization.name}</span>
          </span>
        ) : null}
        {entered ? (
          <div className="relative" ref={panel}>
            <button
              className="bell"
              type="button"
              aria-label={t.header.notifications}
              aria-expanded={open}
              onClick={() => {
                setAccountOpen(false);
                setOpen((value) => !value);
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 3a5 5 0 0 0-5 5v2.2c0 .8-.3 1.6-.8 2.2L5 14h14l-1.2-1.6a3.4 3.4 0 0 1-.8-2.2V8a5 5 0 0 0-5-5Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <path d="M9.5 17a2.5 2.5 0 0 0 5 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              {notices.length > 0 ? <span className="bell-count">{notices.length}</span> : null}
            </button>
            {open ? (
              <div className="bell-panel" role="region" aria-label={t.header.notifications}>
                {notices.length === 0 ? <p>{t.header.empty}</p> : null}
                <ul className="flex flex-col gap-3">
                  {notices.map((notice) => (
                    <li key={notice.id}>
                      <p className="font-semibold">{noticeText[notice.event] ?? notice.event}</p>
                      <p className="text-sm text-[var(--muted)]">
                        {new Date(notice.createdAt).toLocaleString(dateLocale, { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
        {entered ? (
          <div className="relative" ref={accountPanel}>
            <button
              className="mark mark-user"
              type="button"
              aria-haspopup="menu"
              aria-expanded={accountOpen}
              title={email || t.header.accountBare}
              aria-label={email ? fill(t.header.account, { email }) : t.header.accountBare}
              onClick={() => {
                setOpen(false);
                setAccountOpen((value) => !value);
              }}
            >
              {email ? initials(email) : "·"}
            </button>
            {accountOpen ? (
              <div className="account-panel" role="menu" aria-label={t.header.accountBare}>
                <p className="account-email">{email || t.header.accountBare}</p>
                <Link role="menuitem" href="/seguridad" onClick={() => setAccountOpen(false)}>{t.nav.security}</Link>
                <Link role="menuitem" href="/conexiones" onClick={() => setAccountOpen(false)}>{t.nav.connections}</Link>
                <button role="menuitem" type="button" onClick={signOut}>{t.nav.signOut}</button>
              </div>
            ) : null}
          </div>
        ) : (
          <Link className="inline-flex min-h-11 items-center rounded bg-neutral-900 px-4 text-white" href="/ingresar">
            {t.header.signIn}
          </Link>
        )}
      </div>
    </header>
  );
}
