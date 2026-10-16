import { Injectable } from '@nestjs/common';
import { randomToken } from '../shared/crypto';
import { DomainException } from '../shared/domain';

export type PublishInput = {
  publicationId: string;
  token: string;
  pageId: string;
  body: string;
  link: string;
  imageKey: string | null;
};

@Injectable()
export class FacebookGateway {
  outcome: 'ok' | 'retry' | 'terminal' = 'ok';
  publishes: { publicationId: string; imageKey: string | null; body: string }[] = [];
  lastToken = '';

  configured(): boolean {
    return Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
  }

  authorizationUrl(state: string): string {
    if (!this.configured()) {
      if (process.env.NODE_ENV === 'production') throw new DomainException('oauth_not_configured', 422);
      const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
      return `${origin}/conexiones/facebook?state=${encodeURIComponent(state)}`;
    }
    const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
    const redirect = encodeURIComponent(process.env.FACEBOOK_REDIRECT_URI ?? `${origin}/conexiones/facebook`);
    const scope = encodeURIComponent('pages_show_list,pages_manage_posts');
    return `https://www.facebook.com/v21.0/dialog/oauth?client_id=${encodeURIComponent(process.env.FACEBOOK_APP_ID ?? '')}&redirect_uri=${redirect}&state=${encodeURIComponent(state)}&scope=${scope}`;
  }

  exchange(input: { pageId?: string; scopes?: string[] }): { pageId: string; token: string; scopes: string[] } {
    const pageId = (input.pageId ?? '').trim();
    if (!/^[0-9A-Za-z_-]{1,64}$/.test(pageId)) throw new DomainException('network_unavailable', 422);
    const token = randomToken();
    this.lastToken = token;
    return { pageId, token, scopes: input.scopes ?? [] };
  }

  publish(input: PublishInput): 'ok' | 'retry' | 'terminal' {
    this.publishes.push({ publicationId: input.publicationId, imageKey: input.imageKey, body: input.body });
    return this.outcome;
  }
}
