import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { DbService, Queryable } from '../db/db.service';
import { MailService } from '../mail/mail.service';
import {
  base32,
  decrypt,
  encrypt,
  randomToken,
  sha256,
  signJwt,
  totpValid,
  verifyJwt,
} from '../shared/crypto';
import { DomainException, mapDbError } from '../shared/domain';

const sensitiveRoles = new Set(['owner', 'admin', 'treasurer']);
const refreshMs = 30 * 24 * 60 * 60 * 1000;

type UserRow = {
  id: string;
  password_hash: string | null;
  email_verified_at: Date | null;
  failed_attempts: number;
  locked_until: Date | null;
  blocked_at: Date | null;
};

export type IssuedSession = {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  recoveryCodes?: string[];
};

@Injectable()
export class IdentidadService {
  constructor(
    private readonly db: DbService,
    private readonly mail: MailService,
  ) {}

  async register(email: string, password: string) {
    const normalized = normalizeEmail(email);
    if (password.length < 12) throw new DomainException('weak_password', 422);
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const token = randomToken();
    try {
      await this.db.asUser(null, async (db) => {
        const existing = await db.query<{ id: string }>(
          'SELECT id FROM app_user WHERE email = $1',
          [normalized],
        );
        if (existing.rowCount) throw new DomainException('email_taken', 422);
        const user = await db.query<{ id: string }>(
          `INSERT INTO app_user (email, password_hash) VALUES ($1, $2) RETURNING id`,
          [normalized, passwordHash],
        );
        await db.query(
          `INSERT INTO email_token (user_id, purpose, token_hash, expires_at)
           VALUES ($1, 'verify', $2, now() + interval '24 hours')`,
          [user.rows[0].id, sha256(token)],
        );
      });
    } catch (error) {
      mapDbError(error);
    }
    this.mail.send({ to: normalized, purpose: 'verify', token });
  }

  async resendVerification(email: string) {
    const normalized = normalizeEmail(email);
    const token = randomToken();
    let deliver = false;
    await this.db.asUser(null, async (db) => {
      const user = await db.query<{
        id: string;
        email_verified_at: Date | null;
      }>('SELECT id, email_verified_at FROM app_user WHERE email = $1', [
        normalized,
      ]);
      const row = user.rows[0];
      if (!row || row.email_verified_at) return;
      await db.query(
        `INSERT INTO email_token (user_id, purpose, token_hash, expires_at)
         VALUES ($1, 'verify', $2, now() + interval '24 hours')`,
        [row.id, sha256(token)],
      );
      deliver = true;
    });
    if (deliver) this.mail.send({ to: normalized, purpose: 'verify', token });
  }

  async verifyEmail(token: string) {
    const updated = await this.db.asUser(null, (db) =>
      db.query(
        `UPDATE email_token t
         SET used_at = now()
         FROM app_user u
         WHERE t.user_id = u.id
           AND t.token_hash = $1
           AND t.purpose = 'verify'
           AND t.used_at IS NULL
           AND t.expires_at > now()
         RETURNING t.user_id`,
        [sha256(token)],
      ),
    );
    if (!updated.rowCount) throw new DomainException('token_invalid', 422);
    await this.db.asUser(null, (db) =>
      db.query(
        'UPDATE app_user SET email_verified_at = now() WHERE id = $1 AND email_verified_at IS NULL',
        [updated.rows[0].user_id],
      ),
    );
  }

  async login(
    email: string,
    password: string,
    surface: string,
    totp?: string,
    recoveryCode?: string,
  ): Promise<
    | IssuedSession
    | { ticket?: string; code: 'mfa_required' | 'mfa_enroll_required' }
  > {
    const normalized = normalizeEmail(email);
    const user = await this.db.asUser(null, (db) =>
      db.query<UserRow>(
        `SELECT id, password_hash, email_verified_at, failed_attempts, locked_until, blocked_at
         FROM app_user WHERE email = $1`,
        [normalized],
      ),
    );
    const row = user.rows[0];
    if (!row || !row.password_hash)
      throw new DomainException('invalid_credentials', 401);
    if (row.locked_until && row.locked_until.getTime() > Date.now()) {
      throw new DomainException('locked', 401);
    }
    if (!row.email_verified_at)
      throw new DomainException('email_unverified', 401);
    const matches = await argon2.verify(row.password_hash, password);
    if (!matches) {
      await this.registerFailure(row.id, row.failed_attempts);
      throw new DomainException('invalid_credentials', 401);
    }
    if (row.blocked_at) throw new DomainException('account_blocked', 401);
    await this.db.asUser(null, (db) =>
      db.query(
        'UPDATE app_user SET failed_attempts = 0, locked_until = NULL WHERE id = $1',
        [row.id],
      ),
    );
    return this.finishLogin(row.id, surface, totp, recoveryCode);
  }

