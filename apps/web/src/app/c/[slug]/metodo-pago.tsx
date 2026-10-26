"use client";

import { useState } from "react";
import { useTx } from "@/lib/i18n";
import { sendVisit } from "./pixel";

export type PaymentMethod = {
  link: { url: string; provider: string } | null;
  transfer: { bank: string; holder: string; clabe: string; reference: string | null } | null;
};

const providerName: Record<string, string> = {
  mercadopago: "Mercado Pago",
  paypal: "PayPal",
  stripe: "Stripe",
};

// Método de pago externo del dueño de la campaña. BroadcastFlow no cobra ni procesa el dinero.
export function MetodoPago({ slug, method }: { slug: string; method: PaymentMethod }) {
  const { tx } = useTx();
  const [showTransfer, setShowTransfer] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  function revealTransfer() {
    if (!showTransfer) sendVisit(slug, "pay_transfer");
    setShowTransfer(true);
  }

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
    } catch {
      setCopied(null);
    }
  }

  const provider = method.link ? providerName[method.link.provider] : undefined;

  return (
    <section aria-labelledby="donar-titulo" className="pago-externo">
      <h2 id="donar-titulo">{tx("Donar", "Donate")}</h2>
      <p className="pago-aviso">
        <strong>
          {tx(
            "El pago va directamente al responsable de la campaña; BroadcastFlow no recibe ni procesa el dinero.",
            "Payment goes directly to the campaign owner; BroadcastFlow does not receive or process the money.",
          )}
        </strong>
      </p>
      {method.link ? (
        <div className="flex flex-col gap-1.5">
          <a
            className="pago-boton"
            href={method.link.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => sendVisit(slug, "pay_link")}
          >
            {provider ? tx(`Donar con ${provider}`, `Donate with ${provider}`) : tx("Donar", "Donate")}
          </a>
          <small className="pago-nota">{tx("Se abre en una pestaña nueva.", "Opens in a new tab.")}</small>
        </div>
      ) : null}
      {method.transfer ? (
        showTransfer ? (
          <dl className="pago-datos">
            <dt>{tx("Banco", "Bank")}</dt>
            <dd>{method.transfer.bank}</dd>
            <dt>{tx("Titular", "Account holder")}</dt>
            <dd>{method.transfer.holder}</dd>
            <dt>CLABE</dt>
            <dd aria-live="polite">
              <code>{method.transfer.clabe}</code>
              <button className="pago-copiar" type="button" onClick={() => copy("clabe", method.transfer!.clabe)}>
                {copied === "clabe" ? tx("Copiada", "Copied") : tx("Copiar CLABE", "Copy CLABE")}
              </button>
            </dd>
            {method.transfer.reference ? (
              <>
                <dt>{tx("Referencia", "Reference")}</dt>
                <dd>
                  <code>{method.transfer.reference}</code>
                  <button className="pago-copiar" type="button" onClick={() => copy("ref", method.transfer!.reference!)}>
                    {copied === "ref" ? tx("Copiada", "Copied") : tx("Copiar referencia", "Copy reference")}
                  </button>
                </dd>
              </>
            ) : null}
          </dl>
        ) : (
          <p>
            <button className="pago-secundario" type="button" onClick={revealTransfer}>
              {tx("Donar por transferencia", "Donate by bank transfer")}
            </button>
          </p>
        )
      ) : null}
    </section>
  );
}
