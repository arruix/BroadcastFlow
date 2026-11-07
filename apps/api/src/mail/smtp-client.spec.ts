import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync } from 'fs';
import { createServer, type Socket } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import { createSecureContext, TLSSocket } from 'tls';
import { DomainException } from '../shared/domain';
import { composeTransactional } from './compose';
import { MailService } from './mail.service';
import { deliverSmtp, type SmtpRuntimeConfig } from './smtp-client';
import { SmtpMailTransport } from './transport';

const token = 'verificaciontokenprueba0123456789';
const password = 'clave-smtp-de-prueba-no-real';

describe('SMTP local', () => {
  const previousOrigin = process.env.WEB_ORIGIN;
  let key = '';
  let cert = '';

  beforeAll(() => {
    const dir = mkdtempSync(join(tmpdir(), 'bf-smtp-'));
    execFileSync('openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-keyout',
      join(dir, 'key.pem'),
      '-out',
      join(dir, 'cert.pem'),
      '-days',
      '1',
      '-nodes',
      '-subj',
      '/CN=localhost',
    ]);
    key = readFileSync(join(dir, 'key.pem'), 'utf8');
    cert = readFileSync(join(dir, 'cert.pem'), 'utf8');
    process.env.WEB_ORIGIN = 'http://127.0.0.1:3000';
  });

  afterAll(() => {
    if (previousOrigin === undefined) delete process.env.WEB_ORIGIN;
    else process.env.WEB_ORIGIN = previousOrigin;
  });

  it('encola por STARTTLS y no llama a eso entrega en el buzón', async () => {
    const seen: string[] = [];
    const server = await listen((socket) =>
      script(socket, { key, cert, seen, accept: true }),
    );
    const logs: string[] = [];
    const mail = new MailService();
    mail.bindForTest(
      new SmtpMailTransport({
        ...config(server.port, { rejectUnauthorized: false, retryDelayMs: 0 }),
        from: 'hola@mezkitstudios.com',
        fromName: 'Mezkit Studios',
      }),
      (line) => logs.push(line),
    );
    const result = await mail.send({
      to: 'ana@example.test',
      purpose: 'verify',
      token,
    });
    await close(server);
    expect(result).toEqual({ disposition: 'queued', smtpCode: 250 });
    expect(logs.join('\n')).toBe(
      'mail queued purpose=verify recipient=a***@example.test smtp=250',
    );
    expect(logs.join('\n')).not.toContain(token);
    expect(logs.join('\n')).not.toContain(password);
    expect(seen.join('\n')).toContain(`http://127.0.0.1:3000/verificar?token=${token}`);
    expect(seen.join('\n')).toContain('STARTTLS');
    expect(seen.join('\n')).not.toMatch(/delivered to mailbox/i);
  });

  it('no autentica en claro y no reintenta un rechazo permanente', async () => {
    const plain: string[] = [];
    const noTls = await listen((socket) => {
      socket.write('220 localhost\r\n');
      socket.on('data', (chunk) => {
        plain.push(chunk.toString('utf8'));
        if (chunk.toString('utf8').includes('EHLO'))
          socket.write('250 localhost\r\n');
      });
    });
    await expect(
      deliverSmtp(config(noTls.port, { rejectUnauthorized: false, retryDelayMs: 0 }), sample()),
    ).rejects.toMatchObject({ code: 'mail_unavailable' });
    await close(noTls);
    expect(plain.join('')).not.toContain('AUTH');

    let sessions = 0;
    const rejected = await listen((socket) => {
      sessions += 1;
      script(socket, { key, cert, seen: [], accept: false });
    });
    await expect(
      deliverSmtp(config(rejected.port, { rejectUnauthorized: false, retryDelayMs: 0 }), sample()),
    ).rejects.toMatchObject({ code: 'mail_rejected' });
    await close(rejected);
    expect(sessions).toBe(1);
  });

  it('reintenta un 450 previo al DATA y no reintenta si el cuerpo ya salió', async () => {
    let greetings = 0;
    const flaky = await listen((socket) => {
      greetings += 1;
      if (greetings === 1) {
        socket.write('450 busy\r\n');
        socket.end();
        return;
      }
      script(socket, { key, cert, seen: [], accept: true });
    });
    const queued = await deliverSmtp(
      config(flaky.port, { rejectUnauthorized: false, retryDelayMs: 0, maxAttempts: 3 }),
      sample(),
    );
    await close(flaky);
    expect(queued.disposition).toBe('queued');
    expect(greetings).toBe(2);

    let bodies = 0;
    const dropped = await listen((socket) => {
      script(socket, {
        key,
        cert,
        seen: [],
        accept: true,
        onBody: () => {
          bodies += 1;
          socket.destroy();
        },
      });
    });
    await expect(
      deliverSmtp(config(dropped.port, { rejectUnauthorized: false, retryDelayMs: 0 }), sample()),
    ).rejects.toBeInstanceOf(DomainException);
    await close(dropped);
    expect(bodies).toBe(1);
  });

  it('en pruebas no conecta al relay de Brevo', async () => {
    const started = Date.now();
    await expect(
      deliverSmtp(
        config(587, { host: 'smtp-relay.brevo.com', password }),
        sample(),
      ),
    ).rejects.toMatchObject({ code: 'mail_not_configured' });
    expect(Date.now() - started).toBeLessThan(500);
  });
});

