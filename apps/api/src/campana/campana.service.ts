import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { DomainException, mapDbError } from '../shared/domain';
import {
  hasPaymentFields,
  normalizePaymentMethod,
  type PaymentColumns,
  type PaymentMethodInput,
  presentPaymentMethod,
} from '../shared/payment-method';
import { assertWritable } from '../shared/subscription';

const columns = `id, name, goal_minor, currency, kind, jurisdiction, jurisdiction_policy_id,
  time_zone, starts_on, ends_on, status, slug, store_url,
  payment_link_url, transfer_bank, transfer_holder, transfer_clabe, transfer_reference`;

export type CampaignInput = {
  name?: string;
  goalMinor?: number;
  currency?: string;
  kind?: string;
  jurisdiction?: string;
  jurisdictionPolicyId?: string;
  timeZone?: string;
  startsOn?: string;
  endsOn?: string;
  slug?: string;
  storeUrl?: string | null;
} & PaymentMethodInput;

type CampaignRow = {
  id: string;
  name: string;
  goal_minor: string | null;
  currency: string;
  kind: string;
  jurisdiction: string;
  jurisdiction_policy_id: string | null;
  time_zone: string;
  starts_on: string | null;
  ends_on: string | null;
  status: string;
  slug: string;
  store_url: string | null;
} & PaymentColumns;

@Injectable()
export class CampanaService {
  constructor(private readonly db: DbService) {}

  async list(userId: string, organizationId: string) {
    await this.member(userId, organizationId);
    const rows = await this.db.asUser(userId, (db) =>
      db.query<CampaignRow>(
        `SELECT ${columns}
         FROM campaign WHERE organization_id = $1 ORDER BY created_at`,
        [organizationId],
      ),
    );
    return rows.rows.map(present);
  }

