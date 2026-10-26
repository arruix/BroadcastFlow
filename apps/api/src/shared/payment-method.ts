import { DomainException } from './domain';
import { cleanText } from './text';

// Dominios aceptados para enlaces de pago. Se puede reemplazar con
// PAYMENT_LINK_ALLOWED_DOMAINS (lista separada por comas).
const defaultDomains = [
  'mercadopago.com.mx',
  'mercadopago.com',
  'mpago.la',
  'mpago.li',
  'paypal.com',
  'paypal.me',
  'buy.stripe.com',
  'checkout.stripe.com',
  'donate.stripe.com',
];

export function allowedPaymentDomains(): string[] {
  const configured = (process.env.PAYMENT_LINK_ALLOWED_DOMAINS ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase().replace(/^\.+/, ''))
    .filter(Boolean);
  return configured.length ? configured : defaultDomains;
}

const providers: [RegExp, string][] = [
  [/(^|\.)(mercadopago\.[a-z.]+|mpago\.(la|li))$/, 'mercadopago'],
  [/(^|\.)paypal\.(com|me)$/, 'paypal'],
  [/(^|\.)stripe\.com$/, 'stripe'],
];

export function paymentProvider(url: string): string {
  const host = new URL(url).hostname.toLowerCase();
  return providers.find(([pattern]) => pattern.test(host))?.[1] ?? 'other';
}

export function normalizePaymentLink(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string')
    throw new DomainException('payment_link_invalid', 422);
  const text = value.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new DomainException('payment_link_invalid', 422);
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    text.length > 500
  )
    throw new DomainException('payment_link_invalid', 422);
  const host = url.hostname.toLowerCase();
  const allowed = allowedPaymentDomains().some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
  if (!allowed) throw new DomainException('payment_link_domain', 422);
  return url.toString();
}

// CLABE: 18 dígitos; el último es dígito verificador con pesos 3,7,1.
export function validClabe(clabe: string): boolean {
  if (!/^[0-9]{18}$/.test(clabe)) return false;
  const weights = [3, 7, 1];
  let sum = 0;
  for (let index = 0; index < 17; index += 1) {
    sum += (Number(clabe[index]) * weights[index % 3]) % 10;
  }
  return (10 - (sum % 10)) % 10 === Number(clabe[17]);
}

export type PaymentMethodInput = {
  paymentLinkUrl?: string | null;
  transferBank?: string | null;
  transferHolder?: string | null;
  transferClabe?: string | null;
  transferReference?: string | null;
};

const paymentKeys: (keyof PaymentMethodInput)[] = [
  'paymentLinkUrl',
  'transferBank',
  'transferHolder',
  'transferClabe',
  'transferReference',
];

export function hasPaymentFields(input: object): boolean {
  return paymentKeys.some((key) => key in input);
}

export function normalizePaymentMethod(input: PaymentMethodInput) {
  const paymentLinkUrl = normalizePaymentLink(input.paymentLinkUrl);
  const bank = cleanText(input.transferBank ?? '', 80) || null;
  const holder = cleanText(input.transferHolder ?? '', 120) || null;
  const clabe = String(input.transferClabe ?? '').replace(/[\s-]/g, '') || null;
  const reference = cleanText(input.transferReference ?? '', 60) || null;
  if (bank || holder || clabe || reference) {
    if (!bank || !holder || !clabe || bank.length < 2 || holder.length < 2)
      throw new DomainException('transfer_incomplete', 422);
    if (!validClabe(clabe)) throw new DomainException('clabe_invalid', 422);
  }
  return {
    paymentLinkUrl,
    transferBank: bank,
    transferHolder: holder,
    transferClabe: clabe,
    transferReference: reference,
  };
}

export type PaymentColumns = {
  payment_link_url: string | null;
  transfer_bank: string | null;
  transfer_holder: string | null;
  transfer_clabe: string | null;
  transfer_reference: string | null;
};

export function presentPaymentMethod(row: PaymentColumns) {
  return {
    link: row.payment_link_url
      ? {
          url: row.payment_link_url,
          provider: paymentProvider(row.payment_link_url),
        }
      : null,
    transfer: row.transfer_clabe
      ? {
          bank: row.transfer_bank,
          holder: row.transfer_holder,
          clabe: row.transfer_clabe,
          reference: row.transfer_reference,
        }
      : null,
  };
}
