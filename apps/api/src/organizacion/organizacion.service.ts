import { Injectable } from '@nestjs/common';
import { DbService, type Queryable } from '../db/db.service';
import { MailService } from '../mail/mail.service';
import { randomToken, sha256 } from '../shared/crypto';
import { DomainException, mapDbError } from '../shared/domain';
import { assertWritable } from '../shared/subscription';

const memberRoles = [
  'admin',
  'editor',
  'publisher',
  'treasurer',
  'analyst',
] as const;

@Injectable()
export class OrganizacionService {
  constructor(
    private readonly db: DbService,
    private readonly mail: MailService,
  ) {}

  list(userId: string) {
    return this.db.asUser(userId, async (db) => {
      const rows = await db.query<{ id: string; name: string; role: string }>(
        `SELECT o.id, o.name, m.role
         FROM organization o
         JOIN membership m ON m.organization_id = o.id
         WHERE m.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
         ORDER BY o.created_at`,
      );
      return rows.rows;
    });
  }

  async members(userId: string, organizationId: string) {
    return this.db.asUser(userId, async (db) => {
      await requireManager(db, organizationId);
      const people = await db.query<{
        id: string;
        email: string;
        role: string;
      }>(
        `SELECT m.id, u.email, m.role
         FROM membership m
         JOIN app_user u ON u.id = m.user_id
         WHERE m.organization_id = $1
         ORDER BY u.email`,
        [organizationId],
      );
      const invitations = await db.query<{
        id: string;
        email: string;
        role: string;
        expires_at: Date;
      }>(
        `SELECT id, email, role, expires_at
         FROM invitation
         WHERE organization_id = $1 AND accepted_at IS NULL AND expires_at > now()
         ORDER BY created_at DESC`,
        [organizationId],
      );
      return {
        members: people.rows,
        invitations: invitations.rows.map((row) => ({
          id: row.id,
          email: row.email,
          role: row.role,
          expiresAt: row.expires_at,
        })),
      };
    });
  }

