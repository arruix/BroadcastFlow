import { Injectable } from '@nestjs/common';
import { randomToken } from '../shared/crypto';

@Injectable()
export class LiveGateway {
  reject = new Set<string>();
  opened: { network: string; sessionId: string }[] = [];
  stopped: string[] = [];

  open(
    network: string,
    sessionId: string,
  ): { externalId: string; ingestKey: string } | 'rejected' {
    this.opened.push({ network, sessionId });
    if (this.reject.has(network)) return 'rejected';
    return {
      externalId: `${network}-${sessionId.slice(0, 8)}`,
      ingestKey: randomToken(),
    };
  }

  stop(externalId: string) {
    this.stopped.push(externalId);
  }
}
