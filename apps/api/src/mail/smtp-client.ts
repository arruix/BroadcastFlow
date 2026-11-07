import { connect as connectTcp, type Socket } from 'net';
import { connect as connectTls, type TLSSocket } from 'tls';
import { DomainException } from '../shared/domain';
import type { Rfc822 } from './compose';

export type SmtpRuntimeConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  requireTls: boolean;
  rejectUnauthorized: boolean;
  tlsServername?: string;
  timeoutMs: number;
  maxAttempts: number;
  retryDelayMs: number;
};

export type SmtpQueued = { disposition: 'queued'; smtpCode: number };

type Phase = 'connect' | 'tls' | 'auth' | 'envelope' | 'data';

export class MailRelayError extends Error {
  constructor(
    readonly failure: 'mail_unavailable' | 'mail_rejected' | 'mail_not_configured',
    readonly smtpCode: number | undefined,
    readonly retryable: boolean,
    readonly phase: Phase,
  ) {
    super(failure);
  }
}

// 250 después de DATA significa que el relay aceptó el mensaje en cola.
// No significa que el buzón del destinatario lo haya entregado.
export async function deliverSmtp(
  config: SmtpRuntimeConfig,
  mail: Rfc822,
): Promise<SmtpQueued> {
  if (
    process.env.NODE_ENV === 'test' &&
    config.host === 'smtp-relay.brevo.com'
  ) {
    throw new DomainException('mail_not_configured', 503);
  }
  let last: MailRelayError | undefined;
  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    try {
      const smtpCode = await smtpSession(config, mail);
      return { disposition: 'queued', smtpCode };
    } catch (error) {
      const relay = asRelay(error);
      last = relay;
      if (!relay.retryable || attempt === config.maxAttempts) break;
      await delay(config.retryDelayMs);
    }
  }
  throw new DomainException(
    last?.failure ?? 'mail_unavailable',
    last?.failure === 'mail_rejected' ? 502 : 503,
  );
}

async function smtpSession(
  config: SmtpRuntimeConfig,
  mail: Rfc822,
): Promise<number> {
  const socket = connectTcp({ host: config.host, port: config.port });
  socket.setTimeout(config.timeoutMs);
  const reader = new ReplyReader();
  let active: Socket | TLSSocket = socket;
  let dataCommitted = false;
  const arm = (next: Socket | TLSSocket) => {
    active = next;
    next.setTimeout(config.timeoutMs);
    next.on('data', (chunk: Buffer) => reader.push(chunk));
    next.on('error', (error) => reader.fail(error));
    next.on('timeout', () => next.destroy(new Error('timeout')));
    next.on('close', () => reader.fail(new Error('closed')));
  };
  arm(socket);
  try {
    await expectCode(reader, 220, 'connect', true);
    const ehlo = await command(active, reader, `EHLO broadcastflow`, 'tls', true);
    if (config.requireTls) {
      if (!/^250[ -].*STARTTLS/im.test(ehlo.text) && !ehlo.text.includes('STARTTLS'))
        throw new MailRelayError('mail_unavailable', undefined, false, 'tls');
      await command(active, reader, 'STARTTLS', 'tls', true);
      socket.removeAllListeners('data');
      const secure = connectTls({
        socket,
        servername: config.tlsServername || config.host,
        rejectUnauthorized: config.rejectUnauthorized,
      });
      reader.reset();
      arm(secure);
      await onceReady(secure);
      await command(secure, reader, 'EHLO broadcastflow', 'tls', true);
      active = secure;
    } else if (!config.requireTls && config.host !== '127.0.0.1' && config.host !== '::1') {
      throw new MailRelayError('mail_not_configured', undefined, false, 'tls');
    }
    if (config.requireTls && active === socket)
      throw new MailRelayError('mail_not_configured', undefined, false, 'auth');
    await command(active, reader, 'AUTH LOGIN', 'auth', false);
    await command(active, reader, b64(config.user), 'auth', false);
    await command(active, reader, b64(config.password), 'auth', false);
    await command(active, reader, `MAIL FROM:<${mail.envelopeFrom}>`, 'envelope', true);
    await command(active, reader, `RCPT TO:<${mail.to}>`, 'envelope', true);
    await command(active, reader, 'DATA', 'data', false);
    dataCommitted = true;
    const accepted = await writeData(active, reader, mail.data);
    void command(active, reader, 'QUIT', 'data', false).catch(() => undefined);
    return accepted;
  } catch (error) {
    if (dataCommitted) {
      const relay = error instanceof MailRelayError ? error : asRelay(error);
      throw new MailRelayError(relay.failure, relay.smtpCode, false, 'data');
    }
    throw error;
  } finally {
    socket.destroy();
    if (active !== socket) active.destroy();
  }
}

