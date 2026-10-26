"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useTx } from "@/lib/i18n";
import { ApiError, explain } from "@/lib/api";
import { sendVisit, visitId } from "./pixel";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";

const presetAmounts = ["10", "25", "50", "100"];

export function Donar({ slug, currency }: { slug: string; currency: string }) {
  const { tx } = useTx();
  const router = useRouter();

  // Wizard state: 1 = Details, 2 = Card Payment
  const [step, setStep] = useState<1 | 2>(1);

  // Form inputs
  const [amount, setAmount] = useState("25");
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");

  // Payment inputs
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [postalCode, setPostalCode] = useState("");

  // UI state
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState("");

  // Format card number with spaces (4 4 4 4)
  function handleCardNumberChange(val: string) {
    const raw = val.replace(/\D/g, "").slice(0, 16);
    const parts = raw.match(/.{1,4}/g);
    setCardNumber(parts ? parts.join(" ") : raw);
  }

  // Format expiry MM/YY
  function handleExpiryChange(val: string) {
    const raw = val.replace(/\D/g, "").slice(0, 4);
    if (raw.length >= 3) {
      setCardExpiry(`${raw.slice(0, 2)}/${raw.slice(2)}`);
    } else {
      setCardExpiry(raw);
    }
  }

  // Detect card brand
  function detectBrand(num: string) {
    const clean = num.replace(/\s+/g, "");
    if (clean.startsWith("4")) return "visa";
    if (/^5[1-5]/.test(clean)) return "mastercard";
    if (/^3[47]/.test(clean)) return "amex";
    return "card";
  }

  // Autofill test card in development
  function fillDemoCard() {
    setCardNumber("4242 4242 4242 4242");
    setCardExpiry("12/28");
    setCardCvc("123");
    setCardHolder(donorName || "Ana Ruiz");
    setPostalCode("06700");
  }

  // Step 1 -> Step 2
  function goToPayment(e: FormEvent) {
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
    sendVisit(slug, "click");
    setCardHolder(donorName);
    setStep(2);
  }

  // Step 2: Process payment
  async function submitPayment(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    setIsProcessing(true);

    try {
      // 1. Create donation intent
      const createRes = await fetch(`${apiUrl}/public/campaigns/${slug}/donations`, {
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

      const body = (await createRes.json().catch(() => ({}))) as {
        code?: string;
        donationId?: string;
      };

      if (!createRes.ok || !body.donationId) {
        throw new ApiError(body.code ?? "not_eligible", createRes.status);
      }

      // 2. Settle payment through the gateway endpoint
      const payRes = await fetch(`${apiUrl}/public/donations/${body.donationId}/pay`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });

      if (!payRes.ok) {
        const payBody = (await payRes.json().catch(() => ({}))) as { code?: string };
        throw new ApiError(payBody.code ?? "payment_failed", payRes.status);
      }

      // 3. Success! Redirect to confirmed receipt
      router.push(`/c/${slug}/recibo/${body.donationId}`);
    } catch (error) {
      setIsProcessing(false);
      setMessage(explain(error));
    }
  }

  const brand = detectBrand(cardNumber);

  return (
    <div className="flex flex-col gap-4">
      {/* Header with Title and Airtime Value Prop */}
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">
            {tx("Donar", "Donate")}
          </h2>
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2.5 py-0.5 rounded-full">
            {step === 1 ? tx("Paso 1 de 2", "Step 1 of 2") : tx("Paso 2 de 2", "Step 2 of 2")}
          </span>
        </div>

        <div className="mt-2.5 rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 to-violet-50/50 p-3.5 text-xs text-indigo-950 flex items-start gap-2.5 shadow-2xs">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-2xs">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m0 0L21 3" />
            </svg>
          </div>
          <div>
            <span className="font-bold text-indigo-950 block mb-0.5">
              {tx("Difusión activa en redes sociales", "Active social broadcast")}
            </span>
            <p className="text-indigo-900/90 leading-snug">
              {tx(
                "Entre más donaciones reciba la campaña, más tiempo permanecerá activa y visible en las redes sociales.",
                "The more donations the campaign receives, the longer it will remain active and visible on social networks."
              )}
            </p>
          </div>
        </div>
      </div>

      {step === 1 ? (
        /* STEP 1: Amount and Donor Info */
        <form className="flex flex-col gap-4" onSubmit={goToPayment}>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-slate-800">
              {tx("Monto de la donación", "Donation amount")} ({currency})
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
            <div className="relative mt-1">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 font-bold text-sm">
                $
              </span>
              <input
                className="min-h-11 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-16 text-slate-900 font-semibold focus:border-indigo-500 focus:outline-hidden"
                inputMode="decimal"
                min="1"
                step="1"
                placeholder={tx("Otro monto", "Other amount")}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
              <span className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-xs text-slate-400 font-medium">
                {currency}
              </span>
            </div>
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
            className="mt-2 min-h-12 rounded-xl bg-indigo-600 px-4 text-white font-semibold text-sm shadow-sm hover:bg-indigo-700 active:scale-[0.99] transition flex items-center justify-center gap-2"
            type="submit"
          >
            {tx("Continuar al pago", "Continue to payment")}
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </button>
        </form>
      ) : (
        /* STEP 2: Card Payment Gateway */
        <form className="flex flex-col gap-4" onSubmit={submitPayment}>
          {/* Amount Badge */}
          <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200/80 p-3.5">
            <div>
              <p className="text-xs text-slate-500">{tx("Total a donar", "Total to donate")}</p>
              <p className="text-xl font-extrabold text-slate-900">
                ${Number(amount || 0).toFixed(2)} {currency}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline"
            >
              {tx("Modificar", "Change")}
            </button>
          </div>

          {/* Test Card Fill Helper */}
          <div className="flex items-center justify-between bg-violet-50/70 border border-violet-100 rounded-lg px-3 py-2 text-xs text-violet-900">
            <span>{tx("Modo de prueba pasarela", "Gateway test mode")}</span>
            <button
              type="button"
              onClick={fillDemoCard}
              className="font-bold text-violet-700 hover:text-violet-900 underline"
            >
              {tx("Llenar tarjeta demo", "Fill demo card")}
            </button>
          </div>

          {/* Card Number */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-700">
              {tx("Número de tarjeta", "Card number")}
            </label>
            <div className="relative">
              <input
                className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 pr-16 text-sm font-mono tracking-wider text-slate-900 focus:border-indigo-500 focus:outline-hidden"
                placeholder="4242 •••• •••• 4242"
                value={cardNumber}
                onChange={(e) => handleCardNumberChange(e.target.value)}
                maxLength={19}
                required
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                {brand === "visa" ? (
                  <span className="font-extrabold italic text-blue-700 text-xs">VISA</span>
                ) : brand === "mastercard" ? (
                  <span className="font-extrabold text-amber-600 text-xs">MC</span>
                ) : brand === "amex" ? (
                  <span className="font-extrabold text-cyan-600 text-xs">AMEX</span>
                ) : (
                  <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <rect x="2" y="5" width="20" height="14" rx="2" strokeWidth="2" />
                    <line x1="2" y1="10" x2="22" y2="10" strokeWidth="2" />
                  </svg>
                )}
              </div>
            </div>
          </div>

          {/* Expiry and CVC */}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
              {tx("Vencimiento (MM/AA)", "Expiry (MM/YY)")}
              <input
                className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-mono text-slate-900 focus:border-indigo-500 focus:outline-hidden"
                placeholder="MM/AA"
                value={cardExpiry}
                onChange={(e) => handleExpiryChange(e.target.value)}
                maxLength={5}
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
              {tx("CVC / CVV", "CVC / CVV")}
              <input
                className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-mono text-slate-900 focus:border-indigo-500 focus:outline-hidden"
                placeholder="123"
                type="password"
                value={cardCvc}
                onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
                maxLength={4}
                required
              />
            </label>
          </div>

          {/* Card Holder & Postal Code */}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
              {tx("Nombre en tarjeta", "Cardholder name")}
              <input
                className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-hidden"
                value={cardHolder}
                onChange={(e) => setCardHolder(e.target.value)}
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
              {tx("Código postal", "Postal code")}
              <input
                className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-hidden"
                placeholder="06700"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value.slice(0, 10))}
                required
              />
            </label>
          </div>

          {message ? <p className="text-xs text-rose-600 font-medium">{message}</p> : null}

          {/* Action buttons */}
          <div className="flex flex-col gap-2 pt-1">
            <button
              className="min-h-12 rounded-xl bg-neutral-900 px-4 text-white font-semibold text-sm shadow-sm hover:bg-neutral-800 disabled:opacity-70 active:scale-[0.99] transition flex items-center justify-center gap-2"
              type="submit"
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  {tx("Procesando con la pasarela...", "Processing with gateway...")}
                </>
              ) : (
                tx(`Pagar $${Number(amount || 0).toFixed(2)} ${currency}`, `Pay $${Number(amount || 0).toFixed(2)} ${currency}`)
              )}
            </button>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-xs text-slate-500 hover:text-slate-800 py-1 transition"
              disabled={isProcessing}
            >
              {tx("← Volver a datos del donante", "← Back to donor details")}
            </button>
          </div>

          {/* Trust and compliance footer */}
          <div className="flex items-center justify-center gap-3 pt-2 text-[10px] text-slate-400 border-t border-slate-100">
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              {tx("Cifrado SSL 256-bit", "256-bit SSL")}
            </span>
            <span>•</span>
            <span>PCI-DSS Level 1</span>
            <span>•</span>
            <span>{tx("Liquidación inmediata", "Instant settlement")}</span>
          </div>
        </form>
      )}
    </div>
  );
}
