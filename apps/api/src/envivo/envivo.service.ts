import { ConflictException, Injectable } from '@nestjs/common';
import { DbService, type Queryable } from '../db/db.service';
import { BoardBus } from '../medicion/board.bus';
import { encrypt } from '../shared/crypto';
import { DomainException, mapDbError } from '../shared/domain';
import { assertWritable } from '../shared/subscription';
import { LiveGateway } from './live.gateway';
import { playbackUrl, playlist, signRoom } from './playback';

const fourHours = 4 * 60 * 60;
const reconnectMs = 30_000;
const closed = new Set(['pausada', 'cerrada', 'archivada']);
const reasons: Record<string, string | null> = {
  on: null,
  off: 'Esa red todavía no autoriza la emisión.',
  unavailable: 'Esa red no ofrece una entrada utilizable.',
  out: 'Esa red no es destino de este live.',
};

type SessionRow = {
  id: string;
  status: string;
  started_at: Date | null;
  campaign_id: string;
};
type DestinationRow = {
  id: string;
  social_connection_id: string;
  network_code: string;
  status: string;
  failure_reason: string | null;
  external_id: string | null;
};

@Injectable()
export class EnvivoService {
  private readonly originDown = new Map<string, number>();

  constructor(
    private readonly db: DbService,
    private readonly live: LiveGateway,
    private readonly bus: BoardBus,
  ) {}

  async desk(userId: string, organizationId: string, campaignId: string) {
    await this.requireRole(userId, organizationId);
    const networks = await this.db.asUser(userId, (db) =>
      db.query<{ code: string; live_mode: string }>(
        'SELECT code, live_mode FROM network_catalog ORDER BY code',
      ),
    );
    const connections = await this.db.asUser(userId, (db) =>
      db.query<{
        id: string;
        network_code: string;
        external_account_id: string;
        status: string;
      }>(
        `SELECT id, network_code, external_account_id, status
         FROM social_connection WHERE organization_id = $1 ORDER BY created_at`,
        [organizationId],
      ),
    );
    const latest = await this.db.asUser(userId, (db) =>
      db.query<{ id: string }>(
        `SELECT id FROM live_session WHERE organization_id = $1 AND campaign_id = $2 ORDER BY created_at DESC LIMIT 1`,
        [organizationId, campaignId],
      ),
    );
    const session = latest.rows[0]
      ? await this.read(userId, organizationId, latest.rows[0].id)
      : null;
    const quota = await this.quota(userId, organizationId);
    return {
      minutesIncluded: quota.included,
      secondsUsed: quota.used,
      secondsRemaining: quota.remaining,
      networks: networks.rows.map((row) => ({
        code: row.code,
        liveMode: row.live_mode,
        reason: reasons[row.live_mode] ?? null,
      })),
      connections: connections.rows.map((row) => ({
        id: row.id,
        network: row.network_code,
        externalAccountId: row.external_account_id,
        status: row.status,
      })),
      session,
    };
  }

