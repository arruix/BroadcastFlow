import { DbService } from '../db/db.service';
import { DomainException } from './domain';

export async function assertWritable(
  db: DbService,
  userId: string,
  organizationId: string,
) {
  const found = await db.asUser(userId, (client) =>
    client.query<{
      status: string;
      cancel_at_period_end: boolean;
      current_period_end: Date | null;
    }>(
      `SELECT status, cancel_at_period_end, current_period_end
       FROM subscription WHERE organization_id = $1`,
      [organizationId],
    ),
  );
  const row = found.rows[0];
  if (!row) throw new DomainException('forbidden', 403);
  const ended =
    row.current_period_end !== null &&
    row.current_period_end.getTime() <= Date.now();
  if (row.status === 'incomplete' || row.status === 'past_due')
    throw new DomainException('subscription_inactive', 422);
  if (row.status === 'canceled' && ended)
    throw new DomainException('subscription_inactive', 422);
  if (row.cancel_at_period_end && ended)
    throw new DomainException('subscription_inactive', 422);
}
