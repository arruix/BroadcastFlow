import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { decrypt, encrypt, randomToken, sha256 } from '../shared/crypto';
import { DomainException, mapDbError } from '../shared/domain';
import { assertWritable } from '../shared/subscription';
import { cleanText } from '../shared/text';
import { FacebookGateway } from './facebook.gateway';
import { YoutubeGateway } from './youtube.gateway';

const facebookLimit = 63206;
const publishScope = 'pages_manage_posts';

type ConnectionRow = {
  id: string;
  network_code: string;
  external_account_id: string;
  status: string;
};

@Injectable()
export class DistribucionService {
  constructor(
    private readonly db: DbService,
    private readonly facebook: FacebookGateway,
    private readonly youtube: YoutubeGateway,
  ) {}

  async startFacebook(userId: string, organizationId: string) {
    await this.requireRole(userId, organizationId, ['owner', 'admin']);
    await assertWritable(this.db, userId, organizationId);
    const state = randomToken();
    await this.db.asWorker((db) =>
      db.query(
        `INSERT INTO network_oauth_transaction (organization_id, user_id, network_code, state_hash, expires_at)
         VALUES ($1, $2, 'facebook', $3, now() + interval '10 minutes')`,
        [organizationId, userId, sha256(state)],
      ),
    );
    return { authorizationUrl: this.facebook.authorizationUrl(state) };
  }

  async finishFacebook(input: {
    state?: string;
    pageId?: string;
    scopes?: string[];
  }) {
    const state = input.state?.trim() ?? '';
    if (!state) throw new DomainException('token_invalid', 422);
    const scopes = Array.isArray(input.scopes) ? input.scopes : [];
    const exchanged = this.facebook.exchange({ pageId: input.pageId, scopes });
    const status = scopes.includes(publishScope) ? 'active' : 'reauth';
    try {
      const saved = await this.db.asWorker(async (db) => {
        const pending = await db.query<{
          organization_id: string;
          user_id: string;
        }>(
          `UPDATE network_oauth_transaction SET used_at = now()
           WHERE state_hash = $1 AND network_code = 'facebook' AND used_at IS NULL AND expires_at > now()
           RETURNING organization_id, user_id`,
          [sha256(state)],
        );
        const oauth = pending.rows[0];
        if (!oauth) throw new DomainException('token_invalid', 422);
        const limit = await db.query<{
          connection_limit: number | null;
          taken: string;
        }>(
          `SELECT p.connection_limit,
                  (SELECT count(*) FROM social_connection WHERE organization_id = $1) AS taken
           FROM subscription s JOIN plan p ON p.id = s.plan_id
           WHERE s.organization_id = $1`,
          [oauth.organization_id],
        );
        const room = limit.rows[0];
        const existing = await db.query(
          `SELECT id FROM social_connection
           WHERE organization_id = $1 AND network_code = 'facebook' AND external_account_id = $2`,
          [oauth.organization_id, exchanged.pageId],
        );
        if (
          !existing.rowCount &&
          room?.connection_limit !== null &&
          Number(room?.taken) >= Number(room?.connection_limit)
        ) {
          throw new DomainException('connection_limit', 422);
        }
        const ciphertext = encrypt(Buffer.from(exchanged.token));
        const row = await db.query<ConnectionRow>(
          `INSERT INTO social_connection (organization_id, network_code, external_account_id, token_ciphertext, status)
           VALUES ($1, 'facebook', $2, $3, $4)
           ON CONFLICT (organization_id, network_code, external_account_id)
           DO UPDATE SET token_ciphertext = EXCLUDED.token_ciphertext, status = EXCLUDED.status
           RETURNING id, network_code, external_account_id, status`,
          [oauth.organization_id, exchanged.pageId, ciphertext, status],
        );
        return presentConnection(row.rows[0]);
      });
      return saved;
    } catch (error) {
      if (error instanceof DomainException) throw error;
      mapDbError(error);
    }
  }

