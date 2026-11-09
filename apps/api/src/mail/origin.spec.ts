import { DomainException } from '../shared/domain';
import { composeTransactional } from './compose';
import { actionLink, mailOrigin } from './origin';

const token = 'abcdefghijklmnopqrstuvwxyz012345';

describe('origen de los enlaces', () => {
  it('acepta https público y http solo en local', () => {
    expect(mailOrigin({ WEB_ORIGIN: 'https://broadcastflow.mezkitstudios.com' })).toBe(
      'https://broadcastflow.mezkitstudios.com',
    );
    expect(mailOrigin({ NODE_ENV: 'test', WEB_ORIGIN: 'http://127.0.0.1:3000' })).toBe(
      'http://127.0.0.1:3000',
    );
  });

  it('rechaza usuario, ruta y http público en producción', () => {
    expect(() =>
      mailOrigin({
        NODE_ENV: 'production',
        WEB_ORIGIN: 'https://user:secret@broadcastflow.mezkitstudios.com',
      }),
    ).toThrow(DomainException);
    expect(() =>
      mailOrigin({
        NODE_ENV: 'production',
        WEB_ORIGIN: 'https://broadcastflow.mezkitstudios.com/verificar',
      }),
    ).toThrow(DomainException);
    expect(() =>
      mailOrigin({ NODE_ENV: 'production', WEB_ORIGIN: 'http://localhost:3000' }),
    ).toThrow(DomainException);
  });

  it('arma el enlace de verificación y deja el recibo sin token', () => {
    const origin = 'https://broadcastflow.mezkitstudios.com';
    expect(actionLink(origin, 'verify', token)).toBe(
      `${origin}/verificar?token=${token}`,
    );
    const receipt = composeTransactional(
      { to: 'ana@example.test', purpose: 'receipt', token: '11111111-1111-4111-8111-111111111111' },
      { NODE_ENV: 'production', WEB_ORIGIN: origin },
      'hola@mezkitstudios.com',
      'Mezkit Studios',
    );
    expect(receipt.data).not.toContain('11111111-1111-4111-8111-111111111111');
    expect(receipt.envelopeFrom).toBe('hola@mezkitstudios.com');
    expect(receipt.data).not.toContain('Verificar mi cuenta');
  });

  it('arma correo HTML y texto en el idioma pedido, sin secretos fuera del enlace', () => {
    const origin = 'https://broadcastflow.mezkitstudios.com';
    const mail = composeTransactional(
      { to: 'ana@example.test', purpose: 'verify', token, locale: 'en' },
      { NODE_ENV: 'production', WEB_ORIGIN: origin },
      'hola@mezkitstudios.com',
      'Mezkit Studios',
    );
    expect(mail.data).toContain('multipart/alternative');
    expect(mail.data).toContain('text/plain');
    expect(mail.data).toContain('text/html');
    expect(mail.data).toContain('Verify my account');
    expect(mail.data).toContain(`${origin}/verificar?token=${token}`);
    expect(mail.data).toContain('prefers-color-scheme: dark');
    expect(mail.data).not.toContain('SMTP_PASSWORD');
    const spanish = composeTransactional(
      { to: 'ana@example.test', purpose: 'verify', token },
      { NODE_ENV: 'production', WEB_ORIGIN: origin },
      'hola@mezkitstudios.com',
      'Mezkit Studios',
    );
    expect(spanish.data).toContain('Verificar mi cuenta');
    expect(spanish.data).toContain('24 horas');
    expect(spanish.data).toContain('BroadcastFlow · Mezkit Studios');
    const reset = composeTransactional(
      { to: 'ana@example.test', purpose: 'reset', token, locale: 'en' },
      { NODE_ENV: 'production', WEB_ORIGIN: origin },
      'hola@mezkitstudios.com',
      'Mezkit Studios',
    );
    expect(reset.data).toContain('Choose password');
    expect(reset.data).toContain(`${origin}/restablecer?token=${token}`);
    expect(reset.data).toContain('1 hour');
    const invite = composeTransactional(
      { to: 'ana@example.test', purpose: 'invite', token },
      { NODE_ENV: 'production', WEB_ORIGIN: origin },
      'hola@mezkitstudios.com',
      'Mezkit Studios',
    );
    expect(invite.data).toContain('Aceptar invitación');
    expect(invite.data).toContain(`${origin}/invitar?token=${token}`);
    expect(invite.data).toContain('7 días');
  });
});
