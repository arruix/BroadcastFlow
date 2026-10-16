import { Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { DomainException } from '../shared/domain';
import { splitDonation } from '../shared/fees';
import { tooMany } from '../shared/rate-limit';
import { cleanText } from '../shared/text';

export type DonationInput = {
  amountMinor?: number;
  currency?: string;
  donorName?: string;
  donorEmail?: string;
  personKind?: string;
  visitAnonymousId?: string;
};

const fiscalReceipt = false;

@Injectable()
export class RecaudacionService {
  constructor(private readonly db: DbService) {}

  async readPublic(slug: string) {
    const found = await this.db.asWorker((db) =>
      db.query<{
        name: string;
        slug: string;
        status: string;
        kind: string;
        currency: string;
        donations_enabled: boolean;
        page_campaign_id: string | null;
        notice_id: string | null;
        version: number | null;
        controller: string | null;
        purpose: string | null;
        data_categories: string | null;
        retention: string | null;
        published_at: Date | null;
        share_title: string | null;
        share_description: string | null;
        image_key: string | null;
      }>(
        `SELECT c.name, c.slug, c.status, c.kind, c.currency, p.donations_enabled,
                d.campaign_id AS page_campaign_id,
                n.id AS notice_id, n.version, n.controller, n.purpose, n.data_categories, n.retention, n.published_at,
                sh.title AS share_title, sh.description AS share_description, sh.image_key
         FROM campaign c
         JOIN subscription s ON s.organization_id = c.organization_id
         JOIN plan p ON p.id = s.plan_id
         LEFT JOIN donation_page d ON d.campaign_id = c.id
         LEFT JOIN privacy_notice n ON n.campaign_id = c.id AND n.published_at IS NOT NULL AND n.retired_at IS NULL
         LEFT JOIN campaign_share sh ON sh.campaign_id = c.id
         WHERE c.slug = $1`,
        [slug],
      ),
    );
    const row = found.rows[0];
    if (!row) throw new NotFoundException();
    const notice = row.notice_id
      ? {
          id: row.notice_id,
          version: row.version,
          controller: row.controller,
          purpose: row.purpose,
          dataCategories: row.data_categories,
          retention: row.retention,
          publishedAt: row.published_at?.toISOString() ?? null,
        }
      : null;
    return {
      name: row.name,
      slug: row.slug,
      status: row.status,
      kind: row.kind,
      currency: row.currency.trim(),
      donateEnabled: Boolean(notice && row.page_campaign_id && row.status === 'activa' && row.donations_enabled),
      notice,
      share: row.share_title
        ? { title: row.share_title, description: row.share_description, imageKey: row.image_key }
        : null,
    };
  }

  async start(slug: string, input: DonationInput, idempotencyKey: string | undefined, ip: string) {
    if (tooMany(`donation:${ip}:${slug}`)) throw new DomainException('rate_limited', 429);
    if (!idempotencyKey || idempotencyKey.trim().length < 8) throw new DomainException('idempotency_required', 422);
    const key = idempotencyKey.trim().slice(0, 200);
    const donorName = cleanText(input.donorName, 120);
    const donorEmail = cleanText(input.donorEmail, 200).toLowerCase();
    if (!donorName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(donorEmail)) throw new DomainException('not_eligible', 422);
    if (input.personKind && input.personKind !== 'individual' && input.personKind !== 'organization') {
      throw new DomainException('not_eligible', 422);
    }
    const amount = Number(input.amountMinor);
    if (!Number.isInteger(amount) || amount < 1) throw new DomainException('not_eligible', 422);
    const currency = (input.currency ?? '').trim().toUpperCase();

    return this.db.asWorker(async (db) => {
      const found = await db.query<{
        id: string;
        organization_id: string;
        status: string;
        kind: string;
        currency: string;
        donations_enabled: boolean;
        platform_fee_bps: number;
        notice_id: string | null;
        page_campaign_id: string | null;
      }>(
        `SELECT c.id, c.organization_id, c.status, c.kind, c.currency, p.donations_enabled, p.platform_fee_bps,
                n.id AS notice_id, d.campaign_id AS page_campaign_id
         FROM campaign c
         JOIN subscription s ON s.organization_id = c.organization_id
         JOIN plan p ON p.id = s.plan_id
         LEFT JOIN privacy_notice n ON n.campaign_id = c.id AND n.published_at IS NOT NULL AND n.retired_at IS NULL
         LEFT JOIN donation_page d ON d.campaign_id = c.id
         WHERE c.slug = $1`,
        [slug],
      );
      const campaign = found.rows[0];
      if (!campaign) throw new NotFoundException();
      if (!campaign.notice_id) throw new DomainException('notice_required', 422);
      if (campaign.kind === 'comercial' || !campaign.page_campaign_id || !campaign.donations_enabled) {
        throw new DomainException('commercial_has_no_donation_page', 422);
      }
      if (campaign.status !== 'activa' || currency !== campaign.currency.trim()) {
        throw new DomainException('not_eligible', 422);
      }
      const existing = await db.query<{ id: string }>(
        'SELECT id FROM donation WHERE campaign_id = $1 AND idempotency_key = $2',
        [campaign.id, key],
      );
      if (existing.rows[0]) {
        return pending(existing.rows[0].id, campaign.notice_id);
      }
      const split = splitDonation(amount, campaign.platform_fee_bps);
      const visitAnonymousId = /^[0-9a-f-]{36}$/i.test(input.visitAnonymousId ?? '') ? input.visitAnonymousId : null;
      const inserted = await db.query<{ id: string }>(
        `INSERT INTO donation (
           organization_id, campaign_id, donation_page_campaign_id, privacy_notice_id, idempotency_key,
           status, gross_minor, net_minor, processor_fee_minor, platform_fee_minor, currency,
           donor_name, donor_email, visit_anonymous_id
         ) VALUES ($1,$2,$2,$3,$4,'pendiente',$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING id`,
        [
          campaign.organization_id,
          campaign.id,
          campaign.notice_id,
          key,
          amount,
          split.netMinor,
          split.processorFeeMinor,
          split.platformFeeMinor,
          currency,
          donorName,
          donorEmail,
          visitAnonymousId,
        ],
      );
      return pending(inserted.rows[0].id, campaign.notice_id);
    });
  }

  async receipt(donationId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(donationId)) throw new NotFoundException();
    const found = await this.db.asWorker((db) =>
      db.query<{
        id: string;
        status: string;
        gross_minor: string;
        net_minor: string;
        processor_fee_minor: string;
        platform_fee_minor: string;
        currency: string;
        privacy_notice_id: string;
        donor_name: string | null;
        donor_email: string | null;
        anonymized_at: Date | null;
      }>(
        `SELECT id, status, gross_minor, net_minor, processor_fee_minor, platform_fee_minor, currency,
                privacy_notice_id, donor_name, donor_email, anonymized_at
         FROM donation WHERE id = $1`,
        [donationId],
      ),
    );
    const row = found.rows[0];
    if (!row) throw new NotFoundException();
    return {
      id: row.id,
      status: row.status,
      grossMinor: Number(row.gross_minor),
      netMinor: Number(row.net_minor),
      processorFeeMinor: Number(row.processor_fee_minor),
      platformFeeMinor: Number(row.platform_fee_minor),
      currency: row.currency.trim(),
      privacyNoticeId: row.privacy_notice_id,
      donorName: row.donor_name,
      donorEmail: row.donor_email,
      anonymizedAt: row.anonymized_at ? row.anonymized_at.toISOString() : null,
      fiscalReceipt,
    };
  }
}

function pending(donationId: string, privacyNoticeId: string) {
  return {
    donationId,
    privacyNoticeId,
    clientSecret: `dev_${donationId}`,
  };
}