  async refresh(rawRefresh: string, surface: string): Promise<IssuedSession> {
    const hash = sha256(rawRefresh);
    return this.db.asUser(null, async (db) => {
      const found = await db.query<{
        id: string;
        user_id: string;
        family_id: string;
        expires_at: Date;
        revoked_at: Date | null;
        step_up_until: Date | null;
      }>(
        `SELECT id, user_id, family_id, expires_at, revoked_at, step_up_until
         FROM session WHERE refresh_hash = $1`,
        [hash],
      );
      const row = found.rows[0];
      if (!row) throw new DomainException('token_invalid', 401);
      if (row.revoked_at) {
        await db.query(
          'UPDATE session SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL',
          [row.family_id],
        );
        throw new DomainException('token_invalid', 401);
      }
      if (row.expires_at.getTime() <= Date.now())
        throw new DomainException('token_invalid', 401);
      await db.query('UPDATE session SET revoked_at = now() WHERE id = $1', [
        row.id,
      ]);
      return this.insertSession(
        db,
        row.user_id,
        row.family_id,
        surface,
        row.step_up_until,
      );
    });
  }

  async logout(rawRefresh: string) {
    if (!rawRefresh) return;
    await this.db.asUser(null, (db) =>
      db.query(
        'UPDATE session SET revoked_at = now() WHERE refresh_hash = $1 AND revoked_at IS NULL',
        [sha256(rawRefresh)],
      ),
    );
  }

  async forgotPassword(email: string) {
    const normalized = normalizeEmail(email);
    const token = randomToken();
    let deliver = false;
    await this.db.asUser(null, async (db) => {
      const user = await db.query<{ id: string }>(
        'SELECT id FROM app_user WHERE email = $1',
        [normalized],
      );
      if (!user.rowCount) return;
      await db.query(
        `INSERT INTO email_token (user_id, purpose, token_hash, expires_at)
         VALUES ($1, 'reset', $2, now() + interval '1 hour')`,
        [user.rows[0].id, sha256(token)],
      );
      deliver = true;
    });
    if (deliver) this.mail.send({ to: normalized, purpose: 'reset', token });
  }

  async resetPassword(token: string, password: string) {
    if (password.length < 12) throw new DomainException('weak_password', 422);
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const updated = await this.db.asUser(null, (db) =>
      db.query<{ user_id: string }>(
        `UPDATE email_token SET used_at = now()
         WHERE token_hash = $1 AND purpose = 'reset' AND used_at IS NULL AND expires_at > now()
         RETURNING user_id`,
        [sha256(token)],
      ),
    );
    if (!updated.rowCount) throw new DomainException('token_invalid', 422);
    const userId = updated.rows[0].user_id;
    await this.db.asUser(null, async (db) => {
      await db.query(
        'UPDATE app_user SET password_hash = $2, failed_attempts = 0, locked_until = NULL WHERE id = $1',
        [userId, passwordHash],
      );
      await db.query(
        'UPDATE session SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
        [userId],
      );
    });
  }

  enroll(ticket: string) {
    const userId = this.enrollUser(ticket);
    const secret = randomBytes(20);
    return {
      secret: base32(secret),
      ticket: signJwt(
        {
          sub: userId,
          purpose: 'enroll',
          sid: encrypt(secret).toString('base64url'),
        },
        600,
      ),
    };
  }

