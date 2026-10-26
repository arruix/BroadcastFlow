import { DomainException } from './domain';

// Campo trampa: invisible para personas; si llega lleno, lo llenó un bot.
export function rejectHoneypot(value: unknown) {
  if (typeof value === 'string' && value.trim() !== '')
    throw new DomainException('spam_rejected', 422);
}

export function captchaEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

// Cloudflare Turnstile. Apagado si no hay TURNSTILE_SECRET_KEY.
export async function requireCaptcha(token: unknown, ip: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return;
  if (typeof token !== 'string' || token.length < 10 || token.length > 4096)
    throw new DomainException('captcha_required', 422);
  const form = new URLSearchParams({ secret, response: token });
  if (ip && ip !== 'local') form.set('remoteip', ip);
  let success = false;
  try {
    const response = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'POST', body: form, signal: AbortSignal.timeout(5000) },
    );
    const body = (await response.json()) as { success?: boolean };
    success = body.success === true;
  } catch {
    throw new DomainException('captcha_unavailable', 503);
  }
  if (!success) throw new DomainException('captcha_failed', 422);
}
