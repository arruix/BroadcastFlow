"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ApiError, messages } from "@/lib/api";
import { sendVisit, visitId } from "./pixel";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";

export function Donar({ slug, currency }: { slug: string; currency: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState("10");
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
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
      const error = new ApiError(body.code ?? "not_eligible");
      setMessage(messages[error.code] ?? error.code);
      return;
    }
    router.push(`/c/${slug}/recibo/${body.donationId}`);
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <h2 className="text-xl font-semibold">Donar</h2>
      <label className="flex flex-col gap-1">
        Monto en {currency}
        <input className="min-h-11 rounded border px-3" inputMode="decimal" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} required />
      </label>
      <label className="flex flex-col gap-1">
        Nombre
        <input className="min-h-11 rounded border px-3" value={donorName} onChange={(event) => setDonorName(event.target.value)} required />
      </label>
      <label className="flex flex-col gap-1">
        Correo
        <input className="min-h-11 rounded border px-3" type="email" value={donorEmail} onChange={(event) => setDonorEmail(event.target.value)} required />
      </label>
      {message ? <p>{message}</p> : null}
      <button className="min-h-11 rounded bg-neutral-900 px-4 text-white" type="submit" onClick={() => sendVisit(slug, "click")}>
        Donar
      </button>
    </form>
  );
}
