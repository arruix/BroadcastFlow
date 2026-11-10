import { DomainException } from '../shared/domain';
import type { MailLocale, OutboundMail } from './mail.service';
import { actionLink, mailOrigin } from './origin';

export type Rfc822 = {
  envelopeFrom: string;
  to: string;
  data: string;
};

type Copy = {
  subject: string;
  title: string;
  lead: string;
  button: string;
  fallback: string;
  expiry: string;
  ignore: string;
};

const copy: Record<MailLocale, Record<OutboundMail['purpose'], Copy>> = {
  es: {
    verify: {
      subject: 'Verifica tu cuenta de BroadcastFlow',
      title: 'Verifica tu cuenta',
      lead: 'Confirma que este correo es tuyo para terminar el alta.',
      button: 'Verificar mi cuenta',
      fallback: 'Si el botón no abre, copia este enlace:',
      expiry: 'El enlace caduca en 24 horas.',
      ignore: 'Si no creaste la cuenta, puedes ignorar este correo.',
    },
    reset: {
      subject: 'Restablece tu contraseña de BroadcastFlow',
      title: 'Elige una contraseña nueva',
      lead: 'Recibimos una solicitud para cambiar la contraseña de esta cuenta.',
      button: 'Elegir contraseña',
      fallback: 'Si el botón no abre, copia este enlace:',
      expiry: 'El enlace caduca en 1 hora.',
      ignore: 'Si no lo pediste, puedes ignorar este correo.',
    },
    invite: {
      subject: 'Invitación a una organización en BroadcastFlow',
      title: 'Te invitaron a una organización',
      lead: 'Al aceptar entras con el rol que te asignaron.',
      button: 'Aceptar invitación',
      fallback: 'Si el botón no abre, copia este enlace:',
      expiry: 'El enlace caduca en 7 días.',
      ignore: 'Si no esperabas esta invitación, puedes ignorar este correo.',
    },
    receipt: {
      subject: 'Aviso de un movimiento en el libro',
      title: 'Movimiento anotado',
      lead: 'Quedó anotado un movimiento en el libro de la campaña. Este correo no confirma un pago en Mercado Pago, PayPal o Stripe, y BroadcastFlow no cobró una tarjeta.',
      button: '',
      fallback: '',
      expiry: '',
      ignore: 'BroadcastFlow · Mezkit Studios',
    },
  },
  en: {
    verify: {
      subject: 'Verify your BroadcastFlow account',
      title: 'Verify your account',
      lead: 'Confirm this email is yours to finish signing up.',
      button: 'Verify my account',
      fallback: 'If the button does not open, copy this link:',
      expiry: 'The link expires in 24 hours.',
      ignore: 'If you did not create the account, you can ignore this email.',
    },
    reset: {
      subject: 'Reset your BroadcastFlow password',
      title: 'Choose a new password',
      lead: 'We received a request to change the password for this account.',
      button: 'Choose password',
      fallback: 'If the button does not open, copy this link:',
      expiry: 'The link expires in 1 hour.',
      ignore: 'If you did not ask for this, you can ignore this email.',
    },
    invite: {
      subject: 'Invitation to an organization on BroadcastFlow',
      title: 'You were invited to an organization',
      lead: 'Accepting puts you in with the role you were given.',
      button: 'Accept invitation',
      fallback: 'If the button does not open, copy this link:',
      expiry: 'The link expires in 7 days.',
      ignore: 'If you were not expecting this invitation, you can ignore this email.',
    },
    receipt: {
      subject: 'A ledger entry was recorded',
      title: 'Entry recorded',
      lead: 'A ledger entry was recorded for the campaign. This email does not confirm a payment on Mercado Pago, PayPal, or Stripe, and BroadcastFlow did not charge a card.',
      button: '',
      fallback: '',
      expiry: '',
      ignore: 'BroadcastFlow · Mezkit Studios',
    },
  },
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
  const locale: MailLocale = message.locale === 'en' ? 'en' : 'es';
  const text = plainBody(copy[locale][message.purpose], link);
  const html = htmlBody(locale, copy[locale][message.purpose], link);
  const combined = `${text}\n${html}`;
  if (message.purpose !== 'receipt' && message.token && !combined.includes(message.token))
    throw new DomainException('mail_rejected', 502);
  if (message.purpose === 'receipt' && message.token && combined.includes(message.token))
    throw new DomainException('mail_rejected', 502);
  const boundary = 'bf-alt-7c1e';
  const headers = [
    `From: ${headerValue(fromName)} <${from}>`,
    `To: ${to}`,
    `Subject: ${headerValue(copy[locale][message.purpose].subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    `Date: ${new Date().toUTCString()}`,
  ];
  const data = [
    headers.join('\r\n'),
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    text.replace(/\r?\n/g, '\r\n'),
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    html.replace(/\r?\n/g, '\r\n'),
    `--${boundary}--`,
    '',
  ].join('\r\n');
  return { envelopeFrom: from, to, data };
}

function plainBody(text: Copy, link: string | null): string {
  if (!link) return `${text.title}\n\n${text.lead}\n\n${text.ignore}\n`;
  return `${text.title}\n\n${text.lead}\n\n${text.button}: ${link}\n\n${text.expiry}\n${text.ignore}\n`;
}

function htmlBody(locale: MailLocale, text: Copy, link: string | null): string {
  const button = link
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;">
        <tr>
          <td bgcolor="#0f766e" style="border-radius:8px;">
            <a href="${escapeHtml(link)}" style="display:inline-block;padding:14px 22px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;color:#ffffff;text-decoration:none;font-weight:bold;">${escapeHtml(text.button)}</a>
          </td>
        </tr>
      </table>
      <p class="muted" style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#475569;">${escapeHtml(text.fallback)}</p>
      <p class="muted" style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#0f766e;word-break:break-all;"><a href="${escapeHtml(link)}" style="color:#0f766e;">${escapeHtml(link)}</a></p>
      <p class="muted" style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#475569;">${escapeHtml(text.expiry)}</p>`
    : '';
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
  @media (prefers-color-scheme: dark) {
    .bg { background:#0f172a !important; }
    .card { background:#1e293b !important; }
    .text { color:#f8fafc !important; }
    .muted, .muted a { color:#cbd5e1 !important; }
  }
</style>
</head>
<body class="bg" bgcolor="#f8fafc" style="margin:0;padding:0;background:#f8fafc;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="bg" bgcolor="#f8fafc" style="background:#f8fafc;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;">
          <tr>
            <td class="text" style="padding:0 8px 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:18px;color:#0f766e;font-weight:bold;">BroadcastFlow · Mezkit Studios</td>
          </tr>
          <tr>
            <td class="card" bgcolor="#ffffff" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:28px 24px;">
              <h1 class="text" style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:32px;color:#0f172a;">${escapeHtml(text.title)}</h1>
              <p class="text" style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#0f172a;">${escapeHtml(text.lead)}</p>
              ${button}
              <p class="muted" style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#64748b;">${escapeHtml(text.ignore)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function headerValue(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function bareEmail(value: string): string {
  const email = value.trim();
  if (/[\r\n\s]/.test(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new DomainException('mail_rejected', 502);
  return email;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === '&') return '&amp;';
    if (char === '<') return '&lt;';
    if (char === '>') return '&gt;';
    if (char === '"') return '&quot;';
    return '&#39;';
  });
}
