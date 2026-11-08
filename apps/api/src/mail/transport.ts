import { DomainException } from '../shared/domain';
import { composeTransactional } from './compose';
import type { OutboundMail } from './mail.service';
import {
  deliverSmtp,
  type SmtpQueued,
  type SmtpRuntimeConfig,
} from './smtp-client';

export type MailDisposition = { disposition: 'stored' } | SmtpQueued;

export interface MailTransport {
  canDeliver(): boolean;
  send(message: OutboundMail): Promise<MailDisposition>;
}

export class MemoryMailTransport implements MailTransport {
  readonly sent: OutboundMail[] = [];

  canDeliver(): boolean {
    return true;
  }

  async send(message: OutboundMail): Promise<MailDisposition> {
    this.sent.push(message);
    return { disposition: 'stored' };
  }
}

export class UnconfiguredMailTransport implements MailTransport {
  canDeliver(): boolean {
    return false;
  }

  async send(): Promise<MailDisposition> {
    throw new DomainException('mail_not_configured', 503);
  }
}

export type SmtpConfig = SmtpRuntimeConfig & { from: string; fromName: string };

export class SmtpMailTransport implements MailTransport {
  constructor(private readonly config: SmtpConfig) {}

  canDeliver(): boolean {
    return Boolean(
      this.config.host &&
        this.config.from &&
        this.config.user &&
        this.config.password,
    );
  }

  async send(message: OutboundMail): Promise<MailDisposition> {
    if (!this.canDeliver()) throw new DomainException('mail_not_configured', 503);
    const rfc = composeTransactional(
      message,
      process.env,
      this.config.from,
      this.config.fromName,
    );
    return deliverSmtp(this.config, rfc);
  }
}

export function createMailTransport(env: NodeJS.ProcessEnv): MailTransport {
  const mode =
    env.MAIL_TRANSPORT?.trim() ||
    (env.NODE_ENV === 'production' ? 'unconfigured' : 'memory');
  if (mode === 'memory') return new MemoryMailTransport();
  if (mode === 'smtp') {
    const config = readSmtpConfig(env);
    if (!config.user || !config.password) return new UnconfiguredMailTransport();
    return new SmtpMailTransport(config);
  }
  return new UnconfiguredMailTransport();
}

export function readSmtpConfig(env: NodeJS.ProcessEnv): SmtpConfig {
  const port = Number(env.SMTP_PORT ?? '587');
  return {
    host: (env.SMTP_HOST ?? '').trim() || 'smtp-relay.brevo.com',
    port: Number.isInteger(port) && port > 0 ? port : 587,
    from: (env.SMTP_FROM ?? '').trim() || 'hola@mezkitstudios.com',
    fromName: (env.SMTP_FROM_NAME ?? '').trim() || 'Mezkit Studios',
    user: (env.SMTP_USER ?? '').trim(),
    password: env.SMTP_PASSWORD ?? '',
    requireTls: true,
    rejectUnauthorized: true,
    tlsServername: (env.SMTP_TLS_SERVERNAME ?? '').trim() || undefined,
    timeoutMs: 10_000,
    maxAttempts: 3,
    retryDelayMs: 200,
  };
}