  async startYoutube(userId: string, organizationId: string) {
    await this.requireRole(userId, organizationId, ['owner', 'admin']);
    await assertWritable(this.db, userId, organizationId);
    const state = randomToken();
    await this.db.asWorker((db) =>
      db.query(
        `INSERT INTO network_oauth_transaction (organization_id, user_id, network_code, state_hash, expires_at)
         VALUES ($1, $2, 'youtube', $3, now() + interval '10 minutes')`,
        [organizationId, userId, sha256(state)],
      ),
    );
    return { authorizationUrl: this.youtube.authorizationUrl(state) };
  }

  async finishYoutube(input: {
    state?: string;
    channelId?: string;
    scopes?: string[];
  }) {
    const state = input.state?.trim() ?? '';
    if (!state) throw new DomainException('token_invalid', 422);
    const scopes = Array.isArray(input.scopes) ? input.scopes : [];
    const exchanged = this.youtube.exchange({
      channelId: input.channelId,
      scopes,
    });
    const status = scopes.includes('youtube') ? 'active' : 'reauth';
    try {
      return await this.db.asWorker(async (db) => {
        const pending = await db.query<{
          organization_id: string;
          user_id: string;
        }>(
          `UPDATE network_oauth_transaction SET used_at = now()
           WHERE state_hash = $1 AND network_code = 'youtube' AND used_at IS NULL AND expires_at > now()
           RETURNING organization_id, user_id`,
          [sha256(state)],
        );
        const oauth = pending.rows[0];
        if (!oauth) throw new DomainException('token_invalid', 422);
        const limit = await db.query<{
          connection_limit: number | null;
          taken: string;
        }>(
          `SELECT p.connection_limit,
                  (SELECT count(*) FROM social_connection WHERE organization_id = $1) AS taken
           FROM subscription s JOIN plan p ON p.id = s.plan_id
           WHERE s.organization_id = $1`,
          [oauth.organization_id],
        );
        const room = limit.rows[0];
        const existing = await db.query(
          `SELECT id FROM social_connection
           WHERE organization_id = $1 AND network_code = 'youtube' AND external_account_id = $2`,
          [oauth.organization_id, exchanged.channelId],
        );
        if (
          !existing.rowCount &&
          room?.connection_limit !== null &&
          Number(room?.taken) >= Number(room?.connection_limit)
        ) {
          throw new DomainException('connection_limit', 422);
        }
        const row = await db.query<ConnectionRow>(
          `INSERT INTO social_connection (organization_id, network_code, external_account_id, token_ciphertext, status)
           VALUES ($1, 'youtube', $2, $3, $4)
           ON CONFLICT (organization_id, network_code, external_account_id)
           DO UPDATE SET token_ciphertext = EXCLUDED.token_ciphertext, status = EXCLUDED.status
           RETURNING id, network_code, external_account_id, status`,
          [
            oauth.organization_id,
            exchanged.channelId,
            encrypt(Buffer.from(exchanged.token)),
            status,
          ],
        );
        return presentConnection(row.rows[0]);
      });
    } catch (error) {
      if (error instanceof DomainException) throw error;
      mapDbError(error);
    }
  }

  async listConnections(userId: string, organizationId: string) {
    await this.requireRole(userId, organizationId, [
      'owner',
      'admin',
      'editor',
      'publisher',
    ]);
    const rows = await this.db.asUser(userId, (db) =>
      db.query<ConnectionRow>(
        `SELECT id, network_code, external_account_id, status
         FROM social_connection WHERE organization_id = $1 ORDER BY created_at`,
        [organizationId],
      ),
    );
    return rows.rows.map(presentConnection);
  }

  async removeConnection(
    userId: string,
    organizationId: string,
    connectionId: string,
  ) {
    await this.requireRole(userId, organizationId, ['owner', 'admin']);
    await this.db.asUser(userId, async (db) => {
      try {
        await db.query(
          'DELETE FROM social_connection WHERE id = $1 AND organization_id = $2',
          [connectionId, organizationId],
        );
      } catch {
        await db.query(
          "UPDATE social_connection SET status = 'revoked' WHERE id = $1 AND organization_id = $2",
          [connectionId, organizationId],
        );
      }
    });
    return { ok: true };
  }