  async invite(
    userId: string,
    organizationId: string,
    email: string,
    role: string,
  ) {
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+$/.test(normalized))
      throw new DomainException('email_invalid', 422);
    if (!memberRoles.includes(role as (typeof memberRoles)[number]))
      throw new DomainException('forbidden', 403);
    await assertWritable(this.db, userId, organizationId);
    const token = randomToken();
    try {
      const saved = await this.db.asUser(userId, async (db) => {
        await requireManager(db, organizationId);
        const taken = await db.query(
          `SELECT 1
           FROM membership m
           JOIN app_user u ON u.id = m.user_id
           WHERE m.organization_id = $1 AND u.email = $2`,
          [organizationId, normalized],
        );
        if (taken.rowCount) throw new DomainException('already_member', 422);
        const room = await db.query<{
          seat_limit: number | null;
          seats: string;
          pending: string;
        }>(
          `SELECT p.seat_limit,
                  (SELECT count(*) FROM membership WHERE organization_id = $1) AS seats,
                  (SELECT count(*) FROM invitation
                    WHERE organization_id = $1 AND email <> $2 AND accepted_at IS NULL AND expires_at > now()) AS pending
           FROM subscription s
           JOIN plan p ON p.id = s.plan_id
           WHERE s.organization_id = $1`,
          [organizationId, normalized],
        );
        const limit = room.rows[0];
        if (
          limit?.seat_limit !== null &&
          limit?.seat_limit !== undefined &&
          Number(limit.seats) + Number(limit.pending) >= limit.seat_limit
        ) {
          throw new DomainException('seat_unavailable', 422);
        }
        const updated = await db.query<{ id: string }>(
          `UPDATE invitation
           SET role = $3, token_hash = $4, expires_at = now() + interval '7 days'
           WHERE organization_id = $1 AND email = $2 AND accepted_at IS NULL
           RETURNING id`,
          [organizationId, normalized, role, sha256(token)],
        );
        if (!updated.rowCount) {
          await db.query(
            `INSERT INTO invitation (organization_id, email, role, token_hash, expires_at)
             VALUES ($1, $2, $3, $4, now() + interval '7 days')`,
            [organizationId, normalized, role, sha256(token)],
          );
        }
        return {
          email: normalized,
          role,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        };
      });
      this.mail.send({ to: normalized, purpose: 'invite', token });
      return saved;
    } catch (error) {
      if (error instanceof DomainException) throw error;
      mapDbError(error);
    }
  }

  async remove(userId: string, organizationId: string, membershipId: string) {
    try {
      await this.db.asUser(userId, async (db) => {
        await requireManager(db, organizationId);
        const removed = await db.query(
          `DELETE FROM membership
           WHERE id = $1 AND organization_id = $2 AND role <> 'owner' AND user_id <> app_current_user()`,
          [membershipId, organizationId],
        );
        if (!removed.rowCount) throw new DomainException('forbidden', 403);
      });
    } catch (error) {
      if (error instanceof DomainException) throw error;
      mapDbError(error);
    }
  }

  async accept(userId: string, token: string) {
    const raw = token.trim();
    if (!raw) throw new DomainException('token_invalid', 422);
    try {
      return await this.db.asWorker(async (db) => {
        const invite = await db.query<{
          id: string;
          organization_id: string;
          email: string;
          role: string;
        }>(
          `SELECT id, organization_id, email, role
           FROM invitation
           WHERE token_hash = $1 AND accepted_at IS NULL AND expires_at > now()`,
          [sha256(raw)],
        );
        const row = invite.rows[0];
        if (!row) throw new DomainException('token_invalid', 422);
        const person = await db.query<{
          email: string;
          email_verified_at: Date | null;
        }>('SELECT email, email_verified_at FROM app_user WHERE id = $1', [
          userId,
        ]);
        const user = person.rows[0];
        if (!user?.email_verified_at)
          throw new DomainException('email_unverified', 422);
        if (user.email !== row.email)
          throw new DomainException('forbidden', 403);
        const room = await db.query<{
          seat_limit: number | null;
          seats: string;
        }>(
          `SELECT p.seat_limit, (SELECT count(*) FROM membership WHERE organization_id = $1) AS seats
           FROM subscription s JOIN plan p ON p.id = s.plan_id
           WHERE s.organization_id = $1`,
          [row.organization_id],
        );
        const existing = await db.query(
          'SELECT id FROM membership WHERE organization_id = $1 AND user_id = $2',
          [row.organization_id, userId],
        );
        const limit = room.rows[0];
        if (
          !existing.rowCount &&
          limit?.seat_limit !== null &&
          limit?.seat_limit !== undefined &&
          Number(limit.seats) >= limit.seat_limit
        ) {
          throw new DomainException('seat_unavailable', 422);
        }
        if (!existing.rowCount) {
          await db.query(
            `INSERT INTO membership (organization_id, user_id, role) VALUES ($1, $2, $3)`,
            [row.organization_id, userId, row.role],
          );
        }
        await db.query(
          'UPDATE invitation SET accepted_at = now() WHERE id = $1 AND accepted_at IS NULL',
          [row.id],
        );
        const organization = await db.query<{ id: string; name: string }>(
          'SELECT id, name FROM organization WHERE id = $1',
          [row.organization_id],
        );
        return organization.rows[0];
      });
    } catch (error) {
      if (error instanceof DomainException) throw error;
      mapDbError(error);
    }
  }

  summary(userId: string) {
    return this.db.asUser(userId, async (db) => {
      const orgs = await db.query<{ id: string; name: string; role: string }>(
        `SELECT o.id, o.name, m.role
         FROM organization o
         JOIN membership m ON m.organization_id = o.id
         WHERE m.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
         ORDER BY o.created_at`,
      );
      const months = recentMonths(6);
      const organizations = [];
      for (const org of orgs.rows) {
        const spendVisible = org.role === 'owner' || org.role === 'admin';
        const moneyVisible =
          spendVisible || org.role === 'treasurer' || org.role === 'analyst';
        const spend = spendVisible ? await grouped(db, spendSql, org.id) : [];
        const gross = moneyVisible ? await grouped(db, grossSql, org.id) : [];
        const available = moneyVisible
          ? await grouped(db, availableSql, org.id)
          : [];
        const spendMonths = spendVisible
          ? await grouped(db, spendMonthSql, org.id)
          : [];
        const grossMonths = moneyVisible
          ? await grouped(db, grossMonthSql, org.id)
          : [];
        const currencies = new Set(
          [...spend, ...gross, ...available].map((row) => row.currency),
        );
        organizations.push({
          id: org.id,
          name: org.name,
          spendVisible,
          moneyVisible,
          totals: [...currencies].map((currency) => ({
            currency,
            spendMinor: amount(spend, currency),
            grossMinor: amount(gross, currency),
            availableMinor: amount(available, currency),
          })),
          months: months.map((month) => ({
            month,
            points: [...currencies].map((currency) => ({
              currency,
              spendMinor: amount(
                spendMonths.filter((row) => row.month === month),
                currency,
              ),
              grossMinor: amount(
                grossMonths.filter((row) => row.month === month),
                currency,
              ),
            })),
          })),
        });
      }
      return organizations;
    });
  }

  async create(userId: string, name: string, country: string) {
    const trimmed = name.trim();
    if (!trimmed) throw new DomainException('country_invalid', 422);
    if (!/^[A-Za-z]{2}$/.test(country))
      throw new DomainException('country_invalid', 422);
    return this.db.asUser(userId, async (db) => {
      const organization = await db.query<{ id: string; name: string }>(
        'INSERT INTO organization (name, country) VALUES ($1, $2) RETURNING id, name',
        [trimmed, country.toUpperCase()],
      );
      const created = organization.rows[0];
      await db.query(
        `INSERT INTO membership (organization_id, user_id, role) VALUES ($1, $2, 'owner')`,
        [created.id, userId],
      );
      await db.query(
        `INSERT INTO subscription (organization_id, plan_id, status)
         SELECT $1, id, 'internal' FROM plan WHERE code = 'fundador'`,
        [created.id],
      );
      return created;
    });
  }
}