  async open(
    userId: string,
    organizationId: string,
    campaignId: string,
    connectionIds: string[] | undefined,
  ) {
    await this.requireRole(userId, organizationId);
    await assertWritable(this.db, userId, organizationId);
    const ids = [...new Set(connectionIds ?? [])];
    if (!ids.length || ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id)))
      throw new DomainException('live_network_unavailable', 422);
    const campaign = await this.campaign(userId, organizationId, campaignId);
    if (closed.has(campaign.status))
      throw new DomainException('live_unavailable', 422);
    if (campaign.kind === 'electoral' && !campaign.jurisdiction_policy_id)
      throw new DomainException('electoral_without_policy', 422);
    const quota = await this.quota(userId, organizationId);
    if (quota.remaining <= 0)
      throw new DomainException('live_minutes_exhausted', 422);
    const connections = await this.db.asUser(userId, (db) =>
      db.query<{
        id: string;
        network_code: string;
        status: string;
        live_mode: string;
      }>(
        `SELECT c.id, c.network_code, c.status, n.live_mode
         FROM social_connection c
         JOIN network_catalog n ON n.code = c.network_code
         WHERE c.organization_id = $1 AND c.id = ANY($2::uuid[])`,
        [organizationId, ids],
      ),
    );
    if (connections.rowCount !== ids.length)
      throw new DomainException('forbidden', 403);
    for (const connection of connections.rows) {
      if (connection.live_mode !== 'on')
        throw new DomainException('live_network_unavailable', 422);
      if (connection.status !== 'active')
        throw new DomainException('connection_reauth', 422);
    }
    try {
      const created = await this.db.asUser(userId, async (db) => {
        const session = await db.query<{ id: string }>(
          `INSERT INTO live_session (organization_id, campaign_id, started_by, status)
           VALUES ($1, $2, $3, 'ready') RETURNING id`,
          [organizationId, campaignId, userId],
        );
        const sessionId = session.rows[0].id;
        for (const connection of connections.rows) {
          await db.query(
            `INSERT INTO live_destination (organization_id, live_session_id, social_connection_id, network_code, status)
             VALUES ($1, $2, $3, $4, 'pending')`,
            [organizationId, sessionId, connection.id, connection.network_code],
          );
        }
        return sessionId;
      });
      return this.present(userId, organizationId, created);
    } catch (error) {
      if (error instanceof DomainException) throw error;
      mapDbError(error);
    }
  }

  async start(userId: string, organizationId: string, sessionId: string) {
    await this.requireRole(userId, organizationId);
    await assertWritable(this.db, userId, organizationId);
    const quota = await this.quota(userId, organizationId);
    if (quota.remaining <= 0)
      throw new DomainException('live_minutes_exhausted', 422);
    const current = await this.owned(userId, organizationId, sessionId);
    if (current.status === 'live')
      throw new ConflictException({ code: 'live_already_live' });
    if (current.status !== 'ready')
      throw new ConflictException({ code: 'live_already_live' });
    const notices: {
      destinationId: string;
      network: string;
      status: string;
      failureReason?: string;
    }[] = [];
    try {
      await this.db.asUser(userId, async (db) => {
        const locked = await db.query<SessionRow>(
          `SELECT id, status, started_at, campaign_id FROM live_session
           WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
          [sessionId, organizationId],
        );
        const session = locked.rows[0];
        if (!session || session.status !== 'ready')
          throw new ConflictException({ code: 'live_already_live' });
        const destinations = await db.query<DestinationRow>(
          `SELECT id, social_connection_id, network_code, status, failure_reason, external_id
           FROM live_destination WHERE live_session_id = $1`,
          [sessionId],
        );
        let anyLive = false;
        for (const destination of destinations.rows) {
          const opened = this.live.open(destination.network_code, sessionId);
          if (opened === 'rejected') {
            await db.query(
              `UPDATE live_destination SET status = 'failed', failure_reason = $2 WHERE id = $1`,
              [destination.id, 'La red rechazó la emisión.'],
            );
            notices.push({
              destinationId: destination.id,
              network: destination.network_code,
              status: 'failed',
              failureReason: 'La red rechazó la emisión.',
            });
            continue;
          }
          await db.query(
            `UPDATE live_destination SET status = 'live', external_id = $2, ingest_ciphertext = $3 WHERE id = $1`,
            [
              destination.id,
              opened.externalId,
              encrypt(Buffer.from(opened.ingestKey)),
            ],
          );
          anyLive = true;
          notices.push({
            destinationId: destination.id,
            network: destination.network_code,
            status: 'live',
          });
        }
        await db.query(
          `UPDATE live_session SET status = $2, started_at = CASE WHEN $2 = 'live' THEN now() ELSE started_at END WHERE id = $1`,
          [sessionId, anyLive ? 'live' : 'failed'],
        );
      });
    } catch (error) {
      if (
        error instanceof DomainException ||
        error instanceof ConflictException
      )
        throw error;
      mapDbError(error);
    }
    for (const notice of notices) {
      if (notice.status === 'failed') {
        await this.db.asWorker((db) =>
          db.query(
            `INSERT INTO notification (organization_id, event_code, channel, status, idempotency_key)
             VALUES ($1, 'live.destination.failed', 'in_app', 'queued', $2)
             ON CONFLICT (idempotency_key) DO NOTHING`,
            [organizationId, `live:${notice.destinationId}`],
          ),
        );
      }
      this.bus.publish(organizationId, {
        name: 'live.destination',
        campaignId: current.campaign_id,
        ...notice,
      });
    }
    return this.present(userId, organizationId, sessionId);
  }

  async stop(userId: string, organizationId: string, sessionId: string) {
    await this.requireRole(userId, organizationId);
    const current = await this.owned(userId, organizationId, sessionId);
    await this.finish(organizationId, current);
    return this.present(userId, organizationId, sessionId);
  }

  async read(userId: string, organizationId: string, sessionId: string) {
    await this.requireRole(userId, organizationId);
    const current = await this.owned(userId, organizationId, sessionId);
    if (await this.shouldFinish(organizationId, current))
      await this.finish(organizationId, current);
    return this.present(userId, organizationId, sessionId);
  }

  async origin(
    userId: string,
    organizationId: string,
    sessionId: string,
    connected: boolean | undefined,
  ) {
    await this.requireRole(userId, organizationId);
    const current = await this.owned(userId, organizationId, sessionId);
    if (current.status === 'live') {
      if (connected === false)
        this.originDown.set(
          sessionId,
          this.originDown.get(sessionId) ?? Date.now(),
        );
      else this.originDown.delete(sessionId);
    }
    if (await this.shouldFinish(organizationId, current))
      await this.finish(organizationId, current);
    return this.present(userId, organizationId, sessionId);
  }

  async hls(sessionId: string): Promise<string | undefined> {
    if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return undefined;
    const found = await this.db.asWorker((db) =>
      db.query(`SELECT 1 FROM live_session WHERE id = $1 AND status = 'live'`, [
        sessionId,
      ]),
    );
    if (!found.rowCount) return undefined;
    return playlist(sessionId);
  }

  private async finish(organizationId: string, session: SessionRow) {
    if (session.status === 'ended' || session.status === 'failed') return;
    const quota = await this.quotaWorker(organizationId);
    await this.db.asWorker(async (db) => {
      const locked = await db.query<SessionRow>(
        `SELECT id, status, started_at, campaign_id FROM live_session WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [session.id, organizationId],
      );
      const row = locked.rows[0];
      if (!row || row.status === 'ended' || row.status === 'failed') return;
      const destinations = await db.query<DestinationRow>(
        `SELECT id, social_connection_id, network_code, status, failure_reason, external_id
         FROM live_destination WHERE live_session_id = $1`,
        [session.id],
      );
      for (const destination of destinations.rows) {
        if (destination.status === 'live' && destination.external_id)
          this.live.stop(destination.external_id);
        if (destination.status === 'live' || destination.status === 'pending') {
          await db.query(
            `UPDATE live_destination SET status = 'ended' WHERE id = $1`,
            [destination.id],
          );
        }
      }
      const elapsed = row.started_at
        ? Math.max(
            0,
            Math.floor((Date.now() - row.started_at.getTime()) / 1000),
          )
        : 0;
      const seconds = row.started_at
        ? Math.min(elapsed, fourHours, quota.remaining)
        : 0;
      await db.query(
        `UPDATE live_session
         SET status = 'ended', ended_at = now(), recording_key = CASE WHEN started_at IS NULL THEN recording_key ELSE $2 END
         WHERE id = $1`,
        [session.id, `recordings/${session.id}.mp4`],
      );
      if (seconds > 0) {
        await db.query(
          `INSERT INTO live_usage (organization_id, period_month, seconds_used)
           VALUES ($1, date_trunc('month', now())::date, $2)
           ON CONFLICT (organization_id, period_month)
           DO UPDATE SET seconds_used = live_usage.seconds_used + EXCLUDED.seconds_used`,
          [organizationId, seconds],
        );
      }
    });
    this.originDown.delete(session.id);
  }

  private async shouldFinish(
    organizationId: string,
    session: SessionRow,
  ): Promise<boolean> {
    if (session.status !== 'live' || !session.started_at) return false;
    const elapsedMs = Date.now() - session.started_at.getTime();
    if (elapsedMs >= fourHours * 1000) return true;
    const down = this.originDown.get(session.id);
    if (down !== undefined && Date.now() - down >= reconnectMs) return true;
    const quota = await this.quotaWorker(organizationId);
    return Math.floor(elapsedMs / 1000) >= quota.remaining;
  }

  private async present(
    userId: string,
    organizationId: string,
    sessionId: string,
  ) {
    const found = await this.db.asUser(userId, async (db) => {
      const session = await db.query<SessionRow>(
        `SELECT id, status, started_at, campaign_id FROM live_session WHERE id = $1 AND organization_id = $2`,
        [sessionId, organizationId],
      );
      const destinations = await db.query<DestinationRow>(
        `SELECT id, social_connection_id, network_code, status, failure_reason, external_id
         FROM live_destination WHERE live_session_id = $1 ORDER BY network_code`,
        [sessionId],
      );
      return { session: session.rows[0], destinations: destinations.rows };
    });
    const session = found.session;
    if (!session) throw new DomainException('forbidden', 403);
    const quota = await this.quota(userId, organizationId);
    const ttl = session.started_at
      ? Math.floor(
          (session.started_at.getTime() + fourHours * 1000 - Date.now()) / 1000,
        )
      : Math.min(quota.remaining, fourHours);
    return {
      id: session.id,
      status: session.status,
      ...(session.status === 'live'
        ? {
            roomToken: signRoom(session.id, ttl),
            playbackUrl: playbackUrl(session.id),
          }
        : {}),
      destinations: found.destinations.map((row) => ({
        connectionId: row.social_connection_id,
        network: row.network_code,
        status: row.status,
        ...(row.failure_reason ? { failureReason: row.failure_reason } : {}),
      })),
    };
  }

  private async owned(
    userId: string,
    organizationId: string,
    sessionId: string,
  ): Promise<SessionRow> {
    if (!/^[0-9a-f-]{36}$/i.test(sessionId))
      throw new DomainException('forbidden', 403);
    const found = await this.db.asUser(userId, (db) =>
      db.query<SessionRow>(
        `SELECT id, status, started_at, campaign_id FROM live_session WHERE id = $1 AND organization_id = $2`,
        [sessionId, organizationId],
      ),
    );
    const row = found.rows[0];
    if (!row) throw new DomainException('forbidden', 403);
    return row;
  }

  private async campaign(
    userId: string,
    organizationId: string,
    campaignId: string,
  ) {
    if (!/^[0-9a-f-]{36}$/i.test(campaignId))
      throw new DomainException('forbidden', 403);
    const found = await this.db.asUser(userId, (db) =>
      db.query<{
        kind: string;
        status: string;
        jurisdiction_policy_id: string | null;
      }>(
        `SELECT kind, status, jurisdiction_policy_id FROM campaign WHERE id = $1 AND organization_id = $2`,
        [campaignId, organizationId],
      ),
    );
    const row = found.rows[0];
    if (!row) throw new DomainException('forbidden', 403);
    return row;
  }

  private async quota(userId: string, organizationId: string) {
    const found = await this.db.asUser(userId, (db) =>
      this.quotaQuery(db, organizationId),
    );
    return found;
  }

  private async quotaWorker(organizationId: string) {
    return this.db.asWorker((db) => this.quotaQuery(db, organizationId));
  }

  private async quotaQuery(db: Queryable, organizationId: string) {
    const found = await db.query<{
      live_minutes_included: number;
      seconds_used: string;
    }>(
      `SELECT p.live_minutes_included,
              COALESCE((SELECT seconds_used FROM live_usage
                        WHERE organization_id = $1 AND period_month = date_trunc('month', now())::date), 0) AS seconds_used
       FROM subscription s JOIN plan p ON p.id = s.plan_id
       WHERE s.organization_id = $1`,
      [organizationId],
    );
    const row = found.rows[0];
    if (!row) throw new DomainException('forbidden', 403);
    const used = Number(row.seconds_used);
    return {
      included: row.live_minutes_included,
      used,
      remaining: Math.max(0, row.live_minutes_included * 60 - used),
    };
  }

  private async requireRole(userId: string, organizationId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(organizationId))
      throw new DomainException('forbidden', 403);
    const found = await this.db.asUser(userId, (db) =>
      db.query<{ role: string }>(
        'SELECT role FROM membership WHERE organization_id = $1 AND user_id = $2',
        [organizationId, userId],
      ),
    );
    const role = found.rows[0]?.role ?? '';
    if (!['owner', 'admin', 'publisher'].includes(role))
      throw new DomainException('forbidden', 403);
  }
}
