import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DbService } from '../db/db.service';
import { billingSignatureOk, signBillingWebhook } from '../shared/crypto';
import { DomainException, mapDbError } from '../shared/domain';
import { assertStepUp } from '../shared/step-up';
import { CfdiGateway } from './cfdi.gateway';

type BillingNotice = { id?: string; outcome?: string; invoiceId?: string };

@Injectable()
export class ComercialService {
  constructor(
    private readonly db: DbService,
    private readonly cfdi: CfdiGateway,
  ) {}

  async plans() {
    const rows = await this.db.asWorker((db) =>
      db.query<{
        code: string;
        price_minor: string;
        currency: string;
        live_minutes_included: number;
        campaign_limit: number | null;
        connection_limit: number | null;
        platform_fee_bps: number;
      }>(
        `SELECT code, price_minor, currency, live_minutes_included, campaign_limit, connection_limit, platform_fee_bps
         FROM plan WHERE interval_unit <> 'internal' ORDER BY price_minor`,
      ),
    );
    return rows.rows.map((row) => ({
      code: row.code,
      priceMinor: Number(row.price_minor),
      currency: row.currency.trim(),
      liveMinutesIncluded: row.live_minutes_included,
      campaignLimit: row.campaign_limit,
      connectionLimit: row.connection_limit,
      platformFeeBps: row.platform_fee_bps,
    }));
  }

  async current(userId: string, organizationId: string) {
    await this.requireOwner(userId, organizationId, true);
    return this.readSubscription(organizationId);
  }

  async checkout(
    userId: string,
    organizationId: string,
    plan: string | undefined,
    sessionId: string,
  ) {
    await this.requireOwner(userId, organizationId, false);
    if (plan !== 'campana') throw new DomainException('plan_unavailable', 422);
    const disbursed = await this.db.asUser(userId, (db) =>
      db.query(`SELECT 1 FROM payout WHERE organization_id = $1 LIMIT 1`, [
        organizationId,
      ]),
    );
    if (disbursed.rows[0]) await assertStepUp(this.db, userId, sessionId);
    const invoiceId = await this.db.asWorker(async (db) => {
      const open = await db.query<{ id: string }>(
        `SELECT id FROM invoice WHERE organization_id = $1 AND status = 'open' ORDER BY id DESC LIMIT 1`,
        [organizationId],
      );
      if (open.rows[0]) return open.rows[0].id;
      const created = await db.query<{ id: string }>(
        `INSERT INTO invoice (organization_id, subscription_id, amount_minor, currency, status, cfdi_status)
         SELECT $1, s.id, p.price_minor, p.currency, 'open', 'not_required'
         FROM subscription s
         JOIN plan p ON p.code = 'campana'
         WHERE s.organization_id = $1
         RETURNING id`,
        [organizationId],
      );
      if (!created.rowCount) throw new DomainException('forbidden', 403);
      return created.rows[0].id;
    });
    const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
    return {
      invoiceId,
      checkoutUrl: `${origin}/plan/pago?invoice=${invoiceId}`,
    };
  }

  async devResult(
    userId: string,
    organizationId: string,
    invoiceId: string | undefined,
    outcome: string | undefined,
  ) {
    if (process.env.NODE_ENV === 'production') throw new NotFoundException();
    await this.requireOwner(userId, organizationId, false);
    if (!invoiceId || (outcome !== 'paid' && outcome !== 'failed'))
      throw new DomainException('plan_unavailable', 422);
    const owned = await this.db.asWorker((db) =>
      db.query('SELECT 1 FROM invoice WHERE id = $1 AND organization_id = $2', [
        invoiceId,
        organizationId,
      ]),
    );
    if (!owned.rowCount) throw new DomainException('forbidden', 403);
    const payload = JSON.stringify({
      id: `dev-${invoiceId}-${outcome}-${Date.now()}`,
      outcome,
      invoiceId,
    });
    await this.settle(Buffer.from(payload), signBillingWebhook(payload));
    return this.readSubscription(organizationId);
  }

  async cancel(userId: string, organizationId: string) {
    await this.requireOwner(userId, organizationId, false);
    await this.db.asUser(userId, (db) =>
      db.query(
        `UPDATE subscription SET cancel_at_period_end = true
         WHERE organization_id = $1 AND status = 'active'`,
        [organizationId],
      ),
    );
    return this.readSubscription(organizationId);
  }