async function requireManager(db: Queryable, organizationId: string) {
  const role = await db.query<{ role: string }>(
    'SELECT role FROM membership WHERE organization_id = $1 AND user_id = app_current_user()',
    [organizationId],
  );
  if (role.rows[0]?.role !== 'owner' && role.rows[0]?.role !== 'admin')
    throw new DomainException('forbidden', 403);
}

const spendSql = `
  SELECT btrim(currency) AS currency, '' AS month, sum(amount_minor)::text AS total
  FROM ad_spend WHERE organization_id = $1
  GROUP BY 1`;

const spendMonthSql = `
  SELECT btrim(currency) AS currency, to_char(period_start, 'YYYY-MM') AS month, sum(amount_minor)::text AS total
  FROM ad_spend
  WHERE organization_id = $1
    AND period_start >= (date_trunc('month', now() AT TIME ZONE 'UTC') - interval '5 months')::date
  GROUP BY 1, 2`;

const grossSql = `
  SELECT btrim(currency) AS currency, '' AS month, sum(amount_minor)::text AS total
  FROM campaign_ledger_entry
  WHERE organization_id = $1 AND kind = 'gross'
  GROUP BY 1`;

const grossMonthSql = `
  SELECT btrim(currency) AS currency, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM') AS month, sum(amount_minor)::text AS total
  FROM campaign_ledger_entry
  WHERE organization_id = $1 AND kind = 'gross'
    AND created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') - interval '5 months'
  GROUP BY 1, 2`;

const availableSql = `
  SELECT btrim(currency) AS currency, '' AS month, COALESCE(SUM(
    CASE kind
      WHEN 'gross' THEN amount_minor
      WHEN 'dispute_release' THEN amount_minor
      WHEN 'payout_reversal' THEN amount_minor
      WHEN 'processor_fee' THEN -amount_minor
      WHEN 'platform_fee' THEN -amount_minor
      WHEN 'refund' THEN -amount_minor
      WHEN 'dispute_hold' THEN -amount_minor
      WHEN 'payout' THEN -amount_minor
      ELSE 0
    END
  ), 0)::text AS total
  FROM campaign_ledger_entry
  WHERE organization_id = $1
  GROUP BY 1`;

function recentMonths(count: number) {
  const now = new Date();
  const months: string[] = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1),
    );
    months.push(date.toISOString().slice(0, 7));
  }
  return months;
}

async function grouped(db: Queryable, sql: string, organizationId: string) {
  const rows = await db.query<{
    currency: string;
    month: string;
    total: string;
  }>(sql, [organizationId]);
  return rows.rows.map((row) => ({
    currency: row.currency.trim(),
    month: row.month,
    total: Number(row.total),
  }));
}

function amount(rows: { currency: string; total: number }[], currency: string) {
  return rows
    .filter((row) => row.currency === currency)
    .reduce((sum, row) => sum + row.total, 0);
}
