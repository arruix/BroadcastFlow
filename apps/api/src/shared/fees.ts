import { DomainException } from './domain';

// Tarifa publicada de tarjeta del primer adaptador: 2.9% más 30 centavos.
const processorBps = 290;
const processorFixedMinor = 30;

export type DonationSplit = {
  processorFeeMinor: number;
  platformFeeMinor: number;
  netMinor: number;
};

export function splitDonation(
  grossMinor: number,
  platformFeeBps: number,
): DonationSplit {
  const processorFeeMinor =
    Math.round((grossMinor * processorBps) / 10000) + processorFixedMinor;
  const platformFeeMinor = Math.floor((grossMinor * platformFeeBps) / 10000);
  const netMinor = grossMinor - processorFeeMinor - platformFeeMinor;
  if (processorFeeMinor <= 0 || platformFeeMinor < 0 || netMinor < 0) {
    throw new DomainException('not_eligible', 422);
  }
  return { processorFeeMinor, platformFeeMinor, netMinor };
}