  async saveShare(
    userId: string,
    organizationId: string,
    campaignId: string,
    input: { title?: string; description?: string; imageKey?: string | null },
  ) {
    await this.requireRole(userId, organizationId, [
      'owner',
      'admin',
      'editor',
    ]);
    const title = cleanText(input.title, 200);
    const description = cleanText(input.description, 500);
    if (!title || !description) throw new DomainException('share_invalid', 422);
    const imageKey = input.imageKey?.trim() ? input.imageKey.trim() : null;
    if (imageKey && !imageKey.startsWith('https://'))
      throw new DomainException('image_invalid', 422);
    try {
      const saved = await this.db.asUser(userId, (db) =>
        db.query<{
          title: string;
          description: string;
          image_key: string | null;
        }>(
          `INSERT INTO campaign_share (campaign_id, organization_id, title, description, image_key)
           SELECT id, organization_id, $3, $4, $5 FROM campaign WHERE id = $1 AND organization_id = $2
           ON CONFLICT (campaign_id) DO UPDATE
             SET title = EXCLUDED.title, description = EXCLUDED.description, image_key = EXCLUDED.image_key
           RETURNING title, description, image_key`,
          [campaignId, organizationId, title, description, imageKey],
        ),
      );
      if (!saved.rowCount) throw new DomainException('forbidden', 403);
      const row = saved.rows[0];
      return {
        title: row.title,
        description: row.description,
        imageKey: row.image_key,
      };
    } catch (error) {
      if (error instanceof DomainException) throw error;
      mapDbError(error);
    }
  }

  async createItem(userId: string, organizationId: string, campaignId: string) {
    await this.requireRole(userId, organizationId, [
      'owner',
      'admin',
      'editor',
    ]);
    await assertWritable(this.db, userId, organizationId);
    try {
      const inserted = await this.db.asUser(userId, (db) =>
        db.query<{ id: string; status: string }>(
          `INSERT INTO content_item (organization_id, campaign_id, status)
           SELECT organization_id, id, 'borrador' FROM campaign WHERE id = $1 AND organization_id = $2
           RETURNING id, status`,
          [campaignId, organizationId],
        ),
      );
      if (!inserted.rowCount) throw new DomainException('forbidden', 403);
      return {
        id: inserted.rows[0].id,
        status: inserted.rows[0].status,
        variants: [],
      };
    } catch (error) {
      if (error instanceof DomainException) throw error;
      mapDbError(error);
    }
  }

  async listItems(userId: string, organizationId: string, campaignId: string) {
    await this.requireRole(userId, organizationId, [
      'owner',
      'admin',
      'editor',
      'publisher',
    ]);
    const items = await this.db.asUser(userId, (db) =>
      db.query<{ id: string; status: string }>(
        `SELECT id, status FROM content_item WHERE campaign_id = $1 AND organization_id = $2 ORDER BY created_at`,
        [campaignId, organizationId],
      ),
    );
    const variants = await this.db.asUser(userId, (db) =>
      db.query<{
        id: string;
        content_item_id: string;
        network_code: string;
        body: string;
        valid: boolean;
      }>(
        `SELECT v.id, v.content_item_id, v.network_code, v.body, v.valid
         FROM content_variant v
         JOIN content_item i ON i.id = v.content_item_id
         WHERE i.campaign_id = $1 AND i.organization_id = $2`,
        [campaignId, organizationId],
      ),
    );
    return items.rows.map((item) => ({
      id: item.id,
      status: item.status,
      variants: variants.rows
        .filter((variant) => variant.content_item_id === item.id)
        .map((variant) => ({
          id: variant.id,
          network: variant.network_code,
          body: variant.body,
          valid: variant.valid,
        })),
    }));
  }

