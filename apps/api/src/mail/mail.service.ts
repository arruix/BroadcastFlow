import { Injectable } from '@nestjs/common';
import {
  createMailTransport,
  MemoryMailTransport,
  type MailDisposition,
  type MailTransport,
} from './transport';

export type MailLocale = 'es' | 'en';

export type OutboundMail = {
  to: string;
  purpose: 'verify' | 'reset' | 'receipt' | 'invite';
  token: string;
  locale?: MailLocale;
};

export function mailLocale(value: unknown): MailLocale {
  return value === 'en' ? 'en' : 'es';
}

@Injectable()
export class MailService {
  private transport: MailTransport = createMailTransport(process.env);
  private writeLog: (line: string) => void = (line) => console.log(line);

  bindForTest(transport: MailTransport, writeLog?: (line: string) => void) {
    this.transport = transport;
    if (writeLog) this.writeLog = writeLog;
  }

  get sent(): OutboundMail[] {
    return this.transport instanceof MemoryMailTransport
      ? this.transport.sent
      : [];
  }

  canDeliver(): boolean {
    return this.transport.canDeliver();
  }

  async send(message: OutboundMail): Promise<MailDisposition> {
    const result = await this.transport.send(message);
    this.writeLog(mailLogLine(message, result));
    return result;
  }

  latest(
    to: string,
    purpose: OutboundMail['purpose'],
  ): OutboundMail | undefined {
    return [...this.sent]
      .reverse()
      .find((message) => message.to === to && message.purpose === purpose);
  }
}

export function mailLogLine(
  message: OutboundMail,
  result: MailDisposition,
): string {
  const recipient = redactMailbox(message.to);
  if (result.disposition === 'queued')
    return `mail queued purpose=${message.purpose} recipient=${recipient} smtp=${result.smtpCode}`;
  return `mail stored purpose=${message.purpose} recipient=${recipient}`;
}

export function redactMailbox(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return 'redacted';
  const domain = email.slice(at + 1);
  if (!domain || domain.includes('@')) return 'redacted';
  return `${email.slice(0, 1)}***@${domain}`;
}
