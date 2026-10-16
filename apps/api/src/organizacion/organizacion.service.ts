import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { DomainException } from '../shared/domain';

@Injectable()
export class OrganizacionService {
  constructor(private readonly db: DbService) {}

  list(userId: string) {
    return this.db.asUser(userId, async (db) => {
      const rows = await db.query<{ id: string; name: string }>(
        `SELECT o.id, o.name
         FROM organization o
         JOIN membership m ON m.organization_id = o.id
         WHERE m.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
         ORDER BY o.created_at`,
      );
      return rows.rows;
    });
  }

  async create(userId: string, name: string, country: string) {
    const trimmed = name.trim();
    if (!trimmed) throw new DomainException('country_invalid', 422);
    if (!/^[A-Za-z]{2}$/.test(country)) throw new DomainException('country_invalid', 422);
    return this.db.asUser(userId, async (db) => {
      const organization = await db.query<{ id: string; name: string }>(
        'INSERT INTO organization (name, country) VALUES ($1, $2) RETURNING id, name',
        [trimmed, country.toUpperCase()],
      );
      const created = organization.rows[0];
      await db.query(
        `INSERT INTO membership (organization_id, user_id, role) VALUES ($1, $2, 'owner')`,
        [created.id, userId],
      );
      await db.query(
        `INSERT INTO subscription (organization_id, plan_id, status)
         SELECT $1, id, 'internal' FROM plan WHERE code = 'fundador'`,
        [created.id],
      );
      return created;
    });
  }
}