function sample() {
  return composeTransactional(
    { to: 'ana@example.test', purpose: 'reset', token },
    process.env,
    'hola@mezkitstudios.com',
    'Mezkit Studios',
  );
}

function config(
  port: number,
  extra: Partial<SmtpRuntimeConfig> = {},
): SmtpRuntimeConfig {
  return {
    host: '127.0.0.1',
    port,
    user: 'login@example.test',
    password,
    requireTls: true,
    rejectUnauthorized: true,
    tlsServername: 'localhost',
    timeoutMs: 2000,
    maxAttempts: 1,
    retryDelayMs: 0,
    ...extra,
  };
}

function listen(onConnection: (socket: Socket) => void) {
  const server = createServer(onConnection);
  return new Promise<{ port: number; close: () => Promise<void> }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('port');
      resolve({
        port: address.port,
        close: () =>
          new Promise((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

async function close(server: { close: () => Promise<void> }) {
  await server.close();
}

function script(
  socket: Socket,
  options: {
    key: string;
    cert: string;
    seen: string[];
    accept: boolean;
    onBody?: () => void;
  },
) {
  let secure: TLSSocket | undefined;
  let buffer = '';
  let mode: 'command' | 'data' = 'command';
  let auth = 0;
  const write = (line: string) => (secure ?? socket).write(`${line}\r\n`);
  const onData = (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    if (mode === 'data') {
      if (!buffer.includes('\r\n.\r\n')) return;
      options.seen.push(buffer);
      buffer = '';
      mode = 'command';
      if (options.onBody) {
        options.onBody();
        return;
      }
      write(options.accept ? '250 queued as test' : '550 rejected');
      return;
    }
    while (buffer.includes('\r\n')) {
      const index = buffer.indexOf('\r\n');
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      options.seen.push(line);
      if (line.startsWith('EHLO')) {
        write('250-localhost');
        if (!secure) write('250-STARTTLS');
        write('250 AUTH LOGIN');
      } else if (line === 'STARTTLS') {
        write('220 ready');
        socket.removeListener('data', onData);
        secure = new TLSSocket(socket, {
          isServer: true,
          secureContext: createSecureContext({ key: options.key, cert: options.cert }),
        });
        secure.on('data', onData);
      } else if (line === 'AUTH LOGIN') {
        auth = 1;
        write('334 challenge');
      } else if (auth === 1) {
        auth = 2;
        write('334 challenge');
      } else if (auth === 2) {
        auth = 0;
        write('235');
      } else if (line.startsWith('MAIL ') || line.startsWith('RCPT ')) {
        write('250');
      } else if (line === 'DATA') {
        write('354');
        mode = 'data';
      } else if (line === 'QUIT') {
        write('221');
      } else {
        write('502');
      }
    }
  };
  socket.on('data', onData);
  write('220 localhost');
}
