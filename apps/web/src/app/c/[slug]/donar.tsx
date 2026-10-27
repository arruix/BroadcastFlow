"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useTx } from "@/lib/i18n";
import { ApiError, explain } from "@/lib/api";
import { readUtm, sendVisit, visitId } from "./pixel";

const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

// Cloudflare Turnstile; solo se carga si hay NEXT_PUBLIC_TURNSTILE_SITE_KEY.
function useTurnstile(onToken: (token: string) => void) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!turnstileSiteKey || !container.current) return;
    const element = container.current;
    const mount = () => {
      if (!window.turnstile || widget.current) return;
      widget.current = window.turnstile.render(element, {
        sitekey: turnstileSiteKey,
        callback: onToken,
        "expired-callback": () => onToken(""),
      });
    };
    if (window.turnstile) {
      mount();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = mount;
    document.head.appendChild(script);
  }, [onToken]);
  return {
    container,
    reset: () => window.turnstile?.reset(widget.current),
  };
}

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";

const presetAmounts = ["10", "25", "50", "100"];

// Intención de donar: registra monto, nombre, correo y visita. No se cobra nada
// ni se piden datos de tarjeta; el cobro se habilitará con una pasarela real.
export function Donar({
  slug,
  currency,
  noticeVersion,
}: {
  slug: string;
  currency: string;
  noticeVersion: number | null;
}) {
  const { tx } = useTx();
  const router = useRouter();

  const [amount, setAmount] = useState("25");
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const captcha = useTurnstile(setCaptchaToken);

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
    if (!consent) {
      setMessage(
        tx(
          "Necesitamos que aceptes el aviso de privacidad para registrar tu intención.",
          "Please accept the privacy notice to record your pledge."
        )
      );
      return;
    }
    if (turnstileSiteKey && !captchaToken) {
      setMessage(tx("Completa la verificación anti-spam.", "Please complete the anti-spam check."));
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
          referrer: document.referrer || undefined,
          ...readUtm(),
          consent: true,
          noticeVersion: noticeVersion ?? undefined,
          captchaToken: captchaToken || undefined,
          website,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { code?: string; donationId?: string };
      if (!response.ok || !body.donationId) {
        throw new ApiError(body.code ?? "not_eligible", response.status);
      }
      router.push(`/c/${slug}/recibo/${body.donationId}`);
    } catch (error) {
      setIsSending(false);
      setCaptchaToken("");
      captcha.reset();
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
                    ? "border-teal-700 bg-teal-50 text-teal-700 ring-2 ring-teal-700/20"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                ${preset}
              </button>
            ))}
          </div>
          <input
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-slate-900 font-semibold focus:border-teal-500 focus:outline-hidden"
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
            className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-slate-900 focus:border-teal-500 focus:outline-hidden"
            placeholder={tx("Ej. Ana Ruiz", "e.g. Jane Doe")}
            value={donorName}
            onChange={(e) => setDonorName(e.target.value)}
            required
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          {tx("Correo electrónico", "Email address")}
          <input
            className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-slate-900 focus:border-teal-500 focus:outline-hidden"
            type="email"
            placeholder="tu@correo.com"
            value={donorEmail}
            onChange={(e) => setDonorEmail(e.target.value)}
            required
          />
        </label>

        {/* Campo trampa anti-spam: oculto para personas y lectores de pantalla. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label>
            Website
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </label>
        </div>

        <label className="flex items-start gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            required
          />
          <span>
            {tx(
              "He leído y acepto el aviso de privacidad de esta campaña",
              "I have read and accept this campaign's privacy notice"
            )}{" "}
            (<a className="underline" href="#aviso">{tx("ver aviso", "view notice")}</a>
            {noticeVersion ? ` · v${noticeVersion}` : ""}).
          </span>
        </label>

        {turnstileSiteKey ? <div ref={captcha.container} /> : null}

        {message ? <p className="text-xs text-rose-600 font-medium">{message}</p> : null}

        <button
          className="mt-2 min-h-12 rounded-xl bg-[var(--donate)] px-4 text-white font-semibold text-sm shadow-sm hover:brightness-95 disabled:opacity-70 transition"
          type="submit"
          disabled={isSending || !consent}
        >
          {isSending ? tx("Registrando...", "Saving...") : tx("Registrar mi intención de donar", "Record my pledge")}
        </button>
      </form>
    </div>
  );
}
