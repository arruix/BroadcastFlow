"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTx } from "@/lib/i18n";
import { api, explain } from "@/lib/api";

type Organization = { id: string };
type Subscription = { plan: string; status: string; liveMinutesIncluded: number; invoice: { cfdiStatus: string; cfdiUuid: string | null } | null };

export default function PagoPlan() {
  const { tx } = useTx();
  const [organizationId, setOrganizationId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setInvoiceId(new URLSearchParams(window.location.search).get("invoice") ?? "");
    api<Organization[]>("/organizations")
      .then((rows) => setOrganizationId(rows[0]?.id ?? ""))
      .catch((error) => setMessage(explain(error)));
  }, []);

  async function finish(outcome: "paid" | "failed") {
    setMessage("");
    try {
      setSubscription(
        await api<Subscription>("/subscriptions/checkout/result", {
          method: "POST",
          org: organizationId,
          body: JSON.stringify({ invoiceId, outcome }),
        }),
      );
    } catch (error) {
      setMessage(explain(error));
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-semibold">{tx("Pago del plan", "Plan payment")}</h1>
      <p>{tx("Este cobro es de la suscripción. No es un donativo.", "This charge is for the subscription. It is not a donation.")}</p>
      {message ? <p>{message}</p> : null}
      {subscription ? (
        <p>
          {subscription.plan} · {subscription.status} · {tx(`${subscription.liveMinutesIncluded} minutos de live`, `${subscription.liveMinutesIncluded} live minutes`)}
          {subscription.invoice?.cfdiUuid ? ` · CFDI ${subscription.invoice.cfdiUuid}` : ""}
        </p>
      ) : null}
      <button className="min-h-11 rounded bg-neutral-900 px-4 text-white" type="button" onClick={() => finish("paid")} disabled={!invoiceId}>
        {tx("Pago correcto", "Payment succeeded")}
      </button>
      <button className="min-h-11 rounded border px-4 text-left" type="button" onClick={() => finish("failed")} disabled={!invoiceId}>
        {tx("Pago fallido", "Payment failed")}
      </button>
      <Link className="inline-flex min-h-11 items-center" href="/plan">
        {tx("Volver al plan", "Back to the plan")}
      </Link>
    </main>
  );
}