  async downgrade(userId: string, organizationId: string) {
    await this.requireOwner(userId, organizationId, false);
    await this.db.asUser(userId, async (db) => {
      const usage = await db.query<{
        campaigns: string;
        connections: string;
        campaign_limit: number;
        connection_limit: number | null;
      }>(
        `SELECT
           (SELECT count(*) FROM campaign WHERE organization_id = $1 AND status <> 'archivada') AS campaigns,
           (SELECT count(*) FROM social_connection WHERE organization_id = $1) AS connections,
           p.campaign_limit, p.connection_limit
         FROM plan p WHERE p.code = 'fundador'`,
        [organizationId],
      );
      const row = usage.rows[0];
      const fitsCampaigns =
        row.campaign_limit === null ||
        Number(row.campaigns) <= row.campaign_limit;
      const fitsConnections =
        row.connection_limit === null ||
        Number(row.connections) <= row.connection_limit;
      if (fitsCampaigns && fitsConnections) {
        await db.query(
          `UPDATE subscription
           SET plan_id = (SELECT id FROM plan WHERE code = 'fundador'),
               status = 'internal', pending_plan_id = NULL, cancel_at_period_end = false, current_period_end = NULL
           WHERE organization_id = $1`,
          [organizationId],
        );
        return;
      }
      await db.query(
        `UPDATE subscription SET pending_plan_id = (SELECT id FROM plan WHERE code = 'fundador')
         WHERE organization_id = $1`,
        [organizationId],
      );
    });
    return this.readSubscription(organizationId);
  }

  async settle(
    rawBody: Buffer | undefined,
    signature: string | undefined,
    replay = false,
  ) {
    const payload = rawBody?.toString('utf8') ?? '';
    if (!replay && !billingSignatureOk(payload, signature))
      throw new BadRequestException({ code: 'invalid_signature' });
    let notice: BillingNotice;
    try {
      notice = JSON.parse(payload) as BillingNotice;
    } catch {
      throw new BadRequestException({ code: 'invalid_signature' });
    }
    if (
      !notice.id ||
      !notice.invoiceId ||
      (notice.outcome !== 'paid' && notice.outcome !== 'failed')
    ) {
      throw new DomainException('not_eligible', 422);
    }
    let stamp: string | null = null;
    try {
      stamp = await this.db.asWorker(async (db) => {
        if (replay) {
          await db.query(
            `INSERT INTO webhook_event (provider, event_id, payload) VALUES ('billing', $1, $2::jsonb)
             ON CONFLICT (provider, event_id) DO NOTHING`,
            [notice.id, payload],
          );
        } else {
          await db.query(
            `INSERT INTO webhook_event (provider, event_id, payload) VALUES ('billing', $1, $2::jsonb)`,
            [notice.id, payload],
          );
        }
        const found = await db.query<{
          id: string;
          organization_id: string;
          status: string;
          subscription_id: string;
          sub_status: string;
        }>(
          `SELECT i.id, i.organization_id, i.status, i.subscription_id, s.status AS sub_status
           FROM invoice i
           JOIN subscription s ON s.id = i.subscription_id
           WHERE i.id = $1`,
          [notice.invoiceId],
        );
        const invoice = found.rows[0];
        if (!invoice) throw new DomainException('not_eligible', 422);
        if (notice.outcome === 'failed') {
          const next =
            invoice.sub_status === 'active' || invoice.sub_status === 'past_due'
              ? 'past_due'
              : 'incomplete';
          await db.query('UPDATE subscription SET status = $2 WHERE id = $1', [
            invoice.subscription_id,
            next,
          ]);
          return null;
        }
        if (invoice.status === 'paid') return null;
        await db.query(
          `UPDATE invoice SET status = 'paid', paid_at = now(), cfdi_status = 'pending' WHERE id = $1`,
          [invoice.id],
        );
        await db.query(
          `UPDATE subscription
           SET plan_id = (SELECT id FROM plan WHERE code = 'campana'),
               status = 'active',
               current_period_end = now() + interval '1 month',
               cancel_at_period_end = false
           WHERE id = $1`,
          [invoice.subscription_id],
        );
        await db.query(
          `INSERT INTO outbox_event (organization_id, event_code, payload) VALUES ($1, 'billing.cfdi', $2::jsonb)`,
          [invoice.organization_id, JSON.stringify({ invoiceId: invoice.id })],
        );
        return invoice.id;
      });
    } catch (error) {
      if (error instanceof DomainException) throw error;
      const constraint = (error as { constraint?: string }).constraint;
      if (constraint === 'webhook_event_provider_event_id_key') return;
      mapDbError(error);
    }
    if (stamp) await this.stampInvoice(stamp);
  }

