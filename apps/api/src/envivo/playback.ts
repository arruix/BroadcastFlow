import { createHmac } from 'crypto';

const fourHours = 4 * 60 * 60;

export function playbackUrl(sessionId: string): string {
  const origin = process.env.API_ORIGIN ?? 'http://localhost:3001';
  return `${origin}/v1/public/live/${sessionId}/index.m3u8`;
}

export function signRoom(sessionId: string, ttlSeconds: number): string {
  const secret = process.env.JWT_SECRET ?? 'dev-only-jwt-secret-change-me';
  const exp =
    Math.floor(Date.now() / 1000) +
    Math.max(1, Math.min(ttlSeconds, fourHours));
  const body = Buffer.from(
    JSON.stringify({ purpose: 'room', sid: sessionId, exp }),
  ).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(body)
    .digest('base64url');
  return `${body}.${signature}`;
}

export function playlist(sessionId: string): string {
  return `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:4
#EXTINF:4.0,
${sessionId}.ts
#EXT-X-ENDLIST
`;
}
