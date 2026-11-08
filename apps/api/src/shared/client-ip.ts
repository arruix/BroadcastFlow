import { createHash, timingSafeEqual } from 'crypto';

const ipv4 =
  /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

export type ClientIpInput = {
  remoteAddress?: string | null;
  forwardedFor?: string | string[] | undefined;
  proxyToken?: string | string[] | undefined;
  trustedProxies?: string[];
  proxySharedSecret?: string;
};

// La IP del visitante solo se toma de X-Forwarded-For si el par inmediato es
// loopback, está en TRUSTED_PROXY_IPS, o presenta el secreto compartido del
// proxy. Se recorre la cadena de derecha a izquierda: el proxy añade su
// cliente al final y un valor inventado a la izquierda no gana.
export function resolveClientIp(input: ClientIpInput): string {
  const remote = normalizeIp(input.remoteAddress) ?? 'unknown';
  const trusted = trustedSet(input.trustedProxies);
  const proxyAuthenticated = secretMatches(
    firstHeader(input.proxyToken),
    input.proxySharedSecret ?? '',
  );
  if (!trusted.has(remote) && !proxyAuthenticated) return remote;
  const forwarded = forwardedIps(input.forwardedFor);
  for (let index = forwarded.length - 1; index >= 0; index -= 1) {
    const hop = forwarded[index];
    if (!trusted.has(hop)) return hop;
  }
  return remote;
}

export function clientIp(request: {
  socket?: { remoteAddress?: string | null };
  headers?: NodeJS.Dict<string | string[] | undefined>;
}): string {
  const trusted = (process.env.TRUSTED_PROXY_IPS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return resolveClientIp({
    remoteAddress: request.socket?.remoteAddress,
    forwardedFor: request.headers?.['x-forwarded-for'],
    proxyToken: request.headers?.['x-bf-proxy-token'],
    trustedProxies: trusted,
    proxySharedSecret: process.env.PROXY_SHARED_SECRET,
  });
}

function trustedSet(extra: string[] | undefined): Set<string> {
  const trusted = new Set<string>(['127.0.0.1', '::1']);
  for (const item of extra ?? []) {
    const ip = normalizeIp(item);
    if (ip) trusted.add(ip);
  }
  return trusted;
}

function forwardedIps(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(',') : (value ?? '');
  return raw
    .split(',')
    .map((item) => normalizeIp(item))
    .filter((item): item is string => Boolean(item));
}

function firstHeader(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null;
  let text = value.trim().toLowerCase();
  if (!text || text.includes(',')) return null;
  if (text.startsWith('[') && text.endsWith(']')) text = text.slice(1, -1);
  if (text.startsWith('::ffff:')) {
    const mapped = text.slice('::ffff:'.length);
    if (ipv4.test(mapped)) return mapped;
  }
  if (text === '::1' || ipv4.test(text)) return text;
  if (/^[0-9a-f:]+$/.test(text) && text.includes(':')) return text;
  return null;
}

function secretMatches(header: string, secret: string): boolean {
  if (!secret || !header) return false;
  const actual = createHash('sha256').update(header).digest();
  const expected = createHash('sha256').update(secret).digest();
  return timingSafeEqual(actual, expected);
}
