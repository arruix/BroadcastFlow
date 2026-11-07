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
  });
});