  async saveVariant(
    userId: string,
    organizationId: string,
    contentItemId: string,
    input: { network?: string; body?: string },
  ) {
    await this.requireRole(userId, organizationId, [
      'owner',
      'admin',
      'editor',
    ]);
    if (input.network !== 'facebook')
      throw new DomainException('network_unavailable', 422);
    const body = cleanText(input.body, facebookLimit + 1);
    const valid = body.length > 0 && body.length <= facebookLimit;
    try {
      const saved = await this.db.asUser(userId, (db) =>
        db.query<{
          id: string;
          network_code: string;
          body: string;
          valid: boolean;
        }>(
          `INSERT INTO content_variant (organization_id, content_item_id, network_code, body, valid)
           SELECT i.organization_id, i.id, 'facebook', $3, $4
           FROM content_item i WHERE i.id = $1 AND i.organization_id = $2
           ON CONFLICT (content_item_id, network_code) DO UPDATE
             SET body = EXCLUDED.body, valid = EXCLUDED.valid
           RETURNING id, network_code, body, valid`,
          [contentItemId, organizationId, body, valid],
        ),
      );
      if (!saved.rowCount) throw new DomainException('forbidden', 403);
      const row = saved.rows[0];
      return {
        id: row.id,
        network: row.network_code,
        body: row.body,
        valid: row.valid,
      };
    } catch (error) {
      if (error instanceof DomainException) throw error;
      mapDbError(error);
    }
  }

