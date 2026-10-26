import { Injectable } from '@nestjs/common';
import { ComercialService } from '../comercial/comercial.service';
import { DbService, type Queryable } from '../db/db.service';
import { LibroService } from '../libro/libro.service';
import { DomainException, mapDbError } from '../shared/domain';

@Injectable()
export class PlataformaService {
  constructor(
    private readonly db: DbService,
    private readonly libro: LibroService,
    private readonly comercial: ComercialService,
  ) {}

  async summary(userId: string, surface: string) {
    await this.requireOperator(userId, surface);
    const counts = await this.db.asWorker((db) =>
      db.query<{
        active_organizations: string;
        campaigns: string;
        stuck: string;
      }>(
        `SELECT
           (SELECT count(*) FROM organization WHERE identity_verified_at IS NOT NULL) AS active_organizations,
           (SELECT count(*) FROM campaign WHERE status <> 'archivada') AS campaigns,
           (
             (SELECT count(*) FROM donation WHERE status IN ('pendiente', 'requiere_accion'))
             + (SELECT count(*) FROM payout WHERE status = 'failed')
             + (SELECT count(*) FROM subscription WHERE status IN ('past_due', 'incomplete'))
           ) AS stuck`,
      ),
    );
    const income = await this.incomeRows();
    const row = counts.rows[0];
    return {
      activeOrganizations: Number(row.active_organizations),
      campaigns: Number(row.campaigns),
      stuckPayments: Number(row.stuck),
      income,
    };
  }

  async organizations(userId: string, surface: string) {
    await this.requireOperator(userId, surface);
    const rows = await this.db.asWorker((db) =>
      db.query<{
        id: string;
        name: string;
        country: string;
        identity_verified_at: Date | null;
        plan: string;
        subscription_status: string;
      }>(
        `SELECT o.id, o.name, o.country, o.identity_verified_at, p.code AS plan, s.status AS subscription_status
         FROM organization o
         JOIN subscription s ON s.organization_id = o.id
         JOIN plan p ON p.id = s.plan_id
         ORDER BY o.created_at DESC`,
      ),
    );
    return rows.rows.map((row) => ({
      id: row.id,
      name: row.name,
      country: row.country.trim(),
      identityVerified: Boolean(row.identity_verified_at),
      plan: row.plan,
      subscriptionStatus: row.subscription_status,
    }));
  }

  async createOrganization(
    userId: string,
    surface: string,
    name: string,
    country: string,
    ownerEmail: string,
  ) {
    await this.requireOperator(userId, surface);
    const trimmed = name.trim();
    const code = country.trim().toUpperCase();
    const email = ownerEmail.trim().toLowerCase();
    if (!trimmed || !/^[A-Z]{2}$/.test(code) || !email.includes('@'))
      throw new DomainException('not_eligible', 422);
    try {
      return await this.db.asWorker(async (db) => {
        const owner = await db.query<{
          id: string;
          email_verified_at: Date | null;
          platform_operator: boolean;
        }>(
          `SELECT id, email_verified_at, platform_operator FROM app_user WHERE lower(email) = $1`,
          [email],
        );
        const person = owner.rows[0];
        if (
          !person?.email_verified_at ||
          person.platform_operator ||
          person.id === userId
        ) {
          throw new DomainException('not_eligible', 422);
        }
        const organization = await db.query<{ id: string }>(
          `INSERT INTO organization (name, country) VALUES ($1, $2) RETURNING id`,
          [trimmed, code],
        );
        const organizationId = organization.rows[0].id;
        await db.query(
          `INSERT INTO membership (organization_id, user_id, role) VALUES ($1, $2, 'owner')`,
          [organizationId, person.id],
        );
        await db.query(
          `INSERT INTO subscription (organization_id, plan_id, status)
           SELECT $1, id, 'internal' FROM plan WHERE code = 'fundador'`,
          [organizationId],
        );
        await this.record(
          db,
          userId,
          organizationId,
          'organization.create',
          false,
        );
        return {
          id: organizationId,
          name: trimmed,
          country: code,
          identityVerified: false,
        };
      });
    } catch (error) {
      if (error instanceof DomainException) throw error;
      mapDbError(error);
    }
  }

