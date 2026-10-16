import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

const devJwt = 'dev-only-jwt-secret-change-me';
const devMfa = 'dev-only-mfa-key-change-me';

function secret(name: 'JWT_SECRET' | 'MFA_KEY', dev: string): string {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${name} is required`);
  }
  return dev;
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

function mfaKey(): Buffer {
  return createHash('sha256').update(secret('MFA_KEY', devMfa)).digest();
}

export function encrypt(plain: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', mfaKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]);
}

export function decrypt(payload: Buffer): Buffer {
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const ciphertext = payload.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', mfaKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

type AccessClaims = {
  sub: string;
  sid?: string;
  purpose?: 'access' | 'enroll';
  exp: number;
};

export function signJwt(claims: Omit<AccessClaims, 'exp'>, ttlSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...claims, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString('base64url');
  const data = `${header}.${body}`;
  const sig = createHmac('sha256', secret('JWT_SECRET', devJwt)).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyJwt(token: string): AccessClaims | undefined {
  const [header, body, sig] = token.split('.');
  if (!header || !body || !sig) return undefined;
  const data = `${header}.${body}`;
  const expected = createHmac('sha256', secret('JWT_SECRET', devJwt)).update(data).digest();
  const actual = Buffer.from(sig, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return undefined;
  const claims = JSON.parse(Buffer.from(body, 'base64url').toString()) as AccessClaims;
  if (claims.exp * 1000 <= Date.now()) return undefined;
  return claims;
}

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of input.toUpperCase().replace(/=+$/, '')) {
    const index = alphabet.indexOf(char);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function totpCode(secret: Buffer, at = Date.now()): string {
  const counter = Math.floor(at / 30000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secret).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1000000).padStart(6, '0');
}

export function donationsWebhookSecret(): string {
  const value = process.env.DONATIONS_WEBHOOK_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === 'production') throw new Error('DONATIONS_WEBHOOK_SECRET is required');
  return 'dev-only-donations-webhook-secret';
}

export function signWebhook(payload: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const signature = createHmac('sha256', donationsWebhookSecret()).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

export function webhookSignatureOk(payload: string, header: string | undefined, now = Date.now()): boolean {
  if (!header) return false;
  const parts = new Map(header.split(',').map((part) => part.split('=') as [string, string]));
  const timestamp = Number(parts.get('t'));
  const signature = parts.get('v1');
  if (!Number.isFinite(timestamp) || !signature) return false;
  if (Math.abs(now - timestamp * 1000) > 300_000) return false;
  const expected = createHmac('sha256', donationsWebhookSecret()).update(`${timestamp}.${payload}`).digest('hex');
  const actual = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (actual.length !== wanted.length) return false;
  return timingSafeEqual(actual, wanted);
}

export function totpValid(secret: Buffer, token: string): boolean {
  return [-1, 0, 1].some((window) => totpCode(secret, Date.now() + window * 30000) === token);
}
