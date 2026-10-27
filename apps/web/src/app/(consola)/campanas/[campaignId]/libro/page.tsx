"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useTx } from "@/lib/i18n";
import { api, download, explain } from "@/lib/api";

type Organization = { id: string };
type Book = {
  campaignName: string;
  currency: string;
  availableMinor: number;
  identityVerified: boolean;
  legalName: string | null;
  account: { destinationRef: string; currency: string } | null;
  entries: { id: string; kind: string; amountMinor: number; currency: string }[];
  payouts: { id: string; amountMinor: number; currency: string; status: string; requestedBy: string }[];
};
type Dispute = { donationId: string; status: string; netMinor: number; currency: string; dueAt: string };

export default function Libro({ params }: { params: Promise<{ campaignId: string }> }) {
  const { tx } = useTx();
  const [organizationId, setOrganizationId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [book, setBook] = useState<Book | null>(null);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [code, setCode] = useState("");
  const [legalName, setLegalName] = useState("");
  const [destinationRef, setDestinationRef] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [donationId, setDonationId] = useState("");
  const [rightsAction, setRightsAction] = useState("access");
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [message, setMessage] = useState("");

  async function load(org: string, campaign: string) {
    setBook(await api<Book>(`/campaigns/${campaign}/ledger`, { org }));
    setDisputes(await api<Dispute[]>(`/campaigns/${campaign}/disputes`, { org }));
  }

  useEffect(() => {
    params.then(async ({ campaignId: current }) => {
      const organizations = await api<Organization[]>("/organizations");
      const org = organizations[0]?.id ?? "";
      setOrganizationId(org);
      setCampaignId(current);
      if (!org) return;
      await load(org, current);
    }).catch((error) => setMessage(explain(error)));
  }, [params]);

  async function elevate(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      await api("/auth/step-up", { method: "POST", body: JSON.stringify({ code }) });
      setMessage("Código aceptado por diez minutos.");
    } catch (error) {
      setMessage(explain(error));
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      await api(`/organizations/${organizationId}/identity`, {
        method: "POST",
        org: organizationId,
        body: JSON.stringify({ legalName }),
      });
      await load(organizationId, campaignId);
    } catch (error) {
      setMessage(explain(error));
    }
  }

  async function saveAccount(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      await api(`/organizations/${organizationId}/payout-account`, {
        method: "POST",
        org: organizationId,
        body: JSON.stringify({ destinationRef, currency }),
      });
      await load(organizationId, campaignId);
    } catch (error) {
      setMessage(explain(error));
    }
  }

  async function addOwner(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      await api(`/organizations/${organizationId}/owners`, {
        method: "POST",
        org: organizationId,
        body: JSON.stringify({ email }),
      });
      setMessage("El otro owner ya puede aprobar.");
    } catch (error) {
      setMessage(explain(error));
    }
  }

  async function requestPayout(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      const payout = await api<{ status: string }>(`/campaigns/${campaignId}/payouts`, {
        method: "POST",
        org: organizationId,
        body: JSON.stringify({ amountMinor: Number(amount) }),
      });
      setMessage(payout.status === "requested" ? "El otro owner tiene que aprobar esta dispersión." : "Dispersión enviada.");
      await load(organizationId, campaignId);
    } catch (error) {
      setMessage(explain(error));
    }
  }

  async function approve(payoutId: string) {
    setMessage("");
    try {
      await api(`/payouts/${payoutId}/approve`, { method: "POST", org: organizationId });
      setMessage("Dispersión enviada.");
      await load(organizationId, campaignId);
    } catch (error) {
      setMessage(explain(error));
    }
  }

  async function attend(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      const record = await api<{ donorName: string | null; donorEmail: string | null; anonymizedAt: string | null; grossMinor: number }>(
        `/donations/${donationId}/rights`,
        {
          method: "POST",
          org: organizationId,
          body: JSON.stringify({ action: rightsAction, donorName, donorEmail }),
        },
      );
      const contact = record.anonymizedAt ? "Nombre y correo vacíos." : `${record.donorName ?? ""} · ${record.donorEmail ?? ""}`;
      setMessage(`${contact} El bruto sigue en ${(record.grossMinor / 100).toFixed(2)}.`);
    } catch (error) {
      setMessage(explain(error));
    }
  }

  async function report() {
    setMessage("");
    try {
      const job = await api<{ id: string }>(`/campaigns/${campaignId}/ledger/report`, { method: "POST", org: organizationId });
      const blob = await download(`/reports/${job.id}`, organizationId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "libro.pdf";
      anchor.click();
      setMessage(tx(`PDF listo, ${blob.size} bytes.`, `PDF ready, ${blob.size} bytes.`));
    } catch (error) {
      setMessage(explain(error));
    }
  }

  return (
    <main className="console-page">
      <header className="flex flex-col gap-2">
        <p className="eyebrow">{tx("Movimientos", "Money movements")}</p>
        <h1 className="text-4xl">{book?.campaignName ?? tx("Movimientos", "Money movements")}</h1>
      </header>
      {message ? <p className="note">{message}</p> : null}
      {book ? (
        <section className="stat-grid">
          <article className="stat">
            <p className="stat-label">{tx("Disponible", "Available")}</p>
            <p className="stat-value">{(book.availableMinor / 100).toFixed(2)}</p>
            <p className="stat-hint">{book.currency}</p>
          </article>
          <article className="stat">
            <p className="stat-label">{tx("Identidad", "Identity")}</p>
            <p className="stat-value">{book.identityVerified ? tx("Sí", "Yes") : tx("No", "No")}</p>
            <p className="stat-hint">{book.legalName ?? tx("Sin nombre legal", "No legal name")}</p>
          </article>
          <article className="stat">
            <p className="stat-label">{tx("Cuenta", "Account")}</p>
            <p className="stat-value">{book.account ? book.account.currency : "—"}</p>
            <p className="stat-hint">{book.account?.destinationRef ?? tx("Sin cuenta destino", "No destination account")}</p>
          </article>
        </section>
      ) : null}
      <section className="sheet">
      <h2 className="text-2xl">{tx("Para dispersar", "To pay out")}</h2>
      <form className="flex flex-col gap-3" onSubmit={elevate}>
        <label className="flex flex-col gap-2">
          {tx("Código", "Code")}
          <input className="min-h-11 rounded border px-3" value={code} onChange={(event) => setCode(event.target.value)} />
        </label>
        <button className="min-h-11 rounded bg-neutral-900 px-4 text-white" type="submit">
          {tx("Elevar", "Step up")}
        </button>
      </form>
      <form className="flex flex-col gap-3" onSubmit={verify}>
        <label className="flex flex-col gap-2">
          {tx("Nombre legal", "Legal name")}
          <input className="min-h-11 rounded border px-3" value={legalName} onChange={(event) => setLegalName(event.target.value)} />
        </label>
        <button className="min-h-11 rounded border px-4 text-left" type="submit">
          {tx("Verificar identidad", "Verify identity")}
        </button>
      </form>
      <form className="flex flex-col gap-3" onSubmit={saveAccount}>
        <label className="flex flex-col gap-2">
          {tx("Cuenta destino", "Destination account")}
          <input className="min-h-11 rounded border px-3" value={destinationRef} onChange={(event) => setDestinationRef(event.target.value)} />
        </label>
        <label className="flex flex-col gap-2">
          {tx("Moneda", "Currency")}
          <input className="min-h-11 rounded border px-3" value={currency} onChange={(event) => setCurrency(event.target.value)} />
        </label>
        <button className="min-h-11 rounded border px-4 text-left" type="submit">
          {tx("Guardar cuenta", "Save account")}
        </button>
      </form>
      <form className="flex flex-col gap-3" onSubmit={addOwner}>
        <label className="flex flex-col gap-2">
          {tx("Correo del otro owner", "The other owner's email")}
          <input className="min-h-11 rounded border px-3" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <button className="min-h-11 rounded border px-4 text-left" type="submit">
          {tx("Agregar owner", "Add owner")}
        </button>
      </form>
      <form className="flex flex-col gap-3" onSubmit={requestPayout}>
        <label className="flex flex-col gap-2">
          {tx("Monto en centavos", "Amount in cents")}
          <input className="min-h-11 rounded border px-3" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </label>
        <button className="min-h-11 w-fit rounded bg-neutral-900 px-4 text-white" type="submit">
          {tx("Dispersar", "Pay out")}
        </button>
      </form>
      </section>
      <section id="disputas" className="sheet">
        <h2 className="text-2xl">{tx("Reclamos de pago", "Payment claims")}</h2>
        {disputes.length === 0 ? <p className="note">{tx("No hay reclamos de pago abiertos.", "There are no open payment claims.")}</p> : null}
        <div className="flex flex-col gap-2">
          {disputes.map((dispute) => (
            <article key={dispute.donationId} className="row">
              <div className="row-main">
                <p className="font-semibold">{(dispute.netMinor / 100).toFixed(2)} {dispute.currency}</p>
                <p className="text-sm text-[var(--muted)]">{tx("vence", "due")} {dispute.dueAt.slice(0, 10)}</p>
              </div>
              <span className="status">{dispute.status}</span>
            </article>
          ))}
        </div>
      </section>
      <section className="sheet">
        <h2 className="text-2xl">{tx("Dispersiones", "Payouts")}</h2>
        {book && book.payouts.length === 0 ? <p className="note">{tx("No hay dispersiones.", "There are no payouts.")}</p> : null}
        <div className="flex flex-col gap-2">
          {book?.payouts.map((payout) => (
            <article key={payout.id} className="row">
              <div className="row-main">
                <p className="font-semibold">{(payout.amountMinor / 100).toFixed(2)} {payout.currency}</p>
                <span className="status w-fit">{payout.status}</span>
              </div>
              {payout.status === "requested" ? (
                <button className="quiet" type="button" onClick={() => approve(payout.id)}>
                  {tx("Aprobar", "Approve")}
                </button>
              ) : null}
            </article>
          ))}
        </div>
      </section>
      <form className="sheet" onSubmit={attend}>
        <h2 className="text-2xl">{tx("Donante", "Donor")}</h2>
        <label className="flex flex-col gap-2">
          {tx("Donación", "Donation")}
          <input className="min-h-11 rounded border px-3" value={donationId} onChange={(event) => setDonationId(event.target.value)} />
        </label>
        <label className="flex flex-col gap-2">
          {tx("Acción", "Action")}
          <select className="min-h-11 rounded border px-3" value={rightsAction} onChange={(event) => setRightsAction(event.target.value)}>
            <option value="access">{tx("Acceso", "Access")}</option>
            <option value="rectify">{tx("Rectificar", "Rectify")}</option>
            <option value="cancel">{tx("Cancelar", "Cancel")}</option>
            <option value="oppose">{tx("Oponerse", "Object")}</option>
          </select>
        </label>
        <label className="flex flex-col gap-2">
          {tx("Nombre", "Name")}
          <input className="min-h-11 rounded border px-3" value={donorName} onChange={(event) => setDonorName(event.target.value)} />
        </label>
        <label className="flex flex-col gap-2">
          {tx("Correo", "Email")}
          <input className="min-h-11 rounded border px-3" value={donorEmail} onChange={(event) => setDonorEmail(event.target.value)} />
        </label>
        <button className="min-h-11 rounded border px-4 text-left" type="submit">
          {tx("Atender", "Handle")}
        </button>
      </form>
      <div className="flex flex-wrap gap-2">
        <button className="quiet" type="button" onClick={report}>
          {tx("Pedir PDF", "Request PDF")}
        </button>
        <Link className="chip" href="/tablero">
          {tx("Volver a la consola", "Back to the console")}
        </Link>
      </div>
    </main>
  );
}
