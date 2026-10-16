import { EventEmitter } from 'events';
import { Injectable } from '@nestjs/common';

export type BoardEvent = { name: 'visit.counted'; campaignId: string };

@Injectable()
export class BoardBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish(organizationId: string, event: BoardEvent) {
    this.emitter.emit(organizationId, event);
  }

  listen(organizationId: string, handler: (event: BoardEvent) => void) {
    this.emitter.on(organizationId, handler);
    return () => this.emitter.off(organizationId, handler);
  }
}
