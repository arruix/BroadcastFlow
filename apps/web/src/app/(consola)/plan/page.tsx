"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTx } from "@/lib/i18n";
import { api, explain, signedIn } from "@/lib/api";

type Organization = { id: string };
type Plan = { code: string; priceMinor: number; currency: string; liveMinutesIncluded: number };
type Subscription = {
  plan: string;
  status: string;
  liveMinutesIncluded: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  pendingPlan: string | null;
  invoice: { id: string; status: string; cfdiStatus: string; cfdiUuid: string | null } | null;
};

export default function PlanPage() {
  const { tx } = useTx();
  const [organizationId, setOrganizationId] = useState("");
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);

  useEffect(() => {
    if (!signedIn()) {
      setNeedsSignIn(true);
      return;
    }
    api<Organization[]>("/organizations")
      .then(async (rows) => {
        const org = rows[0]?.id ?? "";
        setOrganizationId(org);
        if (!org) return;
        setSubscription(await api<Subscription>("/subscription", { org }));
        setPlans(await api<Plan[]>("/plans"));
      })
      .catch((error) => setMessage(explain(error)));
  }, []);

  async function checkout() {
    setMessage("");
    try {
      if (code.trim()) {
        await api("/auth/step-up", { method: "POST", body: JSON.stringify({ code: code.trim() }) });
      }
      const started = await api<{ checkoutUrl: string }>("/subscriptions/checkout", {
        method: "POST",
        org: organizationId,
        body: JSON.stringify({ plan: "campana" }),
      });
      window.location.assign(started.checkoutUrl);
    } catch (error) {
      setMessage(explain(error));
    }
  }

  async function cancel() {
    setMessage("");
    try {
      setSubscription(await api<Subscription>("/subscriptions/cancel", { method: "POST", org: organizationId }));
    } catch (error) {
      setMessage(explain(error));
    }
  }

  return (
    <main className="console-page">
      <header className="flex flex-col gap-2">
        <p className="eyebrow">{tx("Consola", "Console")}</p>
        <h1 className="text-4xl">{tx("Plan", "Plan")}</h1>
      </header>
      {needsSignIn ? <p className="note">{tx("Entra para ver el plan.", "Sign in to see the plan.")}</p> : null}
      {message ? <p className="note">{message}</p> : null}
      {subscription ? (
        <section className="sheet">
          <div className="stat-grid">
            <article className="stat">
              <p className="stat-label">{tx("Plan actual", "Current plan")}</p>
              <p className="stat-value">{subscription.plan}</p>
              <p className="stat-hint">{subscription.status}</p>
            </article>
            <article className="stat">
              <p className="stat-label">{tx("Live", "Live")}</p>
              <p className="stat-value">{subscription.liveMinutesIncluded}</p>
              <p className="stat-hint">{tx("minutos al mes", "minutes per month")}</p>
            </article>
          </div>
          {subscription.cancelAtPeriodEnd ? <p>{tx("Se cancela al fin del periodo.", "It cancels at the end of the period.")}</p> : null}
          {subscription.pendingPlan ? <p>{tx(`Cambio pendiente a ${subscription.pendingPlan}.`, `Change pending to ${subscription.pendingPlan}.`)}</p> : null}
          {subscription.invoice?.cfdiStatus === "stamped" ? <p>CFDI {subscription.invoice.cfdiUuid}</p> : null}
          {subscription.invoice?.cfdiStatus === "failed" ? <p>{tx("El timbrado falló. La suscripción puede seguir activa.", "Stamping failed. The subscription can stay active.")}</p> : null}
        </section>
      ) : null}
      {plans.length ? (
        <section className="sheet">
          <h2 className="text-2xl">{tx("Planes", "Plans")}</h2>
          <div className="flex flex-col gap-2">
            {plans.map((plan) => (
              <article key={plan.code} className="row">
                <div className="row-main">
                  <p className="font-semibold">{plan.code}</p>
                  <p className="text-sm text-[var(--muted)]">{tx(`${plan.liveMinutesIncluded} minutos de live`, `${plan.liveMinutesIncluded} live minutes`)}</p>
                </div>
                <p className="stat-value">{(plan.priceMinor / 100).toFixed(2)} {plan.currency}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      {organizationId && subscription?.status !== "active" ? (
        <section className="sheet">
          <label className="flex flex-col gap-2">
            {tx("Código, si la organización ya dispersa", "Code, if the organization already pays out")}
            <input className="min-h-11 rounded border px-3" value={code} onChange={(event) => setCode(event.target.value)} />
          </label>
          <button className="min-h-11 w-fit rounded bg-neutral-900 px-4 text-white" type="button" onClick={checkout}>
            {tx("Contratar plan campaña", "Buy the campaign plan")}
          </button>
        </section>
      ) : null}
      {subscription?.status === "active" && !subscription.cancelAtPeriodEnd ? (
        <button className="min-h-11 rounded border px-4 text-left" type="button" onClick={cancel}>
          {tx("Cancelar al fin del periodo", "Cancel at the end of the period")}
        </button>
      ) : null}
      {!signedIn() ? (
        <Link className="inline-flex min-h-11 items-center" href="/ingresar">
          {tx("Entrar", "Sign in")}
        </Link>
      ) : null}
    </main>
  );
}
