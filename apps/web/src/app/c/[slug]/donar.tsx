"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useTx } from "@/lib/i18n";
import { ApiError, explain } from "@/lib/api";
import { sendVisit, visitId } from "./pixel";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";

const presetAmounts = ["10", "25", "50", "100"];

// Intención de donar: registra monto, nombre, correo y visita. No se cobra nada
// ni se piden datos de tarjeta; el cobro se habilitará con una pasarela real.
export function Donar({ slug, currency }: { slug: string; currency: string }) {
  const { tx } = useTx();
  const router = useRouter();

  const [amount, setAmount] = useState("25");
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState("");

  async function submitPledge(e: FormEvent) {
    e.preventDefault();
    if (!amount || Number(amount) < 1) {
      setMessage(tx("El monto mínimo es 1", "Minimum amount is 1"));
      return;
    }
    if (!donorName.trim() || !donorEmail.trim()) {
      setMessage(tx("Por favor completa tu nombre y correo", "Please enter your name and email"));
      return;
    }
    setMessage("");
    setIsSending(true);
    sendVisit(slug, "click");
    try {
      const response = await fetch(`${apiUrl}/public/campaigns/${slug}/donations`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          amountMinor: Math.round(Number(amount) * 100),
          currency,
          donorName,
          donorEmail,
          personKind: "individual",
          visitAnonymousId: visitId(),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { code?: string; donationId?: string };
      if (!response.ok || !body.donationId) {
        throw new ApiError(body.code ?? "not_eligible", response.status);
      }
      router.push(`/c/${slug}/recibo/${body.donationId}`);
    } catch (error) {
      setIsSending(false);
      setMessage(explain(error));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">
          {tx("Quiero donar", "I want to donate")}
        </h2>
        <p className="mt-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-950">
          {tx(
            "Por ahora solo registramos tu intención de donar. No se te cobrará nada ni pedimos datos de tarjeta: te avisaremos por correo cuando el pago esté habilitado.",
            "For now we only record your intention to donate. You will not be charged and we do not ask for card details: we will email you when payment is enabled."
          )}
        </p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={submitPledge}>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-slate-800">
            {tx("Monto que te gustaría donar", "Amount you would like to donate")} ({currency})
          </label>
          <div className="grid grid-cols-4 gap-2">
            {presetAmounts.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAmount(preset)}
                className={`min-h-10 rounded-xl text-sm font-bold border transition ${
                  amount === preset
                    ? "border-indigo-600 bg-indigo-50 text-indigo-600 ring-2 ring-indigo-600/20"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                ${preset}
              </button>
            ))}
          </div>
          <input
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-slate-900 font-semibold focus:border-indigo-500 focus:outline-hidden"
            inputMode="decimal"
            placeholder={tx("Otro monto", "Other amount")}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>

        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          {tx("Nombre completo", "Full name")}
          <input
            className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-slate-900 focus:border-indigo-500 focus:outline-hidden"
            placeholder={tx("Ej. Ana Ruiz", "e.g. Jane Doe")}
            value={donorName}
            onChange={(e) => setDonorName(e.target.value)}
            required
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          {tx("Correo electrónico", "Email address")}
          <input
            className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-slate-900 focus:border-indigo-500 focus:outline-hidden"
            type="email"
            placeholder="tu@correo.com"
            value={donorEmail}
            onChange={(e) => setDonorEmail(e.target.value)}
            required
          />
        </label>

        {message ? <p className="text-xs text-rose-600 font-medium">{message}</p> : null}

        <button
          className="mt-2 min-h-12 rounded-xl bg-indigo-600 px-4 text-white font-semibold text-sm shadow-sm hover:bg-indigo-700 disabled:opacity-70 transition"
          type="submit"
          disabled={isSending}
        >
          {isSending ? tx("Registrando...", "Saving...") : tx("Registrar mi intención de donar", "Record my pledge")}
        </button>
      </form>
    </div>
  );
}