  async confirm(
    ticket: string,
    code: string,
    surface: string,
  ): Promise<IssuedSession> {
    const claims = verifyJwt(ticket);
    if (!claims || claims.purpose !== 'enroll' || !claims.sid)
      throw new DomainException('token_invalid', 401);
    const secret = decrypt(Buffer.from(claims.sid, 'base64url'));
    if (!totpValid(secret, code)) {
      await this.registerFailure(
        claims.sub,
        await this.failureCount(claims.sub),
      );
      throw new DomainException('invalid_credentials', 401);
    }
    const recoveryCodes = Array.from({ length: 8 }, () =>
      randomToken().slice(0, 10),
    );
    try {
      await this.db.asUser(null, async (db) => {
        await db.query(
          `INSERT INTO mfa_secret (user_id, secret_ciphertext, enabled_at)
           VALUES ($1, $2, now())
           ON CONFLICT (user_id) DO UPDATE SET secret_ciphertext = EXCLUDED.secret_ciphertext, enabled_at = now()`,
          [claims.sub, encrypt(secret)],
        );
        await db.query(
          'UPDATE mfa_recovery_code SET used_at = now() WHERE user_id = $1 AND used_at IS NULL',
          [claims.sub],
        );
        for (const recovery of recoveryCodes) {
          await db.query(
            'INSERT INTO mfa_recovery_code (user_id, code_hash) VALUES ($1, $2)',
            [claims.sub, sha256(recovery)],
          );
        }
      });
    } catch (error) {
      mapDbError(error);
    }
    const session = await this.db.asUser(null, (db) =>
      this.insertSession(db, claims.sub, cryptoRandomUuid(), surface, null),
    );
    return { ...session, recoveryCodes };
  }

  async me(userId: string) {
    const row = await this.db.asWorker((db) =>
      db.query<{ platform_operator: boolean; email: string }>(
        'SELECT platform_operator, email FROM app_user WHERE id = $1',
        [userId],
      ),
    );
    return {
      email: row.rows[0]?.email ?? '',
      platformOperator: Boolean(row.rows[0]?.platform_operator),
    };
  }

