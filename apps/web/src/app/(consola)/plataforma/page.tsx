"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useTx } from "@/lib/i18n";
import { api, download, explain, signedIn } from "@/lib/api";

type Summary = {
  activeOrganizations: number;
  campaigns: number;
  stuckPayments: number;
  income: { currency: string; subscriptionsMinor: number; feesMinor: number }[];
};
type Org = {
  id: string;
  name: string;
  country: string;
  identityVerified: boolean;
  plan: string;
  subscriptionStatus: string;
};
type Campaign = {
  id: string;
  name: string;
  status: string;
  organization: string;
  currency: string;
  grossMinor: number;
  coverage: number;
  hasLedger: boolean;
};
type Payment = { kind: string; id: string; detail: string };
type UserRow = { id: string; email: string; blocked: boolean; memberships: number };

function money(minor: number) {
  return (minor / 100).toFixed(2);
}

export default function Plataforma() {
  const { tx } = useTx();
  const [needsOperator, setNeedsOperator] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [organizations, setOrganizations] = useState<Org[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [name, setName] = useState("");
  const [country, setCountry] = useState("MX");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const statusLabel: Record<string, string> = {
    borrador: tx("borrador", "draft"),
    activa: tx("activa", "active"),
    pausada: tx("pausada", "paused"),
    cerrada: tx("cerrada", "closed"),
  };

  async function load() {
    const [nextSummary, nextOrganizations, nextCampaigns, nextPayments] = await Promise.all([
      api<Summary>("/platform/summary"),
      api<Org[]>("/platform/organizations"),
      api<Campaign[]>("/platform/campaigns"),
      api<Payment[]>("/platform/payments"),
    ]);
    setSummary(nextSummary);
    setOrganizations(nextOrganizations);
    setCampaigns(nextCampaigns);
    setPayments(nextPayments);
  }

  useEffect(() => {
    if (!signedIn()) {
      setNeedsOperator(true);
      return;
    }
    load().catch((error) => setMessage(explain(error)));
  }, []);

  async function createOrg(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      await api("/platform/organizations", {
        method: "POST",
        body: JSON.stringify({ name, country, ownerEmail }),
      });
      setName("");
      setOwnerEmail("");
      await load();
    } catch (error) {
      setMessage(explain(error));
    }
  }

  async function support(organizationId: string) {
    setMessage("");
    try {
      const visit = await api<{ name: string }>(`/platform/organizations/${organizationId}/support`, { method: "POST" });
      setMessage(tx(`Modo soporte en ${visit.name}. El owner ve este acceso.`, `Support mode in ${visit.name}. The owner sees this access.`));
    } catch (error) {
      setMessage(explain(error));
    }
  }

  async function pause(campaignId: string) {
    setMessage("");
    try {
      await api(`/platform/campaigns/${campaignId}/pause`, { method: "POST" });
      await load();
    } catch (error) {
      setMessage(explain(error));
    }
  }

  async function retry(webhookId: string) {
    setMessage("");
    try {
      const result = await api<{ result: string }>(`/platform/webhooks/${webhookId}/retry`, { method: "POST" });
      setMessage(result.result === "already_applied" ? tx("El webhook ya estaba aplicado. El libro no cambió.", "The webhook was already applied. The ledger did not change.") : tx("Webhook reintentado.", "Webhook retried."));
    } catch (error) {
      setMessage(explain(error));
    }
  }

  async function csv() {
    setMessage("");
    try {
      const blob = await download("/platform/income.csv", "");
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "ingresos.csv";
      anchor.click();
      setMessage(tx(`CSV listo, ${blob.size} bytes.`, `CSV ready, ${blob.size} bytes.`));
    } catch (error) {
      setMessage(explain(error));
    }
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      setUsers(await api<UserRow[]>(`/platform/users?q=${encodeURIComponent(query)}`));
    } catch (error) {
      setMessage(explain(error));
    }
  }

  async function act(userId: string, action: "block" | "sessions" | "remove") {
    setMessage("");
    try {
      await api(`/platform/users/${userId}/${action}`, { method: "POST" });
      setUsers(await api<UserRow[]>(`/platform/users?q=${encodeURIComponent(query)}`));
    } catch (error) {
      setMessage(explain(error));
    }
  }

  return (
    <main className="console-page">
      <header className="flex flex-col gap-2">
        <p className="eyebrow">{tx("Operación", "Operations")}</p>
        <h1 className="text-4xl">{tx("Plataforma", "Platform")}</h1>
        <p className="lede">{tx("Organizaciones, campañas, ingresos y cuentas. El libro no se reescribe desde aquí.", "Organizations, campaigns, income, and accounts. The ledger is not rewritten from here.")}</p>
      </header>
      <nav className="jumps" aria-label={tx("Secciones de plataforma", "Platform sections")}>
        <a className="chip" href="#resumen">{tx("Resumen", "Summary")}</a>
        <a className="chip" href="#organizaciones">{tx("Organizaciones", "Organizations")}</a>
        <a className="chip" href="#campanas">{tx("Campañas", "Campaigns")}</a>
        <a className="chip" href="#ingresos">{tx("Ingresos", "Income")}</a>
        <a className="chip" href="#pagos">{tx("Pagos", "Payments")}</a>
        <a className="chip" href="#usuarios">{tx("Usuarios", "Users")}</a>
      </nav>
      {needsOperator ? (
        <p className="note">
          {tx("Entra como operador.", "Sign in as the operator.")}{" "}
          <Link href="/ingresar">{tx("Entrar", "Sign in")}</Link>
        </p>
      ) : null}
      {message ? <p className="note">{message}</p> : null}

      <section id="resumen" className="ops-hero">
        <div className="flex flex-col gap-1">
          <p className="eyebrow">{tx("Ahora", "Now")}</p>
          <h2 className="text-4xl">{tx("Resumen", "Summary")}</h2>
          <p className="lede">{tx("Lo que está activo ahora.", "What is active right now.")}</p>
        </div>
        {summary ? (
          <div className="stat-grid">
            <article className="stat">
              <p className="stat-label">{tx("Organizaciones", "Organizations")}</p>
              <p className="stat-value">{summary.activeOrganizations}</p>
              <p className="stat-hint">{tx("con identidad", "with identity")}</p>
            </article>
            <article className="stat">
              <p className="stat-label">{tx("Campañas", "Campaigns")}</p>
              <p className="stat-value">{summary.campaigns}</p>
              <p className="stat-hint">{tx("en la plataforma", "on the platform")}</p>
            </article>
            <article className={summary.stuckPayments > 0 ? "stat stat-alert" : "stat"}>
              <p className="stat-label">{tx("Pagos", "Payments")}</p>
              <p className="stat-value">{summary.stuckPayments}</p>
              <p className="stat-hint">{summary.stuckPayments === 0 ? tx("al día", "clear") : tx("atorados", "stuck")}</p>
            </article>
            {summary.income.map((row) => (
              <article key={row.currency} className="stat">
                <p className="stat-label">{tx("Ingresos", "Income")} {row.currency}</p>
                <p className="stat-value">{money(row.subscriptionsMinor + row.feesMinor)}</p>
                <p className="stat-hint">{tx("suscripción más comisión", "subscription plus fee")}</p>
              </article>
            ))}
          </div>
        ) : (
          <p>{tx("Cargando el resumen.", "Loading the summary.")}</p>
        )}
      </section>

      <section id="organizaciones" className="sheet">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl">{tx("Organizaciones", "Organizations")}</h2>
          <p className="lede">{tx("Sin identidad no se activa ni se dispersa.", "Without identity it does not activate and does not pay out.")}</p>
        </div>
        <form className="flex flex-col gap-3" onSubmit={createOrg}>
          <div className="fields">
            <label className="flex flex-col gap-1">
              {tx("Nombre", "Name")}
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              {tx("País", "Country")}
              <input value={country} onChange={(event) => setCountry(event.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              {tx("Correo del owner", "Owner email")}
              <input type="email" value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} />
            </label>
          </div>
          <button className="min-h-11 w-fit rounded bg-neutral-900 px-4 text-white" type="submit">
            {tx("Dar de alta", "Create")}
          </button>
        </form>
        <div className="flex flex-col gap-2">
          {organizations.map((organization) => (
            <article key={organization.id} className="row">
              <div className="row-main">
                <p className="font-semibold">{organization.name}</p>
                <p className="flex flex-wrap gap-2">
                  <span className="status">{organization.country}</span>
                  <span className="status">{organization.plan}</span>
                  <span className="status">{organization.subscriptionStatus}</span>
                  <span className={organization.identityVerified ? "status status-activa" : "status"}>
                    {organization.identityVerified ? tx("identidad verificada", "identity verified") : tx("sin identidad", "no identity")}
                  </span>
                </p>
              </div>
              <div className="row-actions">
                <button className="quiet" type="button" onClick={() => support(organization.id)}>
                  {tx("Entrar en soporte", "Enter support")}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="campanas" className="sheet">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl">{tx("Campañas", "Campaigns")}</h2>
          <p className="lede">{tx("Con libro no se borra. Se pausa la página.", "With a ledger it is not deleted. The page is paused.")}</p>
        </div>
        <div className="flex flex-col gap-2">
          {campaigns.map((campaign) => (
            <article key={campaign.id} className="row">
              <div className="row-main">
                <p className="font-semibold">{campaign.name}</p>
                <p className="text-sm text-[var(--muted)]">{campaign.organization}</p>
                <p className="flex flex-wrap gap-2">
                  <span className={`status status-${campaign.status}`}>{statusLabel[campaign.status] ?? campaign.status}</span>
                  <span className="status">{tx("bruto", "gross")} {money(campaign.grossMinor)} {campaign.currency}</span>
                  <span className="status">{tx(`${campaign.coverage} redes`, `${campaign.coverage} networks`)}</span>
                </p>
              </div>
              {campaign.status === "activa" ? (
                <div className="row-actions">
                  <button className="quiet-warn" type="button" onClick={() => pause(campaign.id)}>
                    {tx("Pausar página", "Pause page")}
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section id="ingresos" className="sheet">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl">{tx("Ingresos", "Income")}</h2>
            <p className="lede">{tx("Suscripciones cobradas más comisión. No es el neto de las campañas.", "Collected subscriptions plus fees. It is not the campaigns' net.")}</p>
          </div>
          <button className="quiet" type="button" onClick={csv}>
            {tx("Descargar CSV", "Download CSV")}
          </button>
        </div>
        <div className="stat-grid">
          {summary?.income.map((row) => (
            <article key={row.currency} className="stat">
              <p className="stat-label">{row.currency}</p>
              <p className="stat-value">{money(row.subscriptionsMinor + row.feesMinor)}</p>
              <p className="stat-hint">
                {tx("suscripción", "subscription")} {money(row.subscriptionsMinor)} · {tx("comisión", "fee")} {money(row.feesMinor)}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section id="pagos" className="sheet">
        <h2 className="text-2xl">{tx("Pagos", "Payments")}</h2>
        {payments.length === 0 ? <p className="text-sm text-[var(--muted)]">{tx("No hay pagos atorados.", "There are no stuck payments.")}</p> : null}
        <div className="flex flex-col gap-2">
          {payments.map((payment) => (
            <article key={`${payment.kind}-${payment.id}`} className="row">
              <div className="row-main">
                <p className="font-semibold">{payment.kind}</p>
                <p className="text-sm text-[var(--muted)]">{payment.detail}</p>
              </div>
              {payment.kind === "webhook" ? (
                <div className="row-actions">
                  <button className="quiet" type="button" onClick={() => retry(payment.id)}>
                    {tx("Reintentar", "Retry")}
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section id="usuarios" className="sheet">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl">{tx("Usuarios", "Users")}</h2>
          <p className="lede">{tx("Busca por correo. Bloquear, cerrar sesiones o eliminar no toca el libro.", "Search by email. Blocking, closing sessions, or removing does not touch the ledger.")}</p>
        </div>
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={search}>
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            {tx("Correo", "Email")}
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <button className="min-h-11 rounded bg-neutral-900 px-4 text-white" type="submit">
            {tx("Buscar", "Search")}
          </button>
        </form>
        <div className="flex flex-col gap-2">
          {users.map((user) => (
            <article key={user.id} className="row">
              <div className="row-main">
                <p className="font-semibold">{user.email}</p>
                <p className="flex flex-wrap gap-2">
                  {user.blocked ? <span className="status status-cerrada">{tx("bloqueada", "blocked")}</span> : <span className="status status-activa">{tx("activa", "active")}</span>}
                  <span className="status">{tx(`${user.memberships} membresías`, `${user.memberships} memberships`)}</span>
                </p>
              </div>
              <div className="row-actions">
                <button className="quiet-warn" type="button" onClick={() => act(user.id, "block")}>
                  {tx("Bloquear", "Block")}
                </button>
                <button className="quiet" type="button" onClick={() => act(user.id, "sessions")}>
                  {tx("Cerrar sesiones", "Close sessions")}
                </button>
                <button className="quiet-warn" type="button" onClick={() => act(user.id, "remove")}>
                  {tx("Eliminar", "Remove")}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
