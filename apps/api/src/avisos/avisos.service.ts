import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { DomainException, mapDbError } from '../shared/domain';
import { cleanText, sampleNotice } from '../shared/text';

export type NoticeInput = {
  controller?: string;
  purpose?: string;
  dataCategories?: string;
  retention?: string;
};

type NoticeRow = {
  id: string;
  version: number;
  controller: string;
  purpose: string;
  data_categories: string;
  retention: string;
  published_at: Date | null;
};

@Injectable()
export class AvisosService {
  constructor(private readonly db: DbService) {}

  async list(userId: string, organizationId: string, campaignId: string) {
    await this.ownerOrAdmin(userId, organizationId);
    const rows = await this.db.asUser(userId, (db) =>
      db.query<NoticeRow>(
        `SELECT id, version, controller, purpose, data_categories, retention, published_at
         FROM privacy_notice
         WHERE campaign_id = $1 AND organization_id = $2
         ORDER BY version DESC`,
        [campaignId, organizationId],
      ),
    );
    return rows.rows.map(present);
  }

  async save(userId: string, organizationId: string, campaignId: string, input: NoticeInput) {
    await this.ownerOrAdmin(userId, organizationId);
    const fields = readNotice(input);
    try {
      const inserted = await this.db.asUser(userId, (db) =>
        db.query<NoticeRow>(
          `INSERT INTO privacy_notice (
             organization_id, campaign_id, version, controller, purpose, data_categories, retention
           )
           SELECT c.organization_id, c.id,
                  COALESCE((SELECT MAX(version) FROM privacy_notice WHERE campaign_id = c.id), 0) + 1,
                  $3, $4, $5, $6
           FROM campaign c
           WHERE c.id = $2 AND c.organization_id = $1
           RETURNING id, version, controller, purpose, data_categories, retention, published_at`,
          [organizationId, campaignId, fields.controller, fields.purpose, fields.dataCategories, fields.retention],
        ),
      );
      if (!inserted.rowCount) throw new DomainException('forbidden', 403);
      return present(inserted.rows[0]);
    } catch (error) {
      mapDbError(error);
    }
  }

  async publish(userId: string, organizationId: string, campaignId: string, noticeId: string) {
    await this.ownerOrAdmin(userId, organizationId);
    try {
      return await this.db.asUser(userId, async (db) => {
        const current = await db.query<NoticeRow>(
          `SELECT id, version, controller, purpose, data_categories, retention, published_at
           FROM privacy_notice WHERE id = $1 AND campaign_id = $2 AND organization_id = $3`,
          [noticeId, campaignId, organizationId],
        );
        const notice = current.rows[0];
        if (!notice) throw new DomainException('forbidden', 403);
        if (notice.published_at) throw new DomainException('notice_required', 422);
        const fields = {
          controller: notice.controller,
          purpose: notice.purpose,
          dataCategories: notice.data_categories,
          retention: notice.retention,
        };
        if (sampleNotice(fields) || Object.values(fields).some((value) => !value.trim())) {
          throw new DomainException('notice_required', 422);
        }
        await db.query(
          `UPDATE privacy_notice SET retired_at = now()
           WHERE campaign_id = $1 AND published_at IS NOT NULL AND retired_at IS NULL`,
          [campaignId],
        );
        const published = await db.query<NoticeRow>(
          `UPDATE privacy_notice SET published_at = now()
           WHERE id = $1
           RETURNING id, version, controller, purpose, data_categories, retention, published_at`,
          [noticeId],
        );
        const plan = await db.query<{ kind: string; donations_enabled: boolean }>(
          `SELECT c.kind, p.donations_enabled
           FROM campaign c
           JOIN subscription s ON s.organization_id = c.organization_id
           JOIN plan p ON p.id = s.plan_id
           WHERE c.id = $1`,
          [campaignId],
        );
        const row = plan.rows[0];
        if (row && row.kind !== 'comercial' && row.donations_enabled) {
          await db.query(
            `INSERT INTO donation_page (campaign_id, organization_id, published_at)
             VALUES ($1, $2, now())
             ON CONFLICT (campaign_id) DO NOTHING`,
            [campaignId, organizationId],
          );
        }
        return present(published.rows[0]);
      });
    } catch (error) {
      if (error instanceof DomainException) throw error;
      mapDbError(error);
    }
  }

  private async ownerOrAdmin(userId: string, organizationId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new DomainException('forbidden', 403);
    const found = await this.db.asUser(userId, (db) =>
      db.query<{ role: string }>('SELECT role FROM membership WHERE organization_id = $1 AND user_id = $2', [
        organizationId,
        userId,
      ]),
    );
    const role = found.rows[0]?.role;
    if (role !== 'owner' && role !== 'admin') throw new DomainException('forbidden', 403);
  }
}

function readNotice(input: NoticeInput) {
  const fields = {
    controller: cleanText(input.controller),
    purpose: cleanText(input.purpose),
    dataCategories: cleanText(input.dataCategories),
    retention: cleanText(input.retention),
  };
  if (!fields.controller || !fields.purpose || !fields.dataCategories || !fields.retention) {
    throw new DomainException('notice_required', 422);
  }
  return fields;
}

function present(row: NoticeRow) {
  return {
    id: row.id,
    version: row.version,
    controller: row.controller,
    purpose: row.purpose,
    dataCategories: row.data_categories,
    retention: row.retention,
    publishedAt: row.published_at ? row.published_at.toISOString() : null,
  };
}
