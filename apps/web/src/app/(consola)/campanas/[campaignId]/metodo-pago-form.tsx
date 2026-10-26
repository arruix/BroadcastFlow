"use client";

import { FormEvent, useState } from "react";
import { useTx } from "@/lib/i18n";
import { api, explain } from "@/lib/api";

export type CampaignPaymentMethod = {
  link: { url: string; provider: string } | null;
  transfer: { bank: string; holder: string; clabe: string; reference: string | null } | null;
};

// Método de pago externo: el dinero va directo a la cuenta del cliente.
export function MetodoPagoForm({
  campaignId,
  organizationId,
  initial,
}: {
  campaignId: string;
  organizationId: string;
  initial: CampaignPaymentMethod | null;
}) {
  const { tx } = useTx();
  const [link, setLink] = useState(initial?.link?.url ?? "");
  const [bank, setBank] = useState(initial?.transfer?.bank ?? "");
  const [holder, setHolder] = useState(initial?.transfer?.holder ?? "");
  const [clabe, setClabe] = useState(initial?.transfer?.clabe ?? "");
  const [reference, setReference] = useState(initial?.transfer?.reference ?? "");
  const [message, setMessage] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      await api(`/campaigns/${campaignId}/payment-method`, {
        method: "PUT",
        org: organizationId,
        body: JSON.stringify({
          paymentLinkUrl: link || null,
          transferBank: bank || null,
          transferHolder: holder || null,
          transferClabe: clabe || null,
          transferReference: reference || null,
        }),
      });
      setMessage(tx("Método de pago guardado.", "Payment method saved."));
    } catch (error) {
      setMessage(explain(error));
    }
  }

  const field = "min-h-11 rounded border px-3";
  return (
    <form className="sheet" onSubmit={save} aria-labelledby="pago-titulo">
      <h2 id="pago-titulo" className="text-2xl">{tx("Método de pago externo (opcional)", "External payment method (optional)")}</h2>
      <p className="note">
        {tx(
          "El donativo se paga directamente a tu cuenta; BroadcastFlow no recibe ni procesa el dinero. Si lo dejas vacío, la página solo registra intenciones de donativo.",
          "Donations are paid directly to your account; BroadcastFlow does not receive or process the money. If left empty, the page only records donation intents.",
        )}
      </p>
      <label className="flex flex-col gap-1">
        {tx("Enlace de pago (Mercado Pago, PayPal, Stripe; https)", "Payment link (Mercado Pago, PayPal, Stripe; https)")}
        <input className={field} type="url" inputMode="url" placeholder="https://mpago.la/…" value={link} onChange={(event) => setLink(event.target.value)} />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend>{tx("Transferencia bancaria", "Bank transfer")}</legend>
        <label className="flex flex-col gap-1">
          {tx("Banco", "Bank")}
          <input className={field} value={bank} onChange={(event) => setBank(event.target.value)} maxLength={80} />
        </label>
        <label className="flex flex-col gap-1">
          {tx("Titular", "Account holder")}
          <input className={field} value={holder} onChange={(event) => setHolder(event.target.value)} maxLength={120} />
        </label>
        <label className="flex flex-col gap-1">
          CLABE
          <input className={field} inputMode="numeric" pattern="[0-9 \-]{18,23}" value={clabe} onChange={(event) => setClabe(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          {tx("Referencia (opcional)", "Reference (optional)")}
          <input className={field} value={reference} onChange={(event) => setReference(event.target.value)} maxLength={60} />
        </label>
      </fieldset>
      {message ? <p className="note" role="status">{message}</p> : null}
      <button className="min-h-11 w-fit rounded bg-neutral-900 px-4 text-white" type="submit">
        {tx("Guardar método de pago", "Save payment method")}
      </button>
    </form>
  );
}