  async create(userId: string, organizationId: string, input: CampaignInput) {
    const target = organizationId || (await this.existingOrganization(userId));
    if (!target) return this.createOwn(userId, input);
    await this.member(userId, target);
    await assertWritable(this.db, userId, target);
    const fields = normalize(input, undefined);
    const customSlug = Boolean(input.slug?.trim());
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const slug = customSlug
        ? fields.slug
        : candidateSlug(fields.slug, attempt);
      try {
        return await this.db.asUser(userId, async (db) => {
          const inserted = await db.query<CampaignRow>(
            `INSERT INTO campaign (
               organization_id, name, goal_minor, currency, kind, jurisdiction, jurisdiction_policy_id,
               time_zone, starts_on, ends_on, status, slug, store_url,
               payment_link_url, transfer_bank, transfer_holder, transfer_clabe, transfer_reference
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'borrador',$11,$12,$13,$14,$15,$16,$17)
             RETURNING ${columns}`,
            [
              target,
              fields.name,
              fields.goalMinor,
              fields.currency,
              fields.kind,
              fields.jurisdiction,
              fields.jurisdictionPolicyId,
              fields.timeZone,
              fields.startsOn,
              fields.endsOn,
              slug,
              fields.storeUrl,
              ...paymentValues(fields.payment),
            ],
          );
          return present(inserted.rows[0]);
        });
      } catch (error) {
        const taken =
          (error as { constraint?: string }).constraint === 'campaign_slug_key';
        if (taken && !customSlug && attempt < 5) continue;
        mapDbError(error);
      }
    }
    throw new DomainException('slug_taken', 422);
  }

  async activate(userId: string, organizationId: string, campaignId: string) {
    const role = await this.role(userId, organizationId);
    if (role !== 'owner' && role !== 'admin')
      throw new DomainException('forbidden', 403);
    try {
      const updated = await this.db.asUser(userId, (db) =>
        db.query<CampaignRow>(
          `UPDATE campaign SET status = 'activa'
           WHERE id = $1 AND organization_id = $2 AND status = 'borrador'
           RETURNING ${columns}`,
          [campaignId, organizationId],
        ),
      );
      if (!updated.rowCount) throw new DomainException('not_draft', 422);
      return present(updated.rows[0]);
    } catch (error) {
      if (error instanceof DomainException) throw error;
      mapDbError(error);
    }
  }

  async update(
    userId: string,
    organizationId: string,
    campaignId: string,
    input: CampaignInput,
  ) {
    await this.member(userId, organizationId);
    const current = await this.db.asUser(userId, (db) =>
      db.query<CampaignRow>(
        'SELECT id, status, slug FROM campaign WHERE id = $1 AND organization_id = $2',
        [campaignId, organizationId],
      ),
    );
    const row = current.rows[0] as { status: string; slug: string } | undefined;
    if (!row) throw new DomainException('forbidden', 403);
    if (row.status !== 'borrador') throw new DomainException('not_draft', 422);
    const fields = normalize(input, row.slug);
    try {
      const updated = await this.db.asUser(userId, (db) =>
        db.query<CampaignRow>(
          `UPDATE campaign SET
             name = $3, goal_minor = $4, currency = $5, kind = $6, jurisdiction = $7,
             jurisdiction_policy_id = $8, time_zone = $9, starts_on = $10, ends_on = $11,
             slug = $12, store_url = $13,
             payment_link_url = CASE WHEN $14 THEN $15 ELSE payment_link_url END,
             transfer_bank = CASE WHEN $14 THEN $16 ELSE transfer_bank END,
             transfer_holder = CASE WHEN $14 THEN $17 ELSE transfer_holder END,
             transfer_clabe = CASE WHEN $14 THEN $18 ELSE transfer_clabe END,
             transfer_reference = CASE WHEN $14 THEN $19 ELSE transfer_reference END
           WHERE id = $1 AND organization_id = $2
           RETURNING ${columns}`,
          [
            campaignId,
            organizationId,
            fields.name,
            fields.goalMinor,
            fields.currency,
            fields.kind,
            fields.jurisdiction,
            fields.jurisdictionPolicyId,
            fields.timeZone,
            fields.startsOn,
            fields.endsOn,
            fields.slug,
            fields.storeUrl,
            hasPaymentFields(input),
            ...paymentValues(fields.payment),
          ],
        ),
      );
      return present(updated.rows[0]);
    } catch (error) {
      mapDbError(error);
    }
  }

  // Método de pago externo: editable en cualquier estado, solo owner/admin.
  async setPaymentMethod(
    userId: string,
    organizationId: string,
    campaignId: string,
    input: PaymentMethodInput,
  ) {
    const role = await this.role(userId, organizationId);
    if (role !== 'owner' && role !== 'admin')
      throw new DomainException('forbidden', 403);
    await assertWritable(this.db, userId, organizationId);
    const payment = normalizePaymentMethod(input ?? {});
    try {
      const updated = await this.db.asUser(userId, (db) =>
        db.query<CampaignRow>(
          `UPDATE campaign SET payment_link_url = $3, transfer_bank = $4, transfer_holder = $5,
             transfer_clabe = $6, transfer_reference = $7
           WHERE id = $1 AND organization_id = $2
           RETURNING ${columns}`,
          [campaignId, organizationId, ...paymentValues(payment)],
        ),
      );
      if (!updated.rowCount) throw new DomainException('forbidden', 403);
      return present(updated.rows[0]);
    } catch (error) {
      if (error instanceof DomainException) throw error;
      mapDbError(error);
    }
  }

  private async member(userId: string, organizationId: string) {
    if (!(await this.role(userId, organizationId)))
      throw new DomainException('forbidden', 403);
  }

  private async existingOrganization(userId: string) {
    const found = await this.db.asUser(userId, (db) =>
      db.query<{ organization_id: string | null; platform_operator: boolean }>(
        `SELECT platform_operator,
                (SELECT organization_id FROM membership WHERE user_id = app_current_user() ORDER BY created_at LIMIT 1) AS organization_id
         FROM app_user WHERE id = app_current_user()`,
      ),
    );
    const account = found.rows[0];
    if (account?.platform_operator && !account.organization_id)
      throw new DomainException('forbidden', 403);
    return account?.organization_id ?? '';
  }

  private async createOwn(userId: string, input: CampaignInput) {
    const fields = normalize(input, undefined);
    const country = /^[A-Za-z]{2}$/.test(fields.jurisdiction)
      ? fields.jurisdiction.toUpperCase()
      : 'MX';
    const customSlug = Boolean(input.slug?.trim());
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const slug = customSlug
        ? fields.slug
        : candidateSlug(fields.slug, attempt);
      try {
        return await this.db.asUser(userId, async (db) => {
          const organization = await db.query<{ id: string }>(
            'INSERT INTO organization (name, country) VALUES ($1, $2) RETURNING id',
            [fields.name, country],
          );
          const organizationId = organization.rows[0].id;
          await db.query(
            `INSERT INTO membership (organization_id, user_id, role) VALUES ($1, $2, 'owner')`,
            [organizationId, userId],
          );
          await db.query(
            `INSERT INTO subscription (organization_id, plan_id, status)
             SELECT $1, id, 'internal' FROM plan WHERE code = 'fundador'`,
            [organizationId],
          );
          const inserted = await db.query<CampaignRow>(
            `INSERT INTO campaign (
               organization_id, name, goal_minor, currency, kind, jurisdiction, jurisdiction_policy_id,
               time_zone, starts_on, ends_on, status, slug, store_url,
               payment_link_url, transfer_bank, transfer_holder, transfer_clabe, transfer_reference
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'borrador',$11,$12,$13,$14,$15,$16,$17)
             RETURNING ${columns}`,
            [
              organizationId,
              fields.name,
              fields.goalMinor,
              fields.currency,
              fields.kind,
              fields.jurisdiction,
              fields.jurisdictionPolicyId,
              fields.timeZone,
              fields.startsOn,
              fields.endsOn,
              slug,
              fields.storeUrl,
              ...paymentValues(fields.payment),
            ],
          );
          return present(inserted.rows[0]);
        });
      } catch (error) {
        if (error instanceof DomainException) throw error;
        const taken =
          (error as { constraint?: string }).constraint === 'campaign_slug_key';
        if (taken && !customSlug && attempt < 5) continue;
        mapDbError(error);
      }
    }
    throw new DomainException('slug_taken', 422);
  }

  private async role(userId: string, organizationId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(organizationId))
      throw new DomainException('forbidden', 403);
    const found = await this.db.asUser(userId, (db) =>
      db.query<{ role: string }>(
        'SELECT role FROM membership WHERE organization_id = $1 AND user_id = $2',
        [organizationId, userId],
      ),
    );
    return found.rows[0]?.role;
  }
}

