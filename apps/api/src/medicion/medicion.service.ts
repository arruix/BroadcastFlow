import { Injectable, MessageEvent, NotFoundException } from '@nestjs/common';
import { Observable } from 'rxjs';
import { DbService } from '../db/db.service';
import { DomainException, mapDbError } from '../shared/domain';
import { assertWritable } from '../shared/subscription';
import { rejectHoneypot } from '../shared/anti-spam';
import { tooMany } from '../shared/rate-limit';
import { readUtm } from '../shared/utm';
import { BoardBus } from './board.bus';
import {
  browserName,
  deviceClass,
  visitExclusion,
  reportOrigin,
  visitOrigin,
  type VisitOrigin,
} from './origin';

const uuid = /^[0-9a-f-]{36}$/i;
const visitEvents = ['view', 'click', 'pay_link', 'pay_transfer'];
const donateIntent = new Set(['click', 'pay_link', 'pay_transfer']);
const dateOnly = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class MedicionService {
  constructor(
    private readonly db: DbService,
    private readonly bus: BoardBus,
  ) {}

  async record(
    slug: string,
    input: {
      anonymousId?: string;
      eventType?: string;
      referrer?: string;
      utmSource?: string;
      utmMedium?: string;
      utmCampaign?: string;
      utmContent?: string;
      website?: string;
    },
    userAgent: string | undefined,
    ip: string,
  ) {
    if (tooMany(`visit:${ip}:${slug}`))
      throw new DomainException('rate_limited', 429);
    rejectHoneypot(input.website);
    const utm = readUtm(input);
    if (
      !uuid.test(input.anonymousId ?? '') ||
      !visitEvents.includes(input.eventType ?? '')
    ) {
      throw new DomainException('beacon_invalid', 422);
    }
    const saved = await this.db.asWorker(async (db) => {
      const found = await db.query<{
        id: string;
        organization_id: string;
        notice_id: string | null;
        status: string;
        payment_link_url: string | null;
        transfer_clabe: string | null;
      }>(
        `SELECT c.id, c.organization_id, n.id AS notice_id, c.status, c.payment_link_url, c.transfer_clabe
         FROM campaign c
         LEFT JOIN privacy_notice n ON n.campaign_id = c.id AND n.published_at IS NOT NULL AND n.retired_at IS NULL
         WHERE c.slug = $1`,
        [slug],
      );
      const campaign = found.rows[0];
      if (!campaign?.notice_id) throw new NotFoundException();
      // Clic/vista del método de pago: solo si la campaña lo tiene publicado.
      if (
        (input.eventType === 'pay_link' &&
          (!campaign.payment_link_url || campaign.status !== 'activa')) ||
        (input.eventType === 'pay_transfer' &&
          (!campaign.transfer_clabe || campaign.status !== 'activa'))
      )
        throw new DomainException('payment_method_missing', 422);
      let reason: 'preview_ua' | 'missing_ua' | 'bot' | 'reload_30m' | null =
        visitExclusion(userAgent);
      if (!reason) {
        const recent = await db.query(
          `SELECT 1 FROM visit_event
           WHERE campaign_id = $1 AND anonymous_id = $2 AND event_type = $3 AND counted
             AND occurred_at > now() - interval '30 minutes'
           LIMIT 1`,
          [campaign.id, input.anonymousId, input.eventType],
        );
        if (recent.rowCount) reason = 'reload_30m';
      }
      const counted = !reason;
      const origin = visitOrigin(utm.source ?? undefined, input.referrer);
      const agent = (userAgent ?? '').trim();
      await db.query(
        `SELECT record_visit($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          campaign.organization_id,
          campaign.id,
          input.anonymousId,
          origin,
          null,
          counted ? browserName(agent) : null,
          counted ? deviceClass(agent) : null,
          counted,
          reason,
          input.eventType,
          utm.source,
          utm.medium,
          utm.campaign,
          utm.content,
        ],
      );
      if (counted) {
        await db.query(
          `INSERT INTO outbox_event (organization_id, event_code, payload) VALUES ($1, 'visit.counted', $2::jsonb)`,
          [
            campaign.organization_id,
            JSON.stringify({
              campaignId: campaign.id,
              origin,
              eventType: input.eventType,
            }),
          ],
        );
      }
      return counted
        ? { organizationId: campaign.organization_id, campaignId: campaign.id }
        : null;
    });
    if (saved)
      this.bus.publish(saved.organizationId, {
        name: 'visit.counted',
        campaignId: saved.campaignId,
      });
  }

  // Conversión visita → intención de donar, por origen y UTM.
  async conversion(
    userId: string,
    organizationId: string,
    campaignId: string,
    from: string | undefined,
    to: string | undefined,
  ) {
    await this.requireRole(userId, organizationId, [
      'owner',
      'admin',
      'analyst',
    ]);
    if (
      !dateOnly.test(from ?? '') ||
      !dateOnly.test(to ?? '') ||
      (from ?? '') > (to ?? '')
    ) {
      throw new DomainException('dates_invalid', 422);
    }
    return this.db.asUser(userId, async (db) => {
      const campaign = await db.query<{ time_zone: string }>(
        'SELECT time_zone FROM campaign WHERE id = $1 AND organization_id = $2',
        [campaignId, organizationId],
      );
      if (!campaign.rowCount) throw new DomainException('forbidden', 403);
      const zone = campaign.rows[0].time_zone;
      const result = await db.query<ConversionRow>(
        `WITH visits AS (
           SELECT origin, coalesce(utm_source, '') AS utm_source, coalesce(utm_medium, '') AS utm_medium,
                  coalesce(utm_campaign, '') AS utm_campaign, coalesce(utm_content, '') AS utm_content,
                  count(DISTINCT anonymous_id) FILTER (WHERE event_type = 'view') AS visitors,
                  count(*) FILTER (WHERE event_type = 'pay_link') AS pay_link,
                  count(*) FILTER (WHERE event_type = 'pay_transfer') AS pay_transfer
           FROM visit_event
           WHERE campaign_id = $1 AND organization_id = $2 AND counted
             AND event_type IN ('view', 'pay_link', 'pay_transfer')
             AND occurred_at >= ($3::timestamp AT TIME ZONE $5)
             AND occurred_at < (($4::date + 1)::timestamp AT TIME ZONE $5)
           GROUP BY 1, 2, 3, 4, 5
         ), pledges AS (
           SELECT coalesce(origin, 'other') AS origin, coalesce(utm_source, '') AS utm_source,
                  coalesce(utm_medium, '') AS utm_medium, coalesce(utm_campaign, '') AS utm_campaign,
                  coalesce(utm_content, '') AS utm_content,
                  count(*) AS pledges, coalesce(sum(gross_minor), 0) AS amount_minor
           FROM donation
           WHERE campaign_id = $1 AND organization_id = $2
             AND created_at >= ($3::timestamp AT TIME ZONE $5)
             AND created_at < (($4::date + 1)::timestamp AT TIME ZONE $5)
           GROUP BY 1, 2, 3, 4, 5
         )
         SELECT origin, utm_source, utm_medium, utm_campaign, utm_content,
                coalesce(v.visitors, 0)::text AS visitors, coalesce(p.pledges, 0)::text AS pledges,
                coalesce(v.pay_link, 0)::text AS pay_link, coalesce(v.pay_transfer, 0)::text AS pay_transfer,
                coalesce(p.amount_minor, 0)::text AS amount_minor
         FROM visits v FULL JOIN pledges p USING (origin, utm_source, utm_medium, utm_campaign, utm_content)
         ORDER BY origin, utm_source, utm_medium, utm_campaign, utm_content`,
        [campaignId, organizationId, from, to, zone],
      );
      const rows = result.rows.map((row) => ({
        origin: reportOrigin(row.origin, row.utm_source),
        utmSource: row.utm_source || null,
        utmMedium: row.utm_medium || null,
        utmCampaign: row.utm_campaign || null,
        utmContent: row.utm_content || null,
        visitors: Number(row.visitors),
        pledges: Number(row.pledges),
        amountMinor: Number(row.amount_minor),
        payLinkClicks: Number(row.pay_link),
        payTransferViews: Number(row.pay_transfer),
        conversion: rate(Number(row.pledges), Number(row.visitors)),
        payRate: rate(
          Number(row.pay_link) + Number(row.pay_transfer),
          Number(row.visitors),
        ),
      }));
      const byOrigin = new Map<
        string,
        {
          visitors: number;
          pledges: number;
          amountMinor: number;
          payLinkClicks: number;
          payTransferViews: number;
        }
      >();
      for (const row of rows) {
        const current = byOrigin.get(row.origin) ?? {
          visitors: 0,
          pledges: 0,
          amountMinor: 0,
          payLinkClicks: 0,
          payTransferViews: 0,
        };
        current.payLinkClicks += row.payLinkClicks;
        current.payTransferViews += row.payTransferViews;
        current.visitors += row.visitors;
        current.pledges += row.pledges;
        current.amountMinor += row.amountMinor;
        byOrigin.set(row.origin, current);
      }
      return {
        origins: [...byOrigin.entries()].map(([origin, row]) => ({
          origin,
          ...row,
          conversion: rate(row.pledges, row.visitors),
          payRate: rate(row.payLinkClicks + row.payTransferViews, row.visitors),
        })),
        rows,
      };
    });
  }

  async conversionCsv(
    userId: string,
    organizationId: string,
    campaignId: string,
    from: string | undefined,
    to: string | undefined,
  ) {
    const { rows } = await this.conversion(
      userId,
      organizationId,
      campaignId,
      from,
      to,
    );
    const header = [
      'origen',
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_content',
      'visitantes',
      'intenciones',
      'monto_minor',
      'conversion',
      'clics_enlace_pago',
      'vistas_transferencia',
      'tasa_pago_externo',
    ];
    const lines = rows.map((row) =>
      [
        row.origin,
        row.utmSource ?? '',
        row.utmMedium ?? '',
        row.utmCampaign ?? '',
        row.utmContent ?? '',
        row.visitors,
        row.pledges,
        row.amountMinor,
        row.conversion ?? '',
        row.payLinkClicks,
        row.payTransferViews,
        row.payRate ?? '',
      ]
        .map(csvCell)
        .join(','),
    );
    return [header.join(','), ...lines].join('\r\n') + '\r\n';
  }

  async metrics(
    userId: string,
    organizationId: string,
    campaignId: string,
    from: string | undefined,
    to: string | undefined,
  ) {
    const role = await this.requireRole(userId, organizationId, [
      'owner',
      'admin',
      'analyst',
    ]);
    if (
      !dateOnly.test(from ?? '') ||
      !dateOnly.test(to ?? '') ||
      (from ?? '') > (to ?? '')
    ) {
      throw new DomainException('dates_invalid', 422);
    }
    const cpcVisible = role === 'owner' || role === 'admin';
    return this.db.asUser(userId, async (db) => {
      const campaign = await db.query<{ time_zone: string }>(
        'SELECT time_zone FROM campaign WHERE id = $1 AND organization_id = $2',
        [campaignId, organizationId],
      );
      if (!campaign.rowCount) throw new DomainException('forbidden', 403);
      const zone = campaign.rows[0].time_zone;
      const counts = await db.query<{
        origin: VisitOrigin;
        event_type: string;
        total: string;
      }>(
        `SELECT origin, event_type, sum(event_count) AS total
         FROM metric_bucket
         WHERE campaign_id = $1 AND organization_id = $2
           AND bucket_start >= ($3::timestamp AT TIME ZONE $5)
           AND bucket_start < (($4::date + 1)::timestamp AT TIME ZONE $5)
         GROUP BY origin, event_type`,
        [campaignId, organizationId, from, to, zone],
      );
      const excluded = await db.query<{ total: string }>(
        `SELECT count(*) AS total FROM visit_event
         WHERE campaign_id = $1 AND organization_id = $2 AND NOT counted
           AND occurred_at >= ($3::timestamp AT TIME ZONE $5)
           AND occurred_at < (($4::date + 1)::timestamp AT TIME ZONE $5)`,
        [campaignId, organizationId, from, to, zone],
      );
      const seriesRows = await db.query<{
        day: string;
        event_type: string;
        total: string;
      }>(
        `SELECT to_char((bucket_start AT TIME ZONE $5)::date, 'YYYY-MM-DD') AS day, event_type, sum(event_count) AS total
         FROM metric_bucket
         WHERE campaign_id = $1 AND organization_id = $2
           AND bucket_start >= ($3::timestamp AT TIME ZONE $5)
           AND bucket_start < (($4::date + 1)::timestamp AT TIME ZONE $5)
         GROUP BY 1, event_type
         ORDER BY 1`,
        [campaignId, organizationId, from, to, zone],
      );
      const spend = cpcVisible
        ? await db.query<{ network_code: string; total: string }>(
            `SELECT network_code, sum(amount_minor) AS total
             FROM ad_spend
             WHERE campaign_id = $1 AND organization_id = $2 AND currency = (SELECT currency FROM campaign WHERE id = $1)
               AND period_end >= $3::date AND period_start <= $4::date
             GROUP BY network_code`,
            [campaignId, organizationId, from, to],
          )
        : { rows: [] as { network_code: string; total: string }[] };
      return presentMetrics(
        counts.rows,
        Number(excluded.rows[0].total),
        seriesRows.rows,
        spend.rows,
        cpcVisible,
      );
    });
  }

  events(
    userId: string,
    organizationId: string,
  ): Promise<Observable<MessageEvent>> {
    return this.requireRole(userId, organizationId, [
      'owner',
      'admin',
      'editor',
      'publisher',
      'analyst',
    ]).then(
      () =>
        new Observable<MessageEvent>((subscriber) => {
          const stop = this.bus.listen(organizationId, (event) => {
            subscriber.next({ data: event });
          });
          const heartbeat = setInterval(
            () => subscriber.next({ type: 'ping', data: {} }),
            15000,
          );
          heartbeat.unref();
          return () => {
            clearInterval(heartbeat);
            stop();
          };
        }),
    );
  }

  async saveSpend(
    userId: string,
    organizationId: string,
    campaignId: string,
    input: {
      network?: string;
      periodStart?: string;
      periodEnd?: string;
      amountMinor?: number;
      currency?: string;
    },
  ) {
    await this.requireRole(userId, organizationId, ['owner', 'admin']);
    await assertWritable(this.db, userId, organizationId);
    if (input.network === 'direct')
      throw new DomainException('spend_invalid', 422);
    if (
      !dateOnly.test(input.periodStart ?? '') ||
      !dateOnly.test(input.periodEnd ?? '')
    )
      throw new DomainException('dates_invalid', 422);
    const amount = Number(input.amountMinor);
    if (!Number.isInteger(amount) || amount < 0)
      throw new DomainException('spend_invalid', 422);
    const currency = (input.currency ?? '').trim().toUpperCase();
    try {
      const saved = await this.db.asUser(userId, async (db) => {
        const campaign = await db.query<{ currency: string }>(
          'SELECT currency FROM campaign WHERE id = $1 AND organization_id = $2',
          [campaignId, organizationId],
        );
        if (!campaign.rowCount) throw new DomainException('forbidden', 403);
        if (currency !== campaign.rows[0].currency.trim())
          throw new DomainException('spend_invalid', 422);
        return db.query<{
          id: string;
          network_code: string;
          amount_minor: string;
          closed: boolean;
        }>(
          `INSERT INTO ad_spend (organization_id, campaign_id, network_code, period_start, period_end, amount_minor, currency)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING id, network_code, amount_minor, closed`,
          [
            organizationId,
            campaignId,
            input.network,
            input.periodStart,
            input.periodEnd,
            amount,
            currency,
          ],
        );
      });
      return presentSpend(saved.rows[0]);
    } catch (error) {
      if (error instanceof DomainException) throw error;
      mapDbError(error);
    }
  }

  async closeSpend(
    userId: string,
    organizationId: string,
    campaignId: string,
    spendId: string,
  ) {
    await this.requireRole(userId, organizationId, ['owner', 'admin']);
    const closed = await this.db.asUser(userId, (db) =>
      db.query<{
        id: string;
        network_code: string;
        amount_minor: string;
        closed: boolean;
      }>(
        `UPDATE ad_spend SET closed = true
         WHERE id = $1 AND campaign_id = $2 AND organization_id = $3
         RETURNING id, network_code, amount_minor, closed`,
        [spendId, campaignId, organizationId],
      ),
    );
    if (!closed.rowCount) throw new DomainException('forbidden', 403);
    return presentSpend(closed.rows[0]);
  }

  async reviseSpend(
    userId: string,
    organizationId: string,
    campaignId: string,
    spendId: string,
    amountMinor: number | undefined,
  ) {
    await this.requireRole(userId, organizationId, ['owner', 'admin']);
    const amount = Number(amountMinor);
    if (!Number.isInteger(amount) || amount < 0)
      throw new DomainException('spend_invalid', 422);
    try {
      const revised = await this.db.asUser(userId, (db) =>
        db.query<{
          id: string;
          network_code: string;
          amount_minor: string;
          closed: boolean;
        }>(
          `UPDATE ad_spend SET amount_minor = $4
           WHERE id = $1 AND campaign_id = $2 AND organization_id = $3
           RETURNING id, network_code, amount_minor, closed`,
          [spendId, campaignId, organizationId, amount],
        ),
      );
      if (!revised.rowCount) throw new DomainException('forbidden', 403);
      return presentSpend(revised.rows[0]);
    } catch (error) {
      if (error instanceof DomainException) throw error;
      mapDbError(error);
    }
  }

  private async requireRole(
    userId: string,
    organizationId: string,
    allowed: string[],
  ) {
    if (!uuid.test(organizationId)) throw new DomainException('forbidden', 403);
    const found = await this.db.asUser(userId, (db) =>
      db.query<{ role: string }>(
        'SELECT role FROM membership WHERE organization_id = $1 AND user_id = $2',
        [organizationId, userId],
      ),
    );
    const role = found.rows[0]?.role ?? '';
    if (!allowed.includes(role)) throw new DomainException('forbidden', 403);
    return role;
  }
}

function presentSpend(row: {
  id: string;
  network_code: string;
  amount_minor: string;
  closed: boolean;
}) {
  return {
    id: row.id,
    network: row.network_code,
    amountMinor: Number(row.amount_minor),
    closed: row.closed,
  };
}

function presentMetrics(
  counts: { origin: VisitOrigin; event_type: string; total: string }[],
  excludedCount: number,
  seriesRows: { day: string; event_type: string; total: string }[],
  spend: { network_code: string; total: string }[],
  cpcVisible: boolean,
) {
  const byOrigin = new Map<
    string,
    { views: number; clicks: number; donations: number }
  >();
  for (const row of counts) {
    const current = byOrigin.get(row.origin) ?? {
      views: 0,
      clicks: 0,
      donations: 0,
    };
    const total = Number(row.total);
    if (row.event_type === 'view') current.views += total;
    // Intención de donar: botón Donar, clic en enlace de pago o vista de la
    // transferencia (CLABE). Así coincide con las columnas de conversión.
    if (donateIntent.has(row.event_type)) current.clicks += total;
    if (row.event_type === 'donation') current.donations += total;
    byOrigin.set(row.origin, current);
  }
  const views = [...byOrigin.values()].reduce((sum, row) => sum + row.views, 0);
  const spendByNetwork = new Map(
    spend.map((row) => [row.network_code, Number(row.total)]),
  );
  const origins = [...byOrigin.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([origin, row]) => ({
      origin,
      views: row.views,
      viewShare: rate(row.views, views),
      clicks: row.clicks,
      clickRate: rate(row.clicks, row.views),
      donations: row.donations,
      donationRate: rate(row.donations, row.clicks),
      cpcMinor:
        cpcVisible &&
        origin !== 'direct' &&
        row.clicks > 0 &&
        spendByNetwork.has(origin)
          ? Math.floor((spendByNetwork.get(origin) ?? 0) / row.clicks)
          : null,
    }));
  const days = new Map<string, { views: number; clicks: number }>();
  for (const row of seriesRows) {
    const current = days.get(row.day) ?? { views: 0, clicks: 0 };
    if (row.event_type === 'view') current.views += Number(row.total);
    if (donateIntent.has(row.event_type)) current.clicks += Number(row.total);
    days.set(row.day, current);
  }
  return {
    excludedCount,
    cpcVisible,
    origins,
    series: [...days.entries()].map(([day, row]) => ({
      day,
      views: row.views,
      clicks: row.clicks,
    })),
  };
}

function rate(part: number, whole: number) {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 10000) / 10000;
}

type ConversionRow = {
  origin: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  visitors: string;
  pledges: string;
  amount_minor: string;
  pay_link: string;
  pay_transfer: string;
};

function csvCell(value: string | number): string {
  let text = String(value);
  // Evita que Excel interprete el texto como fórmula.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
