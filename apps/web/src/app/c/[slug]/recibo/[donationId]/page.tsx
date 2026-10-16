import { notFound } from "next/navigation";

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
  const response = await fetch(`${apiUrl}/public/donations/${donationId}`, { cache: "no-store" });
  if (response.status === 404) notFound();
  if (!response.ok) {
    return (
      <main className="mx-auto max-w-lg px-4 py-10">
        <h1 className="text-3xl font-semibold">Recibo</h1>
        <p>No se pudo leer la donación.</p>
      </main>
    );
  }
  const receipt = (await response.json()) as Receipt;
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 px-4 py-10">
      <h1 className="text-3xl font-semibold">Recibo</h1>
      <p>Estado: {receipt.status}</p>
      <p>Bruto: {money(receipt.grossMinor)} {receipt.currency}</p>
      <p>Comisión de la pasarela: {money(receipt.processorFeeMinor)} {receipt.currency}</p>
      <p>Comisión de la plataforma: {money(receipt.platformFeeMinor)} {receipt.currency}</p>
      <p>Neto: {money(receipt.netMinor)} {receipt.currency}</p>
      {receipt.fiscalReceipt ? null : <p>Este recibo no es un comprobante fiscal deducible.</p>}
    </main>
  );
}

function money(minor: number): string {
  return (minor / 100).toFixed(2);
}