  async stepUp(userId: string, sessionId: string, code: string) {
    const secret = await this.secretFor(userId);
    if (!secret || !totpValid(secret, code))
      throw new DomainException('invalid_credentials', 401);
    await this.db.asUser(userId, (db) =>
      db.query(
        `UPDATE session SET step_up_until = now() + interval '10 minutes' WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
        [sessionId, userId],
      ),
    );
  }

  async saveSubject(userId: string, provider: string, subject: string) {
    try {
      await this.db.asUser(userId, (db) =>
        db.query(
          'INSERT INTO external_identity (user_id, provider, subject) VALUES ($1, $2, $3)',
          [userId, provider, subject],
        ),
      );
    } catch (error) {
      mapDbError(error);
    }
  }

  async userIdForSubject(
    provider: string,
    subject: string,
  ): Promise<string | undefined> {
    const found = await this.db.asWorker((db) =>
      db.query<{ user_id: string }>(
        'SELECT user_id FROM external_identity WHERE provider = $1 AND subject = $2',
        [provider, subject],
      ),
    );
    return found.rows[0]?.user_id;
  }

  startOAuth(provider: 'google' | 'microsoft') {
    const clientId =
      provider === 'google'
        ? process.env.GOOGLE_CLIENT_ID
        : process.env.MICROSOFT_CLIENT_ID;
    if (!clientId) throw new DomainException('oauth_not_configured', 422);
    const state = randomToken();
    const verifier = randomToken();
    return this.db.asWorker(async (db) => {
      await db.query(
        `INSERT INTO oauth_transaction (provider, state_hash, verifier_ciphertext, expires_at)
         VALUES ($1, $2, $3, now() + interval '10 minutes')`,
        [provider, sha256(state), encrypt(Buffer.from(verifier))],
      );
      const authorizationUrl =
        provider === 'google'
          ? `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&state=${encodeURIComponent(state)}&code_challenge_method=S256`
          : `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${encodeURIComponent(clientId)}&state=${encodeURIComponent(state)}&code_challenge_method=S256`;
      return { authorizationUrl, state };
    });
  }

  private async finishLogin(
    userId: string,
    surface: string,
    totp?: string,
    recoveryCode?: string,
  ): Promise<
    | IssuedSession
    | { ticket?: string; code: 'mfa_required' | 'mfa_enroll_required' }
  > {
    const roles = await this.db.asUser(userId, (db) =>
      db.query<{ role: string }>(
        'SELECT role FROM membership WHERE user_id = $1',
        [userId],
      ),
    );
    const operator = await this.db.asWorker((db) =>
      db.query<{ platform_operator: boolean }>(
        'SELECT platform_operator FROM app_user WHERE id = $1',
        [userId],
      ),
    );
    const needsMfa =
      Boolean(operator.rows[0]?.platform_operator) ||
      roles.rows.some((row) => sensitiveRoles.has(row.role));
    const secret = await this.secretFor(userId);
    if (!needsMfa && !secret) {
      return this.db.asUser(userId, (db) =>
        this.insertSession(db, userId, cryptoRandomUuid(), surface, null),
      );
    }
    if (!secret) {
      return {
        code: 'mfa_enroll_required',
        ticket: signJwt({ sub: userId, purpose: 'enroll' }, 600),
      };
    }
    if (recoveryCode) {
      const used = await this.consumeRecovery(userId, recoveryCode);
      if (!used) throw new DomainException('invalid_credentials', 401);
      await this.db.asWorker(async (db) => {
        await db.query('DELETE FROM mfa_secret WHERE user_id = $1', [userId]);
        await db.query('DELETE FROM mfa_recovery_code WHERE user_id = $1', [
          userId,
        ]);
      });
      return {
        code: 'mfa_enroll_required',
        ticket: signJwt({ sub: userId, purpose: 'enroll' }, 600),
      };
    }
    if (!totp) return { code: 'mfa_required' };
    if (!totpValid(secret, totp)) {
      await this.registerFailure(userId, await this.failureCount(userId));
      throw new DomainException('invalid_credentials', 401);
    }
    return this.db.asUser(userId, (db) =>
      this.insertSession(db, userId, cryptoRandomUuid(), surface, null),
    );
  }

  private enrollUser(ticket: string): string {
    const claims = verifyJwt(ticket);
    if (!claims || claims.purpose !== 'enroll')
      throw new DomainException('token_invalid', 401);
    return claims.sub;
  }

  private async secretFor(userId: string): Promise<Buffer | undefined> {
    const found = await this.db.asUser(null, (db) =>
      db.query<{ secret_ciphertext: Buffer }>(
        'SELECT secret_ciphertext FROM mfa_secret WHERE user_id = $1',
        [userId],
      ),
    );
    const row = found.rows[0];
    return row ? decrypt(row.secret_ciphertext) : undefined;
  }

  private async consumeRecovery(
    userId: string,
    recoveryCode: string,
  ): Promise<boolean> {
    const updated = await this.db.asUser(null, (db) =>
      db.query(
        `UPDATE mfa_recovery_code SET used_at = now()
         WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL`,
        [userId, sha256(recoveryCode)],
      ),
    );
    return Boolean(updated.rowCount);
  }

  private async failureCount(userId: string): Promise<number> {
    const found = await this.db.asUser(null, (db) =>
      db.query<{ failed_attempts: number }>(
        'SELECT failed_attempts FROM app_user WHERE id = $1',
        [userId],
      ),
    );
    return found.rows[0]?.failed_attempts ?? 0;
  }

  private async registerFailure(userId: string, current: number) {
    const next = current + 1;
    await this.db.asUser(null, (db) =>
      db.query(
        `UPDATE app_user
         SET failed_attempts = $2,
             locked_until = CASE WHEN $2 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END
         WHERE id = $1`,
        [userId, next],
      ),
    );
    if (next >= 5) throw new DomainException('locked', 401);
  }

  private async insertSession(
    db: Queryable,
    userId: string,
    familyId: string,
    _surface: string,
    stepUpUntil: Date | null,
  ): Promise<IssuedSession> {
    const refreshToken = randomToken();
    const created = await db.query<{ id: string }>(
      `INSERT INTO session (user_id, family_id, refresh_hash, expires_at, step_up_until)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        userId,
        familyId,
        sha256(refreshToken),
        new Date(Date.now() + refreshMs),
        stepUpUntil,
      ],
    );
    return {
      accessToken: signJwt(
        { sub: userId, sid: created.rows[0].id, purpose: 'access' },
        900,
      ),
      expiresIn: 900,
      refreshToken,
    };
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function cryptoRandomUuid(): string {
  return randomBytes(16)
    .toString('hex')
    .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
}
