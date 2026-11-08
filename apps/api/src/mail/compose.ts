import { DomainException } from '../shared/domain';
import type { OutboundMail } from './mail.service';
import { actionLink, mailOrigin } from './origin';

export type Rfc822 = {
  envelopeFrom: string;
  to: string;
  data: string;
};

const subjects: Record<OutboundMail['purpose'], string> = {
  verify: 'Verifica tu cuenta de BroadcastFlow',
  reset: 'Restablece tu contraseña de BroadcastFlow',
  invite: 'Invitación a una organización en BroadcastFlow',
  receipt: 'Aviso de un movimiento en el libro',
};

export function composeTransactional(
  message: OutboundMail,
  env: NodeJS.ProcessEnv,
  fromEmail: string,
  fromName: string,
): Rfc822 {
  const to = bareEmail(message.to);
  const from = bareEmail(fromEmail);
  if (/[\r\n]/.test(fromName))
    throw new DomainException('mail_rejected', 502);
  const origin = mailOrigin(env);
  const link = actionLink(origin, message.purpose, message.token);
  const text = body(message.purpose, link);
  if (message.purpose !== 'receipt' && message.token && !text.includes(message.token))
    throw new DomainException('mail_rejected', 502);
  if (
    message.purpose === 'receipt' &&
    message.token &&
    text.includes(message.token)
  )
    throw new DomainException('mail_rejected', 502);
  const headers = [
    `From: ${fromName} <${from}>`,
    `To: ${to}`,
    `Subject: ${subjects[message.purpose]}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    `Date: ${new Date().toUTCString()}`,
  ];
  return {
    envelopeFrom: from,
    to,
    data: `${headers.join('\r\n')}\r\n\r\n${text.replace(/\r?\n/g, '\r\n')}`,
  };
}

function body(purpose: OutboundMail['purpose'], link: string | null): string {
  if (purpose === 'verify' && link)
    return `Para verificar tu cuenta abre este enlace. Caduca en 24 horas.\n${link}\nSi no creaste la cuenta, ignora este correo.\n`;
  if (purpose === 'reset' && link)
    return `Para elegir una contraseña nueva abre este enlace. Caduca en 1 hora.\n${link}\nSi no lo pediste, ignora este correo.\n`;
  if (purpose === 'invite' && link)
    return `Te invitaron a una organización. Abre este enlace para aceptar.\n${link}\n`;
  return 'Quedó anotado un movimiento en el libro de la campaña. Este correo no confirma un pago en Mercado Pago, PayPal o Stripe, y BroadcastFlow no cobró una tarjeta.\n';
}

function bareEmail(value: string): string {
  const email = value.trim();
  if (
    /[\r\n\s]/.test(email) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new DomainException('mail_rejected', 502);
  }
  return email;
}