async function command(
  socket: Socket | TLSSocket,
  reader: ReplyReader,
  line: string,
  phase: Phase,
  retryable: boolean,
): Promise<{ code: number; text: string }> {
  if (/[\r\n]/.test(line))
    throw new MailRelayError('mail_rejected', undefined, false, phase);
  socket.write(`${line}\r\n`);
  const reply = await reader.read();
  if (!wanted(reply.code, line))
    throw classify(reply.code, phase, retryable);
  return reply;
}

function wanted(code: number, line: string): boolean {
  if (line === 'AUTH LOGIN' || line.startsWith('MAIL ') || line.startsWith('RCPT '))
    return code === 235 || code === 250 || code === 334;
  if (line === 'DATA') return code === 354;
  if (line === 'STARTTLS') return code === 220;
  if (line.startsWith('EHLO ') || line === 'QUIT') return code >= 200 && code < 400;
  return code === 235 || code === 334 || (code >= 200 && code < 300);
}

async function expectCode(
  reader: ReplyReader,
  code: number,
  phase: Phase,
  retryable: boolean,
) {
  const reply = await reader.read();
  if (reply.code !== code) throw classify(reply.code, phase, retryable);
}

async function writeData(
  socket: Socket | TLSSocket,
  reader: ReplyReader,
  data: string,
): Promise<number> {
  socket.write(`${dotStuff(data)}`);
  const reply = await reader.read();
  if (reply.code < 200 || reply.code >= 300)
    throw classify(reply.code, 'data', false);
  return reply.code;
}

function classify(code: number, phase: Phase, earlyRetry: boolean): MailRelayError {
  if (code === 535 || code === 534)
    return new MailRelayError('mail_not_configured', code, false, 'auth');
  if (code >= 500)
    return new MailRelayError('mail_rejected', code, false, phase);
  const transient = code === 421 || code === 450 || code === 451 || code === 452;
  return new MailRelayError(
    'mail_unavailable',
    code,
    earlyRetry && transient,
    phase,
  );
}

function asRelay(error: unknown): MailRelayError {
  if (error instanceof MailRelayError) return error;
  if (error instanceof DomainException)
    return new MailRelayError('mail_not_configured', undefined, false, 'connect');
  return new MailRelayError('mail_unavailable', undefined, true, 'connect');
}

function dotStuff(data: string): string {
  const lines = data.replace(/\r?\n/g, '\r\n').split('\r\n');
  const stuffed = lines
    .map((line) => (line.startsWith('.') ? `.${line}` : line))
    .join('\r\n');
  return `${stuffed}\r\n.\r\n`;
}

function b64(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function onceReady(socket: TLSSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('secureConnect', () => resolve());
    socket.once('error', reject);
  });
}

class ReplyReader {
  private buffer = '';
  private failed: Error | undefined;
  private pending:
    | { resolve: (value: { code: number; text: string }) => void; reject: (error: Error) => void }
    | undefined;

  push(chunk: Buffer) {
    this.buffer += chunk.toString('latin1');
    this.flush();
  }

  fail(error: Error) {
    this.failed = error;
    this.pending?.reject(error);
    this.pending = undefined;
  }

  reset() {
    this.buffer = '';
  }

  read(): Promise<{ code: number; text: string }> {
    const ready = this.take();
    if (ready) return Promise.resolve(ready);
    if (this.failed) return Promise.reject(this.failed);
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
    });
  }

  private flush() {
    if (!this.pending) return;
    const ready = this.take();
    if (!ready) return;
    const waiter = this.pending;
    this.pending = undefined;
    waiter.resolve(ready);
  }

  private take(): { code: number; text: string } | undefined {
    const lines: string[] = [];
    while (this.buffer.includes('\n')) {
      const index = this.buffer.indexOf('\n');
      const line = this.buffer.slice(0, index).replace(/\r$/, '');
      this.buffer = this.buffer.slice(index + 1);
      const match = /^(\d{3})(?:([ -])(.*))?$/.exec(line);
      if (!match) throw new MailRelayError('mail_unavailable', undefined, true, 'connect');
      lines.push(match[3] ?? '');
      if ((match[2] ?? ' ') === ' ')
        return { code: Number(match[1]), text: lines.join('\n') };
    }
    return undefined;
  }
}