  async enterSupport(userId: string, surface: string, organizationId: string) {
    await this.requireOperator(userId, surface);
    const visit = await this.db.asWorker(async (db) => {
      const org = await db.query<{ name: string }>(
        `SELECT name FROM organization WHERE id = $1`,
        [organizationId],
      );
      if (!org.rows[0]) throw new DomainException('not_eligible', 422);
      const action = await this.record(
        db,
        userId,
        organizationId,
        'support.enter',
        true,
      );
      await db.query(
        `INSERT INTO notification (organization_id, event_code, channel, status, idempotency_key)
         VALUES ($1, 'support.entered', 'in_app', 'queued', $2)`,
        [organizationId, `support:${action}`],
      );
      return org.rows[0].name;
    });
    return { organizationId, name: visit, supportMode: true };
  }

  async campaigns(userId: string, surface: string) {
    await this.requireOperator(userId, surface);
    const rows = await this.db.asWorker((db) =>
      db.query<{
        id: string;
        name: string;
        status: string;
        organization: string;
        currency: string;
        gross: string;
        coverage: string;
        ledger: string;
      }>(
        `SELECT c.id, c.name, c.status, o.name AS organization, c.currency,
                COALESCE(SUM(e.amount_minor) FILTER (WHERE e.kind = 'gross'), 0) AS gross,
                (SELECT count(DISTINCT sc.network_code) FROM social_connection sc
                 WHERE sc.organization_id = c.organization_id AND sc.status = 'active') AS coverage,
                count(e.id) AS ledger
         FROM campaign c
         JOIN organization o ON o.id = c.organization_id
         LEFT JOIN campaign_ledger_entry e ON e.campaign_id = c.id
         GROUP BY c.id, o.name
         ORDER BY c.created_at DESC`,
      ),
    );
    return rows.rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      organization: row.organization,
      currency: row.currency.trim(),
      grossMinor: Number(row.gross),
      coverage: Number(row.coverage),
      hasLedger: Number(row.ledger) > 0,
    }));
  }

  async pauseCampaign(userId: string, surface: string, campaignId: string) {
    await this.requireOperator(userId, surface);
    try {
      return await this.db.asWorker(async (db) => {
        const current = await db.query<{
          organization_id: string;
          status: string;
        }>(`SELECT organization_id, status FROM campaign WHERE id = $1`, [
          campaignId,
        ]);
        const campaign = current.rows[0];
        if (!campaign || campaign.status !== 'activa')
          throw new DomainException('not_eligible', 422);
        await db.query(`UPDATE campaign SET status = 'pausada' WHERE id = $1`, [
          campaignId,
        ]);
        await this.record(
          db,
          userId,
          campaign.organization_id,
          'campaign.pause',
          true,
          'campaign',
          campaignId,
        );
        return { id: campaignId, status: 'pausada' };
      });
    } catch (error) {
      if (error instanceof DomainException) throw error;
      mapDbError(error);
    }
  }

  async income(userId: string, surface: string) {
    await this.requireOperator(userId, surface);
    return this.incomeRows();
  }

  async incomeCsv(userId: string, surface: string) {
    const rows = await this.income(userId, surface);
    const lines = [
      'tipo,moneda,monto_menor',
      ...rows.flatMap((row) => [
        `suscripcion,${row.currency},${row.subscriptionsMinor}`,
        `comision,${row.currency},${row.feesMinor}`,
      ]),
    ];
    return lines.join('\n');
  }

  async payments(userId: string, surface: string) {
    await this.requireOperator(userId, surface);
    const rows = await this.db.asWorker((db) =>
      db.query<{ kind: string; id: string; detail: string }>(
        `SELECT 'donation' AS kind, id::text, status AS detail FROM donation WHERE status IN ('pendiente', 'requiere_accion')
         UNION ALL
         SELECT 'payout', id::text, status FROM payout WHERE status = 'failed'
         UNION ALL
         SELECT 'subscription', organization_id::text, status FROM subscription WHERE status IN ('past_due', 'incomplete')
         UNION ALL
         SELECT 'webhook', id::text, provider || ':' || event_id FROM webhook_event
         ORDER BY 1, 2
         LIMIT 50`,
      ),
    );
    return rows.rows.map((row) => ({
      kind: row.kind,
      id: row.id,
      detail: row.detail.trim(),
    }));
  }

  async retryWebhook(userId: string, surface: string, webhookId: string) {
    await this.requireOperator(userId, surface);
    const found = await this.db.asWorker((db) =>
      db.query<{
        provider: string;
        payload: unknown;
        organization_id: string | null;
      }>(
        `SELECT provider, payload, NULL::uuid AS organization_id FROM webhook_event WHERE id = $1`,
        [webhookId],
      ),
    );
    const event = found.rows[0];
    if (!event?.payload) throw new DomainException('not_eligible', 422);
    const payload =
      typeof event.payload === 'string'
        ? event.payload
        : JSON.stringify(event.payload);
    const result =
      event.provider === 'billing'
        ? await this.comercial.replay(payload)
        : await this.libro.replay(payload);
    await this.db.asWorker((db) =>
      this.record(
        db,
        userId,
        null,
        'webhook.retry',
        false,
        'webhook_event',
        webhookId,
      ),
    );
    return { id: webhookId, result };
  }

  async users(userId: string, surface: string, query: string) {
    await this.requireOperator(userId, surface);
    const term = query.trim().toLowerCase();
    if (term.length < 3) return [];
    const rows = await this.db.asWorker((db) =>
      db.query<{
        id: string;
        email: string;
        blocked_at: Date | null;
        memberships: string;
      }>(
        `SELECT u.id, u.email, u.blocked_at, count(m.id) AS memberships
         FROM app_user u
         LEFT JOIN membership m ON m.user_id = u.id
         WHERE lower(u.email) LIKE $1 AND u.platform_operator = false
         GROUP BY u.id
         ORDER BY u.email
         LIMIT 20`,
        [`%${term}%`],
      ),
    );
    return rows.rows.map((row) => ({
      id: row.id,
      email: row.email,
      blocked: Boolean(row.blocked_at),
      memberships: Number(row.memberships),
    }));
  }

  async blockUser(userId: string, surface: string, targetId: string) {
    await this.requireOperator(userId, surface);
    if (targetId === userId) throw new DomainException('forbidden', 403);
    const updated = await this.db.asWorker(async (db) => {
      const result = await db.query(
        `UPDATE app_user SET blocked_at = now()
         WHERE id = $1 AND platform_operator = false AND blocked_at IS NULL`,
        [targetId],
      );
      if (!result.rowCount) throw new DomainException('not_eligible', 422);
      await db.query(
        `UPDATE session SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
        [targetId],
      );
      await this.record(
        db,
        userId,
        null,
        'user.block',
        false,
        'app_user',
        targetId,
      );
      return true;
    });
    return { id: targetId, blocked: updated };
  }

  async closeSessions(userId: string, surface: string, targetId: string) {
    await this.requireOperator(userId, surface);
    if (targetId === userId) throw new DomainException('forbidden', 403);
    await this.db.asWorker(async (db) => {
      const person = await db.query(
        `SELECT id FROM app_user WHERE id = $1 AND platform_operator = false`,
        [targetId],
      );
      if (!person.rows[0]) throw new DomainException('not_eligible', 422);
      await db.query(
        `UPDATE session SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
        [targetId],
      );
      await this.record(
        db,
        userId,
        null,
        'user.sessions',
        false,
        'app_user',
        targetId,
      );
    });
    return { id: targetId, closed: true };
  }

  async removeUser(userId: string, surface: string, targetId: string) {
    await this.requireOperator(userId, surface);
    if (targetId === userId) throw new DomainException('forbidden', 403);
    return this.db.asWorker(async (db) => {
      const person = await db.query<{ memberships: string }>(
        `SELECT count(m.id) AS memberships
         FROM app_user u
         LEFT JOIN membership m ON m.user_id = u.id
         WHERE u.id = $1 AND u.platform_operator = false
         GROUP BY u.id`,
        [targetId],
      );
      if (!person.rows[0]) throw new DomainException('not_eligible', 422);
      if (Number(person.rows[0].memberships) > 0)
        throw new DomainException('membership_exists', 422);
      await db.query(
        `UPDATE app_user SET blocked_at = COALESCE(blocked_at, now()) WHERE id = $1`,
        [targetId],
      );
      await db.query(
        `UPDATE session SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
        [targetId],
      );
      await this.record(
        db,
        userId,
        null,
        'user.remove',
        false,
        'app_user',
        targetId,
      );
      return { id: targetId, removed: false, blocked: true };
    });
  }

  async supportAccess(userId: string) {
    const rows = await this.db.asUser(userId, (db) =>
      db.query<{ organization: string; created_at: Date }>(
        `SELECT o.name AS organization, a.created_at
         FROM audit_event a
         JOIN organization o ON o.id = a.organization_id
         JOIN membership m ON m.organization_id = o.id AND m.user_id = $1 AND m.role = 'owner'
         WHERE a.action = 'support.enter'
         ORDER BY a.created_at DESC
         LIMIT 10`,
        [userId],
      ),
    );
    return rows.rows.map((row) => ({
      organization: row.organization,
      enteredAt: new Date(row.created_at).toISOString(),
    }));
  }

  private async incomeRows() {
    const rows = await this.db.asWorker((db) =>
      db.query<{ currency: string; subscriptions: string; fees: string }>(
        `SELECT currency, SUM(subscriptions) AS subscriptions, SUM(fees) AS fees
         FROM (
           SELECT currency, amount_minor AS subscriptions, 0::bigint AS fees
           FROM invoice
           WHERE status = 'paid' AND paid_at >= date_trunc('month', now())
           UNION ALL
           SELECT currency, 0, amount_minor
           FROM campaign_ledger_entry
           WHERE kind = 'platform_fee' AND created_at >= date_trunc('month', now())
         ) income
         GROUP BY currency
         ORDER BY currency`,
      ),
    );
    if (!rows.rows.length)
      return [{ currency: 'USD', subscriptionsMinor: 0, feesMinor: 0 }];
    return rows.rows.map((row) => ({
      currency: row.currency.trim(),
      subscriptionsMinor: Number(row.subscriptions),
      feesMinor: Number(row.fees),
    }));
  }

  private async requireOperator(userId: string, surface: string) {
    if (surface === 'tablet')
      throw new DomainException('platform_web_only', 422);
    const row = await this.db.asWorker((db) =>
      db.query<{ platform_operator: boolean }>(
        `SELECT platform_operator FROM app_user WHERE id = $1`,
        [userId],
      ),
    );
    if (!row.rows[0]?.platform_operator)
      throw new DomainException('operator_required', 403);
  }

  private async record(
    db: Queryable,
    actorId: string,
    organizationId: string | null,
    action: string,
    supportMode: boolean,
    entity = 'organization',
    entityId: string | null = organizationId,
  ) {
    const created = await db.query(
      `INSERT INTO admin_action (actor_user_id, organization_id, action, support_mode)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [actorId, organizationId, action, supportMode],
    );
    await db.query(
      `INSERT INTO audit_event (organization_id, actor_user_id, action, entity, entity_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [organizationId, actorId, action, entity, entityId],
    );
    return String(created.rows[0].id);
  }
}