function present(row: CampaignRow) {
  return {
    id: row.id,
    name: row.name,
    goalMinor: row.goal_minor === null ? undefined : Number(row.goal_minor),
    currency: row.currency.trim(),
    kind: row.kind,
    jurisdiction: row.jurisdiction,
    jurisdictionPolicyId: row.jurisdiction_policy_id ?? undefined,
    timeZone: row.time_zone,
    startsOn: row.starts_on ?? undefined,
    endsOn: row.ends_on ?? undefined,
    status: row.status,
    slug: row.slug,
    storeUrl: row.store_url,
    paymentMethod: presentPaymentMethod(row),
  };
}

function paymentValues(payment: ReturnType<typeof normalizePaymentMethod>) {
  return [
    payment.paymentLinkUrl,
    payment.transferBank,
    payment.transferHolder,
    payment.transferClabe,
    payment.transferReference,
  ];
}

function normalize(input: CampaignInput, currentSlug: string | undefined) {
  const name = input.name?.trim() ?? '';
  if (!name) throw new DomainException('slug_invalid', 422);
  const kind = input.kind ?? '';
  if (kind !== 'electoral' && kind !== 'causa' && kind !== 'comercial') {
    throw new DomainException('electoral_without_policy', 422);
  }
  const currency = (input.currency ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency))
    throw new DomainException('country_invalid', 422);
  const jurisdiction = input.jurisdiction?.trim() ?? '';
  if (!jurisdiction) throw new DomainException('country_invalid', 422);
  const timeZone = input.timeZone?.trim() ?? '';
  if (!validZone(timeZone)) throw new DomainException('timezone_invalid', 422);
  if (input.startsOn && input.endsOn && input.endsOn < input.startsOn) {
    throw new DomainException('dates_invalid', 422);
  }
  const storeUrl = input.storeUrl?.trim() ? input.storeUrl.trim() : null;
  if (storeUrl && !storeUrl.startsWith('https://'))
    throw new DomainException('store_url_invalid', 422);
  const slug = input.slug?.trim() || currentSlug || slugify(name);
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
    slug.length < 3 ||
    slug.length > 60
  ) {
    throw new DomainException('slug_invalid', 422);
  }
  return {
    name,
    goalMinor: input.goalMinor ?? null,
    currency,
    kind,
    jurisdiction,
    jurisdictionPolicyId: input.jurisdictionPolicyId ?? null,
    timeZone,
    startsOn: input.startsOn || null,
    endsOn: input.endsOn || null,
    slug,
    storeUrl,
    payment: normalizePaymentMethod(input),
  };
}

function slugify(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const cut = base.slice(0, 60).replace(/-$/g, '');
  return cut.length >= 3 ? cut : `${cut}campana`.replace(/^-/, '').slice(0, 60);
}

function candidateSlug(preferred: string, attempt: number): string {
  if (attempt === 0) return preferred;
  const suffix = `-${attempt + 1}`;
  return `${preferred.slice(0, 60 - suffix.length)}${suffix}`;
}

function validZone(zone: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
