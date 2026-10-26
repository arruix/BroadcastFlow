import { BadRequestException, Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { MailService } from '../mail/mail.service';
import { BoardBus } from '../medicion/board.bus';
import { webhookSignatureOk } from '../shared/crypto';
import { DomainException, mapDbError } from '../shared/domain';

type GatewayNotice = {
  id?: string;
  type?: 'paid' | 'dispute_opened' | 'dispute_won' | 'dispute_lost';
  donationId?: string;
  grossMinor?: number;
  netMinor?: number;
  processorFeeMinor?: number;
  platformFeeMinor?: number;
  currency?: string;
};

const fiscalText = 'Este recibo no es un comprobante fiscal deducible.';

@Injectable()
export class LibroService {
  constructor(
    private readonly db: DbService,
    private readonly mail: MailService,
    private readonly bus: BoardBus,
  ) {}

  async settle(
    rawBody: Buffer | undefined,
    signature: string | undefined,
    replay = false,
  ) {
    const payload = rawBody?.toString('utf8') ?? '';
    if (!replay && !webhookSignatureOk(payload, signature))
      throw new BadRequestException({ code: 'invalid_signature' });
    let notice: GatewayNotice;
    try {
      notice = JSON.parse(payload) as GatewayNotice;
    } catch {
      throw new BadRequestException({ code: 'invalid_signature' });
    }
    if (!notice.id || !notice.donationId)
      throw new DomainException('not_eligible', 422);
    let receipt:
      | {
          id: string;
          to: string;
          organizationId: string;
          campaignId: string;
          countedDonation: boolean;
        }
      | undefined;
    try {
      receipt = await this.db.asWorker(async (db) => {
        if (replay) {
          await db.query(
            `INSERT INTO webhook_event (provider, event_id, payload) VALUES ($1, $2, $3::jsonb)
             ON CONFLICT (provider, event_id) DO NOTHING`,
            ['donations', notice.id, payload],
          );
        } else {
          await db.query(
            'INSERT INTO webhook_event (provider, event_id, payload) VALUES ($1, $2, $3::jsonb)',
            ['donations', notice.id, payload],
          );
        }
        if (
          notice.type === 'dispute_opened' ||
          notice.type === 'dispute_won' ||
          notice.type === 'dispute_lost'
        ) {
          await applyDispute(db, notice.donationId ?? '', notice.type);
          return undefined;
        }
        const found = await db.query<{
          id: string;
          organization_id: string;
          campaign_id: string;
          status: string;
          gross_minor: string;
          net_minor: string;
          processor_fee_minor: string;
          platform_fee_minor: string;
          currency: string;
          donor_email: string | null;
          visit_anonymous_id: string | null;
        }>(
          `SELECT id, organization_id, campaign_id, status, gross_minor, net_minor, processor_fee_minor,
                  platform_fee_minor, currency, donor_email, visit_anonymous_id
           FROM donation WHERE id = $1`,
          [notice.donationId],
        );
        const donation = found.rows[0];
        if (!donation) throw new DomainException('not_eligible', 422);
        const same =
          Number(donation.gross_minor) === notice.grossMinor &&
          Number(donation.net_minor) === notice.netMinor &&
          Number(donation.processor_fee_minor) === notice.processorFeeMinor &&
          Number(donation.platform_fee_minor) === notice.platformFeeMinor &&
          donation.currency.trim() ===
            (notice.currency ?? '').trim().toUpperCase();
        if (!same) throw new DomainException('unbalanced', 422);
        if (donation.status !== 'pendiente') return undefined;
        await db.query(
          `UPDATE donation SET status = 'liquidada', provider_payment_id = $2 WHERE id = $1`,
          [donation.id, notice.id],
        );
        const entries = [
          ['gross', Number(donation.gross_minor)],
          ['processor_fee', Number(donation.processor_fee_minor)],
          ['platform_fee', Number(donation.platform_fee_minor)],
        ].filter((entry) => Number(entry[1]) > 0);
        for (const [kind, amount] of entries) {
          await db.query(
            `INSERT INTO campaign_ledger_entry (organization_id, campaign_id, donation_id, kind, amount_minor, currency)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              donation.organization_id,
              donation.campaign_id,
              donation.id,
              kind,
              amount,
              donation.currency,
            ],
          );
        }
        const queued = await db.query<{ id: string }>(
          `INSERT INTO outbox_event (organization_id, event_code, payload)
           VALUES ($1, 'donation.receipt', $2::jsonb)
           RETURNING id`,
          [
            donation.organization_id,
            JSON.stringify({
              donationId: donation.id,
              to: donation.donor_email,
              grossMinor: Number(donation.gross_minor),
              netMinor: Number(donation.net_minor),
              processorFeeMinor: Number(donation.processor_fee_minor),
              platformFeeMinor: Number(donation.platform_fee_minor),
              currency: donation.currency.trim(),
              text: fiscalText,
            }),
          ],
        );
        await db.query(
          `INSERT INTO outbox_event (organization_id, event_code, payload) VALUES ($1, 'donation.settled', $2::jsonb)`,
          [
            donation.organization_id,
            JSON.stringify({ donationId: donation.id }),
          ],
        );
        let countedDonation = false;
        if (donation.visit_anonymous_id) {
          const origin = await db.query<{ origin: string }>(
            `SELECT origin FROM visit_event
             WHERE campaign_id = $1 AND anonymous_id = $2 AND counted
             ORDER BY occurred_at DESC LIMIT 1`,
            [donation.campaign_id, donation.visit_anonymous_id],
          );
          if (origin.rows[0]) {
            await db.query(
              `INSERT INTO metric_bucket (organization_id, campaign_id, origin, bucket_start, event_type, event_count)
               VALUES ($1, $2, $3, date_trunc('hour', now()), 'donation', 1)
               ON CONFLICT (campaign_id, origin, bucket_start, event_type)
               DO UPDATE SET event_count = metric_bucket.event_count + 1`,
              [
                donation.organization_id,
                donation.campaign_id,
                origin.rows[0].origin,
              ],
            );
            countedDonation = true;
          }
        }
        return {
          id: queued.rows[0].id,
          to: donation.donor_email ?? '',
          organizationId: donation.organization_id,
          campaignId: donation.campaign_id,
          countedDonation,
        };
      });
    } catch (error) {
      if (error instanceof DomainException) throw error;
      const constraint = (error as { constraint?: string }).constraint;
      if (constraint === 'webhook_event_provider_event_id_key') return;
      mapDbError(error);
    }
    if (receipt?.countedDonation) {
      this.bus.publish(receipt.organizationId, {
        name: 'visit.counted',
        campaignId: receipt.campaignId,
      });
    }
    if (!receipt?.to) return;
    this.mail.send({
      to: receipt.to,
      purpose: 'receipt',
      token: notice.donationId ?? '',
    });
    await this.db.asWorker((db) =>
      db.query('UPDATE outbox_event SET published_at = now() WHERE id = $1', [
        receipt.id,
      ]),
    );
  }

  async replay(payload: string): Promise<'applied' | 'already_applied'> {
    let notice: GatewayNotice;
    try {
      notice = JSON.parse(payload) as GatewayNotice;
    } catch {
      throw new DomainException('not_eligible', 422);
    }
    if (!notice.donationId) throw new DomainException('not_eligible', 422);
    const before = await this.db.asWorker((db) =>
      db.query<{ status: string }>(
        `SELECT status FROM donation WHERE id = $1`,
        [notice.donationId],
      ),
    );
    const status = before.rows[0]?.status;
    if (!status) throw new DomainException('not_eligible', 422);
    if ((!notice.type || notice.type === 'paid') && status !== 'pendiente')
      return 'already_applied';
    try {
      await this.settle(Buffer.from(payload), undefined, true);
    } catch (error) {
      if (error instanceof DomainException && error.code === 'not_eligible')
        return 'already_applied';
      throw error;
    }
    return 'applied';
  }
}

async function applyDispute(
  db: {
    query: (
      text: string,
      params?: unknown[],
    ) => Promise<{
      rows: {
        net_minor: string;
        currency: string;
        status: string;
        organization_id: string;
        campaign_id: string;
      }[];
    }>;
  },
  donationId: string,
  type: 'dispute_opened' | 'dispute_won' | 'dispute_lost',
) {
  const found = await db.query(
    `SELECT organization_id, campaign_id, status, net_minor, currency FROM donation WHERE id = $1`,
    [donationId],
  );
  const donation = found.rows[0];
  if (!donation) throw new DomainException('not_eligible', 422);
  if (type === 'dispute_opened') {
    if (donation.status !== 'liquidada')
      throw new DomainException('not_eligible', 422);
    await db.query(`UPDATE donation SET status = 'disputada' WHERE id = $1`, [
      donationId,
    ]);
    await db.query(
      `INSERT INTO campaign_ledger_entry (organization_id, campaign_id, donation_id, kind, amount_minor, currency)
       VALUES ($1, $2, $3, 'dispute_hold', $4, $5)`,
      [
        donation.organization_id,
        donation.campaign_id,
        donationId,
        donation.net_minor,
        donation.currency,
      ],
    );
    return;
  }
  if (donation.status !== 'disputada')
    throw new DomainException('not_eligible', 422);
  if (type === 'dispute_lost') return;
  const released = await db.query(
    `SELECT 1 AS ok FROM campaign_ledger_entry WHERE donation_id = $1 AND kind = 'dispute_release' LIMIT 1`,
    [donationId],
  );
  if (released.rows[0]) return;
  await db.query(`UPDATE donation SET status = 'liquidada' WHERE id = $1`, [
    donationId,
  ]);
  await db.query(
    `INSERT INTO campaign_ledger_entry (organization_id, campaign_id, donation_id, kind, amount_minor, currency)
     VALUES ($1, $2, $3, 'dispute_release', $4, $5)`,
    [
      donation.organization_id,
      donation.campaign_id,
      donationId,
      donation.net_minor,
      donation.currency,
    ],
  );
}
