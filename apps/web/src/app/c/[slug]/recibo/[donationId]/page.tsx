import { notFound } from "next/navigation";
import { Idioma } from "@/lib/i18n";
import { pick, serverLocale } from "@/lib/locale";

type Receipt = {
  status: string;
  grossMinor: number;
  netMinor: number;
  processorFeeMinor: number;
  platformFeeMinor: number;
  currency: string;
  fiscalReceipt: boolean;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";

export default async function Recibo({ params }: { params: Promise<{ donationId: string }> }) {
  const { donationId } = await params;
  const locale = await serverLocale();
  const tx = (es: string, en: string) => pick(locale, es, en);
  const response = await fetch(`${apiUrl}/public/donations/${donationId}`, { cache: "no-store" });
  if (response.status === 404) notFound();
  if (!response.ok) {
    return (
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-10">
        <Idioma />
        <h1 className="text-3xl font-semibold">{tx("Recibo", "Receipt")}</h1>
        <p>{tx("No se pudo leer la donación.", "The donation could not be read.")}</p>
      </main>
    );
  }
  const receipt = (await response.json()) as Receipt;
  if (receipt.status === "pendiente") {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-4 py-12">
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow">{tx("Intención registrada", "Pledge recorded")}</p>
          <Idioma />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{tx("¡Gracias por tu apoyo!", "Thank you for your support!")}</h1>
        <p className="text-sm text-slate-600">
          {tx(
            "Registramos tu intención de donar. No se ha realizado ningún cobro: te avisaremos por correo cuando el pago esté habilitado.",
            "We recorded your pledge. No charge has been made: we will email you when payment is enabled."
          )}
        </p>
        <p className="text-sm">
          {tx("Monto", "Amount")}: {(receipt.grossMinor / 100).toFixed(2)} {receipt.currency}
        </p>
      </main>
    );
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-4 py-12">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          {tx("Donación procesada", "Donation processed")}
        </p>
        <Idioma />
      </div>

      <div className="flex flex-col gap-1.5">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{tx("¡Gracias por tu apoyo!", "Thank you for your support!")}</h1>
        <p className="text-sm text-slate-600">
          {tx(
            "Tu aportación ha sido procesada correctamente y contribuye directamente al impacto de la campaña.",
            "Your contribution has been successfully processed and directly fuels the campaign's impact."
          )}
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50/90 to-teal-50/70 p-4 text-xs text-teal-950 shadow-2xs">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white shadow-2xs">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m0 0L21 3" />
          </svg>
        </div>
        <div>
          <span className="font-bold text-teal-950 block mb-0.5">
            {tx("Más tiempo de difusión en redes sociales", "More broadcast airtime on social networks")}
          </span>
          <p className="text-teal-900/90 leading-snug">
            {tx(
              "Entre más donaciones se reciben, más tiempo permanece la campaña activa y visible en las redes sociales conectadas.",
              "The more donations received, the longer the campaign remains active and visible across connected social networks."
            )}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs flex flex-col gap-3">
        <div className="flex justify-between items-center pb-3 border-b border-slate-100">
          <span className="text-sm text-slate-500">{tx("Estado", "Status")}</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-full">
            {receipt.status}
          </span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-slate-500">{tx("Monto bruto", "Gross amount")}</span>
          <span className="font-semibold text-slate-900">{money(receipt.grossMinor)} {receipt.currency}</span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-slate-500">{tx("Comisión de la pasarela", "Gateway fee")}</span>
          <span className="text-slate-700">{money(receipt.processorFeeMinor)} {receipt.currency}</span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-slate-500">{tx("Comisión de la plataforma", "Platform fee")}</span>
          <span className="text-slate-700">{money(receipt.platformFeeMinor)} {receipt.currency}</span>
        </div>
        <div className="flex justify-between items-center pt-3 border-t border-slate-100 font-semibold text-base">
          <span className="text-slate-900">{tx("Neto para la causa", "Net for the cause")}</span>
          <span className="text-teal-600 font-bold">{money(receipt.netMinor)} {receipt.currency}</span>
        </div>
      </div>

      {receipt.fiscalReceipt ? null : (
        <p className="text-xs text-slate-500 text-center">
          {tx("Este recibo no es un comprobante fiscal deducible.", "This receipt is not a deductible tax receipt.")}
        </p>
      )}
    </main>
  );
}

function money(minor: number): string {
  return (minor / 100).toFixed(2);
}