  async schedule(
    userId: string,
    organizationId: string,
    input: { variantId?: string; connectionId?: string; scheduledAt?: string },
  ) {
    await this.requireRole(userId, organizationId, [
      'owner',
      'admin',
      'publisher',
    ]);
    await assertWritable(this.db, userId, organizationId);
    const when = new Date(input.scheduledAt ?? '');
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now())
      throw new DomainException('dates_invalid', 422);
    try {
      const inserted = await this.db.asUser(userId, async (db) => {
        const variant = await db.query<{ id: string; valid: boolean }>(
          `SELECT v.id, v.valid FROM content_variant v
           JOIN content_item i ON i.id = v.content_item_id
           WHERE v.id = $1 AND i.organization_id = $2`,
          [input.variantId, organizationId],
        );
        if (!variant.rowCount) throw new DomainException('forbidden', 403);
        if (!variant.rows[0].valid)
          throw new DomainException('variant_invalid', 422);
        const connection = await db.query<{ id: string; status: string }>(
          `SELECT id, status FROM social_connection WHERE id = $1 AND organization_id = $2 AND network_code = 'facebook'`,
          [input.connectionId, organizationId],
        );
        if (!connection.rowCount) throw new DomainException('forbidden', 403);
        if (connection.rows[0].status !== 'active')
          throw new DomainException('connection_reauth', 422);
        return db.query<{
          id: string;
          status: string;
          scheduled_at: Date;
          content_variant_id: string;
          social_connection_id: string;
        }>(
          `INSERT INTO publication (organization_id, content_variant_id, social_connection_id, scheduled_at, status)
           VALUES ($1, $2, $3, $4, 'scheduled')
           RETURNING id, status, scheduled_at, content_variant_id, social_connection_id`,
          [
            organizationId,
            input.variantId,
            input.connectionId,
            when.toISOString(),
          ],
        );
      });
      return presentPublication(inserted.rows[0]);
    } catch (error) {
      if (error instanceof DomainException) throw error;
      mapDbError(error);
    }
  }

  async dispatch(userId: string, organizationId: string) {
    await this.requireRole(userId, organizationId, [
      'owner',
      'admin',
      'publisher',
    ]);
    const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
    const done: ReturnType<typeof presentPublication>[] = [];
    await this.db.asWorker(async (db) => {
      const due = await db.query<{
        id: string;
        content_variant_id: string;
        social_connection_id: string;
        body: string;
        token_ciphertext: Buffer;
        external_account_id: string;
        connection_status: string;
        slug: string;
        image_key: string | null;
        scheduled_at: Date;
      }>(
        `SELECT p.id, p.content_variant_id, p.social_connection_id, p.scheduled_at,
                v.body, s.token_ciphertext, s.external_account_id, s.status AS connection_status,
                c.slug, sh.image_key
         FROM publication p
         JOIN content_variant v ON v.id = p.content_variant_id
         JOIN content_item i ON i.id = v.content_item_id
         JOIN campaign c ON c.id = i.campaign_id
         JOIN social_connection s ON s.id = p.social_connection_id
         LEFT JOIN campaign_share sh ON sh.campaign_id = c.id
         WHERE p.organization_id = $1 AND p.status = 'scheduled' AND p.scheduled_at <= now()
         ORDER BY p.scheduled_at
         FOR UPDATE OF p SKIP LOCKED`,
        [organizationId],
      );
      for (const row of due.rows) {
        const outcome =
          row.connection_status === 'active'
            ? this.facebook.publish({
                publicationId: row.id,
                token: decrypt(row.token_ciphertext).toString('utf8'),
                pageId: row.external_account_id,
                body: row.body,
                link: `${origin}/c/${row.slug}`,
                imageKey: row.image_key?.startsWith('https://')
                  ? row.image_key
                  : null,
              })
            : 'terminal';
        if (outcome === 'ok') {
          await db.query(
            `INSERT INTO publication_attempt (organization_id, publication_id, outcome) VALUES ($1, $2, 'ok')`,
            [organizationId, row.id],
          );
          const published = await db.query<{
            id: string;
            status: string;
            scheduled_at: Date;
            content_variant_id: string;
            social_connection_id: string;
          }>(
            `UPDATE publication SET status = 'published' WHERE id = $1 RETURNING id, status, scheduled_at, content_variant_id, social_connection_id`,
            [row.id],
          );
          done.push(presentPublication(published.rows[0]));
          continue;
        }
        const prior = await db.query<{ count: string }>(
          `SELECT count(*) FROM publication_attempt WHERE publication_id = $1 AND outcome = 'retry'`,
          [row.id],
        );
        const retries = Number(prior.rows[0].count) + 1;
        const terminal = outcome === 'terminal' || retries >= 5;
        await db.query(
          `INSERT INTO publication_attempt (organization_id, publication_id, outcome, detail) VALUES ($1, $2, $3, $4)`,
          [organizationId, row.id, terminal ? 'terminal' : 'retry', outcome],
        );
        const updated = await db.query<{
          id: string;
          status: string;
          scheduled_at: Date;
          content_variant_id: string;
          social_connection_id: string;
        }>(
          `UPDATE publication SET status = $2 WHERE id = $1 RETURNING id, status, scheduled_at, content_variant_id, social_connection_id`,
          [row.id, terminal ? 'failed' : 'scheduled'],
        );
        done.push(presentPublication(updated.rows[0]));
      }
    });
    return done;
  }

  private async requireRole(
    userId: string,
    organizationId: string,
    allowed: string[],
  ) {
    if (!/^[0-9a-f-]{36}$/i.test(organizationId))
      throw new DomainException('forbidden', 403);
    const found = await this.db.asUser(userId, (db) =>
      db.query<{ role: string }>(
        'SELECT role FROM membership WHERE organization_id = $1 AND user_id = $2',
        [organizationId, userId],
      ),
    );
    if (!allowed.includes(found.rows[0]?.role ?? ''))
      throw new DomainException('forbidden', 403);
  }
}

function presentConnection(row: ConnectionRow) {
  return {
    id: row.id,
    network: row.network_code,
    externalAccountId: row.external_account_id,
    status: row.status,
  };
}

function presentPublication(row: {
  id: string;
  status: string;
  scheduled_at: Date;
  content_variant_id: string;
  social_connection_id: string;
}) {
  return {
    id: row.id,
    status: row.status,
    scheduledAt: row.scheduled_at.toISOString(),
    variantId: row.content_variant_id,
    connectionId: row.social_connection_id,
  };
}
