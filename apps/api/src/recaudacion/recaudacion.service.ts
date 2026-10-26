import { Injectable, NotFoundException } from '@nestjs/common';
import { DbService, type Queryable } from '../db/db.service';
import { playbackUrl } from '../envivo/playback';
import { LibroService } from '../libro/libro.service';
import { signWebhook } from '../shared/crypto';
import { DomainException } from '../shared/domain';
import { splitDonation } from '../shared/fees';
import { visitOrigin } from '../medicion/origin';
import { rejectHoneypot, requireCaptcha } from '../shared/anti-spam';
import { tooMany } from '../shared/rate-limit';
import { readUtm } from '../shared/utm';
import {
  type PaymentColumns,
  presentPaymentMethod,
} from '../shared/payment-method';
import { cleanText } from '../shared/text';

export type DonationInput = {
  amountMinor?: number;
  currency?: string;
  donorName?: string;
  donorEmail?: string;
  personKind?: string;
  visitAnonymousId?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  consent?: boolean;
  noticeVersion?: number;
  captchaToken?: string;
  website?: string;
};

const fiscalReceipt = false;

export function simulatedPaymentsEnabled(): boolean {
  return (
    process.env.DONATIONS_SIMULATED_PAYMENTS === 'true' &&
    process.env.NODE_ENV !== 'production'
  );
}
const contactRetention = '5 years';

type DonationRow = {
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
};

@Injectable()
export class RecaudacionService {
  constructor(
    private readonly db: DbService,
    private readonly libro: LibroService,
  ) {}

