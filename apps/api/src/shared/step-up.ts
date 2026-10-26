import { DbService } from '../db/db.service';
import { DomainException } from './domain';

export async function assertStepUp(
  db: DbService,
  userId: string,
  sessionId: string,
) {
  const row = await db.asUser(userId, (client) =>
    client.query<{ step_up_until: Date | null }>(
      `SELECT step_up_until FROM session WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
      [sessionId, userId],
    ),
  );
  const until = row.rows[0]?.step_up_until;
  if (!until || new Date(until).getTime() <= Date.now())
    throw new DomainException('step_up_required', 422);
}
