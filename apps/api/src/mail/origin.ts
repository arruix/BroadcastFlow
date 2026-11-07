import { DomainException } from '../shared/domain';
import type { OutboundMail } from './mail.service';

const paths: Record<OutboundMail['purpose'], string | null> = {
  verify: '/verificar',
  reset: '/restablecer',
  invite: '/invitar',
  receipt: null,
};

// El primer valor de WEB_ORIGIN es el origen del enlace. Se rechaza cualquier
// URL con usuario, contraseña, ruta o esquema que no corresponda al entorno.
export function mailOrigin(env: NodeJS.ProcessEnv): string {
  const raw = (env.WEB_ORIGIN ?? '').split(',')[0]?.trim() ?? '';
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new DomainException('mail_not_configured', 503);
  }
  if (url.username || url.password || url.search || url.hash)
    throw new DomainException('mail_not_configured', 503);
  if (url.pathname !== '/' && url.pathname !== '')
    throw new DomainException('mail_not_configured', 503);
  const local =
    url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  const production = env.NODE_ENV === 'production';
  if (production) {
    if (url.protocol !== 'https:' || local)
      throw new DomainException('mail_not_configured', 503);
  } else if (url.protocol === 'https:') {
    // permitido en desarrollo
  } else if (url.protocol === 'http:' && local) {
    // el piloto local
  } else {
    throw new DomainException('mail_not_configured', 503);
  }
  return url.origin;
}

export function actionLink(
  origin: string,
  purpose: OutboundMail['purpose'],
  token: string,
): string | null {
  const path = paths[purpose];
  if (!path) return null;
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(token))
    throw new DomainException('mail_rejected', 502);
  const url = new URL(path, origin);
  url.searchParams.set('token', token);
  if (url.origin !== origin) throw new DomainException('mail_rejected', 502);
  return url.toString();
}
