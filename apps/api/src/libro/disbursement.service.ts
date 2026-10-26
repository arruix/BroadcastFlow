import { Injectable } from '@nestjs/common';
import { DbService, type Queryable } from '../db/db.service';
import { DomainException, mapDbError } from '../shared/domain';
import { assertStepUp } from '../shared/step-up';
import { PayoutGateway } from './payout.gateway';
import { ledgerPdf } from './pdf';

const thresholdMinor = 100_000;

type LedgerRow = {
  id: string;
  kind: string;
  amount_minor: string;
  currency: string;
  created_at: Date;
};
type PayoutRow = {
  id: string;
  amount_minor: string;
  currency: string;
  status: string;
  requested_by: string;
  approved_by: string | null;
};

export function needsSecondOwner(amountMinor: number, currency: string) {
  return currency !== 'USD' || amountMinor > thresholdMinor;
}

@Injectable()
export class DisbursementService {
  constructor(
    private readonly db: DbService,
    private readonly gateway: PayoutGateway,
  ) {}

  async verifyIdentity(
    userId: string,
    sessionId: string,
    organizationId: string,
    legalName: string,
  ) {
    const name = legalName.trim();
    if (!name || name.length > 120)
      throw new DomainException('not_eligible', 422);
    await assertStepUp(this.db, userId, sessionId);
    try {
      await this.db.asUser(userId, async (db) => {
        await requireRole(db, organizationId, userId, ['owner']);
        await db.query(
          `UPDATE organization SET legal_name = $2, identity_verified_at = now() WHERE id = $1`,
          [organizationId, name],
        );
      });
    } catch (error) {
      if (error instanceof DomainException) throw error;
      mapDbError(error);
    }
    return { legalName: name, verified: true };
  }

  async saveAccount(
    userId: string,
    sessionId: string,
    organizationId: string,
    destinationRef: string,
    currency: string,
  ) {
    const ref = destinationRef.trim();
    const code = currency.trim().toUpperCase();
    if (!/^[A-Za-z0-9]{4,64}$/.test(ref) || !/^[A-Z]{3}$/.test(code))
      throw new DomainException('not_eligible', 422);
    await assertStepUp(this.db, userId, sessionId);
    try {
      await this.db.asUser(userId, async (db) => {
        await requireRole(db, organizationId, userId, ['owner']);
        const identity = await db.query<{ identity_verified_at: Date | null }>(
          `SELECT identity_verified_at FROM organization WHERE id = $1`,
          [organizationId],
        );
        if (!identity.rows[0]?.identity_verified_at)
          throw new DomainException('identity_unverified', 422);
        await db.query(
          `INSERT INTO payout_account (organization_id, destination_ref, currency, verified_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (organization_id) DO UPDATE
           SET destination_ref = EXCLUDED.destination_ref, currency = EXCLUDED.currency, verified_at = now()`,
          [organizationId, ref, code],
        );
      });
    } catch (error) {
      if (error instanceof DomainException) throw error;
      mapDbError(error);
    }
    return { destinationRef: ref, currency: code };
  }

