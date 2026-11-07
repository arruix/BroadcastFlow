import { DomainException } from '../shared/domain';
import { MailService, mailLogLine } from './mail.service';
import {
  createMailTransport,
  MemoryMailTransport,
  readSmtpConfig,
  UnconfiguredMailTransport,
} from './transport';

describe('correo transaccional', () => {
  it('no escribe el token ni el buzón completo en el log', async () => {
    const token = 'token-secreto-de-verificacion';
    const logs: string[] = [];
    const mail = new MailService();
    mail.bindForTest(new MemoryMailTransport(), (line) => logs.push(line));
    const result = await mail.send({
      to: 'ana.ruiz@example.test',
      purpose: 'verify',
      token,
    });
    expect(result).toEqual({ disposition: 'stored' });
    expect(logs).toEqual([
      'mail stored purpose=verify recipient=a***@example.test',
    ]);
    expect(logs.join('\n')).not.toContain(token);
    expect(logs.join('\n')).not.toContain('ana.ruiz');
    expect(mail.latest('ana.ruiz@example.test', 'verify')?.token).toBe(token);
  });

  it('en producción sin proveedor no entrega y no guarda el token', async () => {
    const transport = createMailTransport({ NODE_ENV: 'production' });
    expect(transport).toBeInstanceOf(UnconfiguredMailTransport);
    expect(transport.canDeliver()).toBe(false);
    await expect(
      transport.send({
        to: 'ana@example.test',
        purpose: 'reset',
        token: 'no-debe-quedar',
      }),
    ).rejects.toBeInstanceOf(DomainException);
    const mail = new MailService();
    mail.bindForTest(transport, () => undefined);
    expect(mail.sent).toEqual([]);
  });

  it('smtp sin clave no abre transporte y los defaults no desactivan TLS', () => {
    const transport = createMailTransport({
      NODE_ENV: 'production',
      MAIL_TRANSPORT: 'smtp',
      SMTP_USER: 'login@example.test',
    });
    expect(transport).toBeInstanceOf(UnconfiguredMailTransport);
    const config = readSmtpConfig({});
    expect(config.host).toBe('smtp-relay.brevo.com');
    expect(config.port).toBe(587);
    expect(config.from).toBe('hola@mezkitstudios.com');
    expect(config.fromName).toBe('Mezkit Studios');
    expect(config.requireTls).toBe(true);
    expect(config.rejectUnauthorized).toBe(true);
    expect(config.password).toBe('');
    expect(
      mailLogLine(
        {
          to: 'ana@example.test',
          purpose: 'invite',
          token: 'otro-token-de-prueba-123456',
        },
        { disposition: 'queued', smtpCode: 250 },
      ),
    ).toBe('mail queued purpose=invite recipient=a***@example.test smtp=250');
  });
});
