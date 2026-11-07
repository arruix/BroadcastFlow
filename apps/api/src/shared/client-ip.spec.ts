import { resolveClientIp } from './client-ip';

describe('resolveClientIp', () => {
  it('ignora X-Forwarded-For si el par no es un proxy de confianza', () => {
    expect(
      resolveClientIp({
        remoteAddress: '203.0.113.5',
        forwardedFor: '198.51.100.20',
      }),
    ).toBe('203.0.113.5');
  });

  it('usa el salto de la derecha cuando el par es loopback', () => {
    expect(
      resolveClientIp({
        remoteAddress: '::ffff:127.0.0.1',
        forwardedFor: '198.51.100.9, 203.0.113.10',
      }),
    ).toBe('203.0.113.10');
  });

  it('no acepta el secreto vacío ni un secreto distinto', () => {
    expect(
      resolveClientIp({
        remoteAddress: '172.18.0.1',
        forwardedFor: '203.0.113.10',
        proxyToken: 'visitor-supplied',
        proxySharedSecret: '',
      }),
    ).toBe('172.18.0.1');
    expect(
      resolveClientIp({
        remoteAddress: '172.18.0.1',
        forwardedFor: '203.0.113.10',
        proxyToken: 'wrong',
        proxySharedSecret: 'proxy-secret',
      }),
    ).toBe('172.18.0.1');
  });

  it('acepta la cadena solo con el secreto compartido del proxy', () => {
    expect(
      resolveClientIp({
        remoteAddress: '172.18.0.1',
        forwardedFor: '198.51.100.9, 203.0.113.44',
        proxyToken: 'proxy-secret',
        proxySharedSecret: 'proxy-secret',
      }),
    ).toBe('203.0.113.44');
  });

  it('salta proxies listados y descarta un salto inválido', () => {
    expect(
      resolveClientIp({
        remoteAddress: '10.0.0.8',
        forwardedFor: 'no-es-ip, 203.0.113.7, 10.0.0.8',
        trustedProxies: ['10.0.0.8'],
      }),
    ).toBe('203.0.113.7');
  });
});