  async readPublic(slug: string) {
    const found = await this.db.asWorker((db) =>
      db.query<
        {
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
          live_id: string | null;
        } & PaymentColumns
      >(
        `SELECT c.name, c.slug, c.status, c.kind, c.currency, p.donations_enabled,
                c.payment_link_url, c.transfer_bank, c.transfer_holder, c.transfer_clabe, c.transfer_reference,
                d.campaign_id AS page_campaign_id,
                n.id AS notice_id, n.version, n.controller, n.purpose, n.data_categories, n.retention, n.published_at,
                sh.title AS share_title, sh.description AS share_description, sh.image_key,
                live.id AS live_id
         FROM campaign c
         JOIN subscription s ON s.organization_id = c.organization_id
         JOIN plan p ON p.id = s.plan_id
         LEFT JOIN donation_page d ON d.campaign_id = c.id
         LEFT JOIN privacy_notice n ON n.campaign_id = c.id AND n.published_at IS NOT NULL AND n.retired_at IS NULL
         LEFT JOIN campaign_share sh ON sh.campaign_id = c.id
         LEFT JOIN LATERAL (
           SELECT id FROM live_session WHERE campaign_id = c.id AND status = 'live' ORDER BY started_at DESC LIMIT 1
         ) live ON true
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
      donateEnabled: Boolean(
        notice &&
        row.page_campaign_id &&
        row.status === 'activa' &&
        row.donations_enabled,
      ),
      notice,
      // Solo se publica con la campaña activa y el aviso vigente.
      paymentMethod:
        notice && row.status === 'activa' ? presentPaymentMethod(row) : null,
      share: row.share_title
        ? {
            title: row.share_title,
            description: row.share_description,
            imageKey: row.image_key,
          }
        : null,
      live: row.live_id ? { playbackUrl: playbackUrl(row.live_id) } : null,
    };
  }

  async start(
    slug: string,
    input: DonationInput,
    idempotencyKey: string | undefined,
    ip: string,
  ) {
    if (tooMany(`donation:${ip}:${slug}`, 10))
      throw new DomainException('rate_limited', 429);
    rejectHoneypot(input.website);
    if (input.consent !== true)
      throw new DomainException('consent_required', 422);
    await requireCaptcha(input.captchaToken, ip);
    const utm = readUtm(input);
    if (!idempotencyKey || idempotencyKey.trim().length < 8)
      throw new DomainException('idempotency_required', 422);
    const key = idempotencyKey.trim().slice(0, 200);
    const donorName = cleanText(input.donorName, 120);
    const donorEmail = cleanText(input.donorEmail, 200).toLowerCase();
    if (!donorName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(donorEmail))
      throw new DomainException('not_eligible', 422);
    if (
      input.personKind &&
      input.personKind !== 'individual' &&
      input.personKind !== 'organization'
    ) {
      throw new DomainException('not_eligible', 422);
    }
    const amount = Number(input.amountMinor);
    if (!Number.isInteger(amount) || amount < 1)
      throw new DomainException('not_eligible', 422);
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
        notice_version: number | null;
        page_campaign_id: string | null;
      }>(
        `SELECT c.id, c.organization_id, c.status, c.kind, c.currency, p.donations_enabled, p.platform_fee_bps,
                n.id AS notice_id, n.version AS notice_version, d.campaign_id AS page_campaign_id
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
      if (!campaign.notice_id || !campaign.notice_version)
        throw new DomainException('notice_required', 422);
      // El consentimiento se da a una versión concreta del aviso.
      if (
        input.noticeVersion !== undefined &&
        Number(input.noticeVersion) !== campaign.notice_version
      )
        throw new DomainException('notice_changed', 409);
      if (
        campaign.kind === 'comercial' ||
        !campaign.page_campaign_id ||
        !campaign.donations_enabled
      ) {
        throw new DomainException('commercial_has_no_donation_page', 422);
      }
      if (
        campaign.status !== 'activa' ||
        currency !== campaign.currency.trim()
      ) {
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
      const visitAnonymousId = /^[0-9a-f-]{36}$/i.test(
        input.visitAnonymousId ?? '',
      )
        ? input.visitAnonymousId
        : null;
      let origin: string | null = utm.source
        ? visitOrigin(utm.source, undefined)
        : null;
      if (!origin && visitAnonymousId) {
        const firstVisit = await db.query<{ origin: string }>(
          `SELECT origin FROM visit_event
           WHERE campaign_id = $1 AND anonymous_id = $2 AND counted
           ORDER BY occurred_at LIMIT 1`,
          [campaign.id, visitAnonymousId],
        );
        origin = firstVisit.rows[0]?.origin ?? null;
      }
      origin ??= visitOrigin(undefined, input.referrer);
      const inserted = await db.query<{ id: string }>(
        `INSERT INTO donation (
           organization_id, campaign_id, donation_page_campaign_id, privacy_notice_id, idempotency_key,
           status, gross_minor, net_minor, processor_fee_minor, platform_fee_minor, currency,
           donor_name, donor_email, visit_anonymous_id,
           origin, utm_source, utm_medium, utm_campaign, utm_content,
           consent_notice_version, consented_at
         ) VALUES ($1,$2,$2,$3,$4,'pendiente',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now())
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
          origin,
          utm.source,
          utm.medium,
          utm.campaign,
          utm.content,
          campaign.notice_version,
        ],
      );
      return pending(inserted.rows[0].id, campaign.notice_id);
    });
  }

  async receipt(donationId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(donationId)) throw new NotFoundException();
    const found = await this.db.asWorker((db) =>
      db.query<DonationRow>(donationSelect, [donationId]),
    );
    const row = found.rows[0];
    if (!row) throw new NotFoundException();
    return donationRecord(row);
  }

  // Cobro simulado: firma el webhook con la llave interna. Solo existe para
  // desarrollo; queda apagado salvo DONATIONS_SIMULATED_PAYMENTS=true y nunca
  // en producción. Ningún donativo se marca pagado sin una pasarela real.
  async payDonation(donationId: string) {
    if (!simulatedPaymentsEnabled())
      throw new DomainException('payments_not_enabled', 503);
    if (!/^[0-9a-f-]{36}$/i.test(donationId)) throw new NotFoundException();
    const found = await this.db.asWorker((db) =>
      db.query<{
        id: string;
        organization_id: string;
        campaign_id: string;
        status: string;
        gross_minor: string;
        net_minor: string;
        processor_fee_minor: string;
        platform_fee_minor: string;
        currency: string;
      }>(
        `SELECT id, organization_id, campaign_id, status, gross_minor, net_minor,
                processor_fee_minor, platform_fee_minor, currency
         FROM donation WHERE id = $1`,
        [donationId],
      ),
    );
    const donation = found.rows[0];
    if (!donation) throw new NotFoundException();
    if (donation.status === 'liquidada') {
      return { donationId: donation.id, status: 'liquidada' };
    }
    if (donation.status !== 'pendiente') {
      throw new DomainException('not_eligible', 422);
    }
    const eventId = `evt_pay_${donation.id.slice(0, 8)}_${Date.now()}`;
    const payload = JSON.stringify({
      id: eventId,
      donationId: donation.id,
      grossMinor: Number(donation.gross_minor),
      netMinor: Number(donation.net_minor),
      processorFeeMinor: Number(donation.processor_fee_minor),
      platformFeeMinor: Number(donation.platform_fee_minor),
      currency: donation.currency.trim(),
    });
    const signature = signWebhook(payload);
    await this.libro.settle(Buffer.from(payload), signature);
    return { donationId: donation.id, status: 'liquidada' };
  }

  async rights(
    userId: string,
    organizationId: string,
    donationId: string,
    input: { action?: string; donorName?: string; donorEmail?: string },
  ) {
    const action = input.action;
    if (
      action !== 'access' &&
      action !== 'rectify' &&
      action !== 'cancel' &&
      action !== 'oppose'
    ) {
      throw new DomainException('not_eligible', 422);
    }
    if (!/^[0-9a-f-]{36}$/i.test(donationId)) throw new NotFoundException();
    const record = await this.db.asUser(userId, async (db) => {
      await requireRole(db, organizationId, userId, ['owner', 'treasurer']);
      const found = await db.query<DonationRow>(
        `${donationSelect} AND organization_id = $2`,
        [donationId, organizationId],
      );
      const row = found.rows[0];
      if (!row) throw new NotFoundException();
      if (
        action === 'access' ||
        ((action === 'cancel' || action === 'oppose') && row.anonymized_at)
      ) {
        return donationRecord(row);
      }
      if (row.anonymized_at) throw new DomainException('not_eligible', 422);
      if (action === 'rectify') {
        const donorName = cleanText(input.donorName, 120);
        const donorEmail = cleanText(input.donorEmail, 254).toLowerCase();
        if (!donorName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(donorEmail))
          throw new DomainException('not_eligible', 422);
        const updated = await db.query<DonationRow>(
          `UPDATE donation SET donor_name = $3, donor_email = $4
           WHERE id = $1 AND organization_id = $2 AND anonymized_at IS NULL
           RETURNING id, status, gross_minor, net_minor, processor_fee_minor, platform_fee_minor, currency,
                     privacy_notice_id, donor_name, donor_email, anonymized_at`,
          [donationId, organizationId, donorName, donorEmail],
        );
        if (!updated.rows[0]) throw new DomainException('not_eligible', 422);
        return donationRecord(updated.rows[0]);
      }
      const cleared = await db.query<DonationRow>(
        `UPDATE donation SET donor_name = NULL, donor_email = NULL, anonymized_at = now()
         WHERE id = $1 AND organization_id = $2 AND anonymized_at IS NULL
           AND created_at <= now() - $3::interval
         RETURNING id, status, gross_minor, net_minor, processor_fee_minor, platform_fee_minor, currency,
                   privacy_notice_id, donor_name, donor_email, anonymized_at`,
        [donationId, organizationId, contactRetention],
      );
      if (!cleared.rows[0])
        throw new DomainException('rights_retention_active', 422);
      return donationRecord(cleared.rows[0]);
    });
    await this.db.asWorker((db) =>
      db.query(
        `INSERT INTO audit_event (organization_id, actor_user_id, action, entity, entity_id)
         VALUES ($1, $2, $3, 'donation', $4)`,
        [organizationId, userId, `donor.${action}`, donationId],
      ),
    );
    return record;
  }
}

const donationSelect = `SELECT id, status, gross_minor, net_minor, processor_fee_minor, platform_fee_minor, currency,
  privacy_notice_id, donor_name, donor_email, anonymized_at
  FROM donation WHERE id = $1`;

function donationRecord(row: DonationRow) {
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

function pending(donationId: string, privacyNoticeId: string) {
  return {
    donationId,
    privacyNoticeId,
    clientSecret: `dev_${donationId}`,
  };
}