  async replay(payload: string): Promise<'applied' | 'already_applied'> {
    let notice: BillingNotice;
    try {
      notice = JSON.parse(payload) as BillingNotice;
    } catch {
      throw new DomainException('not_eligible', 422);
    }
    if (!notice.invoiceId) throw new DomainException('not_eligible', 422);
    const invoice = await this.db.asWorker((db) =>
      db.query<{ status: string }>(`SELECT status FROM invoice WHERE id = $1`, [
        notice.invoiceId,
      ]),
    );
    if (!invoice.rows[0]) throw new DomainException('not_eligible', 422);
    if (invoice.rows[0].status === 'paid' && notice.outcome === 'paid')
      return 'already_applied';
    await this.settle(Buffer.from(payload), undefined, true);
    return 'applied';
  }

  async retryCfdi(userId: string, organizationId: string, invoiceId: string) {
    await this.requireOwner(userId, organizationId, false);
    const owned = await this.db.asWorker((db) =>
      db.query(
        "SELECT 1 FROM invoice WHERE id = $1 AND organization_id = $2 AND status = 'paid'",
        [invoiceId, organizationId],
      ),
    );
    if (!owned.rowCount) throw new DomainException('forbidden', 403);
    await this.stampInvoice(invoiceId);
    return this.readSubscription(organizationId);
  }

  private async stampInvoice(invoiceId: string) {
    const current = await this.db.asWorker((db) =>
      db.query<{ cfdi_uuid: string | null }>(
        `SELECT cfdi_uuid FROM invoice WHERE id = $1`,
        [invoiceId],
      ),
    );
    if (current.rows[0]?.cfdi_uuid) return;
    const stamped = this.cfdi.stamp(invoiceId);
    if (stamped === 'rejected') {
      await this.db.asWorker((db) =>
        db.query(
          `UPDATE invoice SET cfdi_status = 'failed' WHERE id = $1 AND cfdi_uuid IS NULL`,
          [invoiceId],
        ),
      );
      return;
    }
    await this.db.asWorker((db) =>
      db.query(
        `UPDATE invoice SET cfdi_status = 'stamped', cfdi_uuid = $2 WHERE id = $1 AND cfdi_uuid IS NULL`,
        [invoiceId, stamped],
      ),
    );
  }

  private async readSubscription(organizationId: string) {
    const found = await this.db.asWorker((db) =>
      db.query<{
        code: string;
        status: string;
        live_minutes_included: number;
        current_period_end: Date | null;
        cancel_at_period_end: boolean;
        pending_code: string | null;
        invoice_id: string | null;
        invoice_status: string | null;
        cfdi_status: string | null;
        cfdi_uuid: string | null;
      }>(
        `SELECT p.code, s.status, p.live_minutes_included, s.current_period_end, s.cancel_at_period_end,
                pending.code AS pending_code,
                i.id AS invoice_id, i.status AS invoice_status, i.cfdi_status, i.cfdi_uuid
         FROM subscription s
         JOIN plan p ON p.id = s.plan_id
         LEFT JOIN plan pending ON pending.id = s.pending_plan_id
         LEFT JOIN invoice i ON i.id = (
           SELECT id FROM invoice WHERE organization_id = s.organization_id ORDER BY paid_at DESC NULLS LAST, id DESC LIMIT 1
         )
         WHERE s.organization_id = $1`,
        [organizationId],
      ),
    );
    const row = found.rows[0];
    if (!row) throw new DomainException('forbidden', 403);
    return {
      plan: row.code,
      status: row.status,
      liveMinutesIncluded: row.live_minutes_included,
      currentPeriodEnd: row.current_period_end?.toISOString() ?? null,
      cancelAtPeriodEnd: row.cancel_at_period_end,
      pendingPlan: row.pending_code,
      invoice: row.invoice_id
        ? {
            id: row.invoice_id,
            status: row.invoice_status,
            cfdiStatus: row.cfdi_status,
            cfdiUuid: row.cfdi_uuid,
          }
        : null,
    };
  }

  private async requireOwner(
    userId: string,
    organizationId: string,
    allowRead: boolean,
  ) {
    if (!/^[0-9a-f-]{36}$/i.test(organizationId))
      throw new DomainException('forbidden', 403);
    const found = await this.db.asUser(userId, (db) =>
      db.query<{ role: string }>(
        'SELECT role FROM membership WHERE organization_id = $1 AND user_id = $2',
        [organizationId, userId],
      ),
    );
    const role = found.rows[0]?.role ?? '';
    const allowed = allowRead ? ['owner', 'admin'] : ['owner'];
    if (!allowed.includes(role)) throw new DomainException('forbidden', 403);
  }
}