  async addOwner(
    userId: string,
    sessionId: string,
    organizationId: string,
    email: string,
  ) {
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes('@'))
      throw new DomainException('not_eligible', 422);
    await assertStepUp(this.db, userId, sessionId);
    try {
      await this.db.asUser(userId, async (db) => {
        await requireRole(db, organizationId, userId, ['owner']);
        const person = await db.query<{
          id: string;
          email_verified_at: Date | null;
        }>(
          `SELECT id, email_verified_at FROM app_user WHERE lower(email) = $1`,
          [normalized],
        );
        const next = person.rows[0];
        if (!next) throw new DomainException('not_eligible', 422);
        if (!next.email_verified_at)
          throw new DomainException('email_unverified', 422);
        if (next.id === userId) throw new DomainException('not_eligible', 422);
        const existing = await db.query(
          `SELECT id FROM membership WHERE organization_id = $1 AND user_id = $2`,
          [organizationId, next.id],
        );
        if (existing.rows[0]) throw new DomainException('not_eligible', 422);
        await db.query(
          `INSERT INTO membership (organization_id, user_id, role) VALUES ($1, $2, 'owner')`,
          [organizationId, next.id],
        );
      });
    } catch (error) {
      if (error instanceof DomainException) throw error;
      mapDbError(error);
    }
    return { email: normalized, role: 'owner' };
  }

  async ledger(userId: string, organizationId: string, campaignId: string) {
    return this.db.asUser(userId, async (db) => {
      await requireRole(db, organizationId, userId, [
        'owner',
        'admin',
        'treasurer',
        'analyst',
      ]);
      return this.readBook(db, organizationId, campaignId);
    });
  }

  async disputes(userId: string, organizationId: string, campaignId: string) {
    return this.db.asUser(userId, async (db) => {
      await requireRole(db, organizationId, userId, [
        'owner',
        'treasurer',
        'analyst',
      ]);
      const campaign = await db.query(
        `SELECT id FROM campaign WHERE id = $1 AND organization_id = $2`,
        [campaignId, organizationId],
      );
      if (!campaign.rows[0]) throw new DomainException('forbidden', 403);
      const rows = await db.query<{
        id: string;
        gross_minor: string;
        net_minor: string;
        currency: string;
        status: string;
        opened_at: Date;
      }>(
        `SELECT d.id, d.gross_minor, d.net_minor, d.currency, d.status, min(h.created_at) AS opened_at
         FROM donation d
         JOIN campaign_ledger_entry h ON h.donation_id = d.id AND h.kind = 'dispute_hold'
         WHERE d.campaign_id = $1 AND d.organization_id = $2 AND d.status = 'disputada'
         GROUP BY d.id`,
        [campaignId, organizationId],
      );
      return rows.rows.map((row) => {
        const openedAt = new Date(row.opened_at);
        return {
          donationId: row.id,
          grossMinor: Number(row.gross_minor),
          netMinor: Number(row.net_minor),
          currency: row.currency.trim(),
          status: row.status,
          openedAt: openedAt.toISOString(),
          dueAt: new Date(
            openedAt.getTime() + 7 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        };
      });
    });
  }

  async requestPayout(
    userId: string,
    sessionId: string,
    organizationId: string,
    campaignId: string,
    amountMinor: number,
  ) {
    if (!Number.isInteger(amountMinor) || amountMinor <= 0)
      throw new DomainException('not_eligible', 422);
    await assertStepUp(this.db, userId, sessionId);
    try {
      return await this.db.asWorker(async (db) => {
        await requireRole(db, organizationId, userId, ['owner', 'treasurer']);
        await db.query(
          `SELECT id FROM campaign WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
          [campaignId, organizationId],
        );
        const ready = await this.readyToSend(
          db,
          organizationId,
          campaignId,
          amountMinor,
        );
        const reserved = await reservedMinor(db, campaignId);
        if (ready.available - reserved < amountMinor)
          throw new DomainException('payout_unavailable', 422);
        const created = await db.query<{ id: string }>(
          `INSERT INTO payout (organization_id, campaign_id, amount_minor, currency, status, destination_ref, requested_by)
           VALUES ($1, $2, $3, $4, 'requested', $5, $6)
           RETURNING id`,
          [
            organizationId,
            campaignId,
            amountMinor,
            ready.currency,
            ready.destinationRef,
            userId,
          ],
        );
        if (!needsSecondOwner(amountMinor, ready.currency)) {
          return this.settle(db, created.rows[0].id, null);
        }
        return {
          id: created.rows[0].id,
          status: 'requested',
          amountMinor,
          currency: ready.currency,
        };
      });
    } catch (error) {
      if (error instanceof DomainException) throw error;
      mapDbError(error);
    }
  }

  async approve(
    userId: string,
    sessionId: string,
    organizationId: string,
    payoutId: string,
  ) {
    await assertStepUp(this.db, userId, sessionId);
    try {
      return await this.db.asWorker(async (db) => {
        await requireRole(db, organizationId, userId, ['owner']);
        const payout = await db.query<{
          id: string;
          campaign_id: string;
          amount_minor: string;
          currency: string;
          status: string;
          requested_by: string;
        }>(
          `SELECT id, campaign_id, amount_minor, currency, status, requested_by
           FROM payout WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
          [payoutId, organizationId],
        );
        const row = payout.rows[0];
        if (!row || row.status !== 'requested')
          throw new DomainException('not_eligible', 422);
        if (row.requested_by === userId)
          throw new DomainException('approval_invalid', 422);
        const amount = Number(row.amount_minor);
        await this.readyToSend(db, organizationId, row.campaign_id, amount);
        await db.query(`SELECT id FROM campaign WHERE id = $1 FOR UPDATE`, [
          row.campaign_id,
        ]);
        const reserved = await reservedMinor(db, row.campaign_id, row.id);
        const available = await availableMinor(db, row.campaign_id);
        if (available - reserved < amount)
          throw new DomainException('payout_unavailable', 422);
        return this.settle(db, row.id, userId);
      });
    } catch (error) {
      if (error instanceof DomainException) throw error;
      mapDbError(error);
    }
  }

  async requestReport(
    userId: string,
    organizationId: string,
    campaignId: string,
    surface: string,
  ) {
    const where = surface === 'tablet' ? 'tablet' : 'web';
    try {
      const created = await this.db.asUser(userId, async (db) => {
        await requireRole(db, organizationId, userId, [
          'owner',
          'treasurer',
          'analyst',
        ]);
        const campaign = await db.query(
          `SELECT id FROM campaign WHERE id = $1 AND organization_id = $2`,
          [campaignId, organizationId],
        );
        if (!campaign.rows[0]) throw new DomainException('forbidden', 403);
        return db.query<{ id: string }>(
          `INSERT INTO report_job (organization_id, requested_by, surface, kind, status, filters, object_key, provisional)
           VALUES ($1, $2, $3, 'ledger', 'ready', $4::jsonb, $5, false)
           RETURNING id`,
          [
            organizationId,
            userId,
            where,
            JSON.stringify({ campaignId }),
            `reports/${campaignId}.pdf`,
          ],
        );
      });
      return { id: created.rows[0].id, status: 'ready' };
    } catch (error) {
      if (error instanceof DomainException) throw error;
      mapDbError(error);
    }
  }

  async pdf(userId: string, organizationId: string, reportId: string) {
    const job = await this.db.asUser(userId, async (db) => {
      await requireRole(db, organizationId, userId, [
        'owner',
        'treasurer',
        'analyst',
      ]);
      const found = await db.query<{
        filters: { campaignId?: string };
        status: string;
      }>(
        `SELECT filters, status FROM report_job WHERE id = $1 AND organization_id = $2`,
        [reportId, organizationId],
      );
      return found.rows[0];
    });
    if (!job || job.status !== 'ready' || !job.filters.campaignId)
      throw new DomainException('not_eligible', 422);
    const book = await this.ledger(
      userId,
      organizationId,
      job.filters.campaignId,
    );
    const open = await this.disputes(
      userId,
      organizationId,
      job.filters.campaignId,
    );
    const lines = [
      `Libro ${book.campaignName}`,
      `Disponible ${book.availableMinor} ${book.currency}`,
      ...book.entries.map(
        (entry) => `${entry.kind} ${entry.amountMinor} ${entry.currency}`,
      ),
      ...open.map(
        (row) => `disputa ${row.donationId} ${row.status} vence ${row.dueAt}`,
      ),
    ];
    return ledgerPdf(lines.slice(0, 40));
  }

  private async readyToSend(
    db: Queryable,
    organizationId: string,
    campaignId: string,
    amountMinor: number,
  ) {
    const identity = await db.query<{ identity_verified_at: Date | null }>(
      `SELECT identity_verified_at FROM organization WHERE id = $1`,
      [organizationId],
    );
    if (!identity.rows[0]?.identity_verified_at)
      throw new DomainException('identity_unverified', 422);
    const account = await db.query<{
      destination_ref: string;
      currency: string;
    }>(
      `SELECT destination_ref, currency FROM payout_account WHERE organization_id = $1`,
      [organizationId],
    );
    if (!account.rows[0]) throw new DomainException('payout_unavailable', 422);
    const campaign = await db.query<{ currency: string; name: string }>(
      `SELECT currency, name FROM campaign WHERE id = $1 AND organization_id = $2`,
      [campaignId, organizationId],
    );
    if (!campaign.rows[0]) throw new DomainException('forbidden', 403);
    const currency = campaign.rows[0].currency.trim();
    if (account.rows[0].currency.trim() !== currency)
      throw new DomainException('payout_unavailable', 422);
    if (!(await reconciled(db, campaignId)))
      throw new DomainException('unbalanced', 422);
    const available = await availableMinor(db, campaignId);
    if (available < amountMinor)
      throw new DomainException('payout_unavailable', 422);
    return {
      currency,
      destinationRef: account.rows[0].destination_ref,
      available,
      name: campaign.rows[0].name,
    };
  }

  private async settle(
    db: Queryable,
    payoutId: string,
    approvedBy: string | null,
  ) {
    const payout = await db.query<{
      id: string;
      organization_id: string;
      campaign_id: string;
      amount_minor: string;
      currency: string;
    }>(
      `SELECT id, organization_id, campaign_id, amount_minor, currency FROM payout WHERE id = $1`,
      [payoutId],
    );
    const row = payout.rows[0];
    const outcome = this.gateway.send(row.id);
    const status = outcome === 'ok' ? 'sent' : 'failed';
    await db.query(
      `UPDATE payout SET status = $2, approved_by = COALESCE($3, approved_by) WHERE id = $1`,
      [row.id, status, approvedBy],
    );
    await db.query(
      `INSERT INTO campaign_ledger_entry (organization_id, campaign_id, payout_id, kind, amount_minor, currency)
       VALUES ($1, $2, $3, 'payout', $4, $5)`,
      [
        row.organization_id,
        row.campaign_id,
        row.id,
        row.amount_minor,
        row.currency,
      ],
    );
    if (status === 'failed') {
      await db.query(
        `INSERT INTO campaign_ledger_entry (organization_id, campaign_id, payout_id, kind, amount_minor, currency)
         VALUES ($1, $2, $3, 'payout_reversal', $4, $5)`,
        [
          row.organization_id,
          row.campaign_id,
          row.id,
          row.amount_minor,
          row.currency,
        ],
      );
    }
    return {
      id: row.id,
      status,
      amountMinor: Number(row.amount_minor),
      currency: row.currency.trim(),
    };
  }

  private async readBook(
    db: Queryable,
    organizationId: string,
    campaignId: string,
  ) {
    const campaign = await db.query<{ name: string; currency: string }>(
      `SELECT name, currency FROM campaign WHERE id = $1 AND organization_id = $2`,
      [campaignId, organizationId],
    );
    if (!campaign.rows[0]) throw new DomainException('forbidden', 403);
    const identity = await db.query<{
      legal_name: string | null;
      identity_verified_at: Date | null;
    }>(
      `SELECT legal_name, identity_verified_at FROM organization WHERE id = $1`,
      [organizationId],
    );
    const account = await db.query<{
      destination_ref: string;
      currency: string;
    }>(
      `SELECT destination_ref, currency FROM payout_account WHERE organization_id = $1`,
      [organizationId],
    );
    const entries = await db.query<LedgerRow>(
      `SELECT id, kind, amount_minor, currency, created_at
       FROM campaign_ledger_entry WHERE campaign_id = $1
       ORDER BY created_at DESC LIMIT 40`,
      [campaignId],
    );
    const payouts = await db.query<PayoutRow>(
      `SELECT id, amount_minor, currency, status, requested_by, approved_by
       FROM payout WHERE campaign_id = $1 ORDER BY created_at DESC`,
      [campaignId],
    );
    return {
      campaignName: campaign.rows[0].name,
      currency: campaign.rows[0].currency.trim(),
      availableMinor: await availableMinor(db, campaignId),
      identityVerified: Boolean(identity.rows[0]?.identity_verified_at),
      legalName: identity.rows[0]?.legal_name ?? null,
      account: account.rows[0]
        ? {
            destinationRef: account.rows[0].destination_ref,
            currency: account.rows[0].currency.trim(),
          }
        : null,
      entries: entries.rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        amountMinor: Number(row.amount_minor),
        currency: row.currency.trim(),
        createdAt: new Date(row.created_at).toISOString(),
      })),
      payouts: payouts.rows.map((row) => ({
        id: row.id,
        amountMinor: Number(row.amount_minor),
        currency: row.currency.trim(),
        status: row.status,
        requestedBy: row.requested_by,
        approvedBy: row.approved_by,
      })),
    };
  }
}

