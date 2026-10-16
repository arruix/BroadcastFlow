import { Injectable } from '@nestjs/common';

export type OutboundMail = {
  to: string;
  purpose: 'verify' | 'reset' | 'receipt';
  token: string;
};

@Injectable()
export class MailService {
  readonly sent: OutboundMail[] = [];

  send(message: OutboundMail) {
    this.sent.push(message);
  }

  latest(to: string, purpose: OutboundMail['purpose']): OutboundMail | undefined {
    return [...this.sent].reverse().find((message) => message.to === to && message.purpose === purpose);
  }
}
