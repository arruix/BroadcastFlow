import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { DbService } from '../src/db/db.service';
import { MailService } from '../src/mail/mail.service';

jest.setTimeout(60000);

describe('equipo', () => {
  let app: INestApplication<App>;
  let mail: MailService;
  let db: DbService;
  const password = 'clave-segura-12';
  const ownerEmail = `owner-equipo-${Date.now()}@example.test`;
  const memberEmail = `miembro-equipo-${Date.now()}@example.test`;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    mail = app.get(MailService);
    db = app.get(DbService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('invita cuando hay asiento, acepta y da de baja', async () => {
    const owner = await account(app, mail, ownerEmail, password);
    const org = await request(app.getHttpServer())
      .post('/v1/organizations')
      .set('authorization', `Bearer ${owner}`)
      .send({ name: 'Causa del equipo', country: 'MX' })
      .expect(201);

    const listed = await request(app.getHttpServer())
      .get('/v1/organizations')
      .set('authorization', `Bearer ${owner}`)
      .expect(200);
    expect(listed.body[0].role).toBe('owner');

    const blocked = await request(app.getHttpServer())
      .post(`/v1/organizations/${org.body.id}/invitations`)
      .set('authorization', `Bearer ${owner}`)
      .send({ email: memberEmail, role: 'analyst' })
      .expect(422);
    expect(blocked.body.code).toBe('seat_unavailable');

    await db.asWorker((client) =>
      client.query(
        `UPDATE subscription
         SET plan_id = (SELECT id FROM plan WHERE code = 'campana'), status = 'active'
         WHERE organization_id = $1`,
        [org.body.id],
      ),
    );

    const invited = await request(app.getHttpServer())
      .post(`/v1/organizations/${org.body.id}/invitations`)
      .set('authorization', `Bearer ${owner}`)
      .send({ email: memberEmail, role: 'analyst' })
      .expect(201);
    expect(invited.body.token).toBeUndefined();
    expect(invited.body.email).toBe(memberEmail);
    const token = mail.latest(memberEmail, 'invite')?.token;
    expect(token).toBeTruthy();
    expect(JSON.stringify(invited.body)).not.toContain(token);

    const member = await account(app, mail, memberEmail, password);
    const denied = await request(app.getHttpServer())
      .post(`/v1/organizations/${org.body.id}/invitations`)
      .set('authorization', `Bearer ${member}`)
      .send({ email: `otro-${Date.now()}@example.test`, role: 'editor' })
      .expect(403);
    expect(denied.body.code).toBe('forbidden');

    await request(app.getHttpServer())
      .post('/v1/invitations/accept')
      .set('authorization', `Bearer ${member}`)
      .send({ token: 'vencido' })
      .expect(422);
    const accepted = await request(app.getHttpServer())
      .post('/v1/invitations/accept')
      .set('authorization', `Bearer ${member}`)
      .send({ token })
      .expect(200);
    expect(accepted.body.id).toBe(org.body.id);

    const team = await request(app.getHttpServer())
      .get(`/v1/organizations/${org.body.id}/members`)
      .set('authorization', `Bearer ${owner}`)
      .expect(200);
    const analyst = team.body.members.find(
      (row: { email: string }) => row.email === memberEmail,
    );
    expect(analyst.role).toBe('analyst');

    await request(app.getHttpServer())
      .delete(`/v1/organizations/${org.body.id}/members/${analyst.id}`)
      .set('authorization', `Bearer ${owner}`)
      .expect(204);

    const after = await request(app.getHttpServer())
      .get(`/v1/organizations/${org.body.id}/members`)
      .set('authorization', `Bearer ${owner}`)
      .expect(200);
    expect(
      after.body.members.some(
        (row: { email: string }) => row.email === memberEmail,
      ),
    ).toBe(false);

    const ownerRow = after.body.members.find(
      (row: { role: string }) => row.role === 'owner',
    );
    await request(app.getHttpServer())
      .delete(`/v1/organizations/${org.body.id}/members/${ownerRow.id}`)
      .set('authorization', `Bearer ${owner}`)
      .expect(403);
  });
});

async function account(
  app: INestApplication<App>,
  mail: MailService,
  email: string,
  password: string,
) {
  await request(app.getHttpServer())
    .post('/v1/auth/register')
    .send({ email, password })
    .expect(201);
  const token = mail.latest(email, 'verify')?.token;
  await request(app.getHttpServer())
    .post('/v1/auth/verify')
    .send({ token })
    .expect(204);
  const login = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email, password })
    .expect(200);
  return login.body.accessToken as string;
}