async function requireRole(
  db: Queryable,
  organizationId: string,
  userId: string,
  allowed: string[],
) {
  if (!/^[0-9a-f-]{36}$/i.test(organizationId))
    throw new DomainException('forbidden', 403);
  const found = await db.query<{ role: string }>(
    `SELECT role FROM membership WHERE organization_id = $1 AND user_id = $2`,
    [organizationId, userId],
  );
  if (!found.rows.some((row) => allowed.includes(row.role)))
    throw new DomainException('forbidden', 403);
}

async function availableMinor(db: Queryable, campaignId: string) {
  const row = await db.query<{ available: string }>(
    `SELECT COALESCE(SUM(
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
     ), 0) AS available
     FROM campaign_ledger_entry WHERE campaign_id = $1`,
    [campaignId],
  );
  return Number(row.rows[0].available);
}

async function reservedMinor(
  db: Queryable,
  campaignId: string,
  exceptId?: string,
) {
  const row = await db.query<{ reserved: string }>(
    `SELECT COALESCE(SUM(amount_minor), 0) AS reserved
     FROM payout WHERE campaign_id = $1 AND status = 'requested' AND id IS DISTINCT FROM $2`,
    [campaignId, exceptId ?? null],
  );
  return Number(row.rows[0].reserved);
}

async function reconciled(db: Queryable, campaignId: string) {
  const donations = await db.query<{ net: string }>(
    `SELECT COALESCE(SUM(net_minor), 0) AS net
     FROM donation WHERE campaign_id = $1 AND status IN ('liquidada', 'disputada', 'reembolsada')`,
    [campaignId],
  );
  const ledger = await db.query<{ net: string }>(
    `SELECT COALESCE(SUM(
       CASE kind
         WHEN 'gross' THEN amount_minor
         WHEN 'processor_fee' THEN -amount_minor
         WHEN 'platform_fee' THEN -amount_minor
         ELSE 0
       END
     ), 0) AS net
     FROM campaign_ledger_entry WHERE campaign_id = $1`,
    [campaignId],
  );
  return Number(donations.rows[0].net) === Number(ledger.rows[0].net);
}
