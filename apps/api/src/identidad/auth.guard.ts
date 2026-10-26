import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { DbService } from '../db/db.service';
import { verifyJwt } from '../shared/crypto';
import { DomainException } from '../shared/domain';

export type AuthedRequest = Request & { userId: string; sessionId: string };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly db: DbService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const claims = verifyJwt(token);
    if (!claims?.sid || claims.purpose === 'enroll')
      throw new DomainException('token_invalid', 401);
    const gate = await this.db.asWorker((db) =>
      db.query<{ blocked_at: Date | null; revoked_at: Date | null }>(
        `SELECT u.blocked_at, s.revoked_at
         FROM session s
         JOIN app_user u ON u.id = s.user_id
         WHERE s.id = $1 AND s.user_id = $2`,
        [claims.sid, claims.sub],
      ),
    );
    const row = gate.rows[0];
    if (!row || row.revoked_at) throw new DomainException('token_invalid', 401);
    if (row.blocked_at) throw new DomainException('account_blocked', 401);
    request.userId = claims.sub;
    request.sessionId = claims.sid;
    return true;
  }
}
