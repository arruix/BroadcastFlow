import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { AuthGuard, type AuthedRequest } from '../identidad/auth.guard';

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificacionesController {
  constructor(private readonly db: DbService) {}

  @Get()
  async list(@Req() request: AuthedRequest) {
    const rows = await this.db.asUser(request.userId, (db) =>
      db.query<{
        id: string;
        event_code: string;
        status: string;
        created_at: Date;
      }>(
        `SELECT id, event_code, status, created_at
         FROM notification
         WHERE channel = 'in_app'
         ORDER BY created_at DESC
         LIMIT 20`,
      ),
    );
    return rows.rows.map((row) => ({
      id: row.id,
      event: row.event_code,
      status: row.status,
      createdAt: row.created_at.toISOString(),
    }));
  }
}
