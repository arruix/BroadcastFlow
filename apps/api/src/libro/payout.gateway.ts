import { Injectable } from '@nestjs/common';

@Injectable()
export class PayoutGateway {
  outcome: 'ok' | 'failed' = 'ok';
  sent: string[] = [];

  send(payoutId: string) {
    this.sent.push(payoutId);
    return this.outcome;
  }
}
