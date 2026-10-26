import { Injectable } from '@nestjs/common';
import { randomToken } from '../shared/crypto';
import { DomainException } from '../shared/domain';

@Injectable()
export class YoutubeGateway {
  configured(): boolean {
    return Boolean(
      process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET,
    );
  }

  authorizationUrl(state: string): string {
    if (!this.configured()) {
      if (process.env.NODE_ENV === 'production')
        throw new DomainException('oauth_not_configured', 422);
      const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
      return `${origin}/conexiones/youtube?state=${encodeURIComponent(state)}`;
    }
    const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
    const redirect = encodeURIComponent(
      process.env.YOUTUBE_REDIRECT_URI ?? `${origin}/conexiones/youtube`,
    );
    const scope = encodeURIComponent('https://www.googleapis.com/auth/youtube');
    return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(process.env.YOUTUBE_CLIENT_ID ?? '')}&redirect_uri=${redirect}&state=${encodeURIComponent(state)}&scope=${scope}&response_type=code`;
  }

  exchange(input: { channelId?: string; scopes?: string[] }): {
    channelId: string;
    token: string;
  } {
    const channelId = (input.channelId ?? '').trim();
    if (!/^[0-9A-Za-z_-]{1,64}$/.test(channelId))
      throw new DomainException('network_unavailable', 422);
    return { channelId, token: randomToken() };
  }
}
