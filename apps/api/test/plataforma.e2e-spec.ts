import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { DbService } from '../src/db/db.service';
import { MailService } from '../src/mail/mail.service';
import { base32Decode, signWebhook, totpCode } from '../src/shared/crypto';
import { splitDonation } from '../src/shared/fees';

jest.setTimeout(60000);

describe('consola de plataforma', () => {
  let app: INestApplication<App>;
  let mail: MailService;
  let db: DbService;
  const password = 'clave-segura-12';

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('v1');
    await app.init();
    mail = app.get(MailService);
    db = app.get(DbService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('el operador supervisa los mismos hechos y no reescribe el libro', async () => {
    const stamp = Date.now();
    const ownerEmail = `plataforma-owner-${stamp}@example.test`;
    const operatorEmail = `plataforma-op-${stamp}@example.test`;
    const spareEmail = `plataforma-libre-${stamp}@example.test`;
    const owner = await account(app, mail, ownerEmail, password);
    await account(app, mail, spareEmail, password);
    const operator = await operatorAccount(
      app,
      mail,
      db,
      operatorEmail,
      password,
    );

    await request(app.getHttpServer())
      .get('/v1/platform/summary')
      .set('authorization', `Bearer ${owner}`)
      .expect(403)
      .expect({ code: 'operator_required' });
    await request(app.getHttpServer())
      .get('/v1/platform/summary')
      .set('authorization', `Bearer ${operator}`)
      .set('x-surface', 'tablet')
      .expect(422)
      .expect({ code: 'platform_web_only' });

    const created = await request(app.getHttpServer())
      .post('/v1/platform/organizations')
      .set('authorization', `Bearer ${operator}`)
      .send({ name: 'Causa de plataforma', country: 'MX', ownerEmail })
      .expect(201);
    expect(created.body.identityVerified).toBe(false);
    const membership = await db.asWorker((client) =>
      client.query(`SELECT role FROM membership WHERE organization_id = $1`, [
        created.body.id,
      ]),
    );
    expect(membership.rows).toEqual([{ role: 'owner' }]);
    const operatorMember = await db.asWorker((client) =>
      client.query(
        `SELECT 1 FROM membership m JOIN app_user u ON u.id = m.user_id
         WHERE m.organization_id = $1 AND u.email = $2`,
        [created.body.id, operatorEmail],
      ),
    );
    expect(operatorMember.rowCount).toBe(0);

    const campaign = await createCampaign(app, owner, created.body.id);
    await publishAndActivate(app, owner, created.body.id, campaign.id);
    const pending = await donate(app, campaign.slug, `plat-don-${stamp}`);
    await settle(app, `evt-plat-${stamp}`, pending.donationId);
    const ledgerBefore = await ledgerCount(db, campaign.id);

    const listed = await request(app.getHttpServer())
      .get('/v1/platform/campaigns')
      .set('authorization', `Bearer ${operator}`)
      .expect(200);
    const row = listed.body.find(
      (item: { id: string }) => item.id === campaign.id,
    );
    expect(row.grossMinor).toBe(2000);
    expect(row.grossMinor).not.toBe(splitDonation(2000, 0).netMinor);
    expect(row.hasLedger).toBe(true);

    await request(app.getHttpServer())
      .post(`/v1/platform/campaigns/${campaign.id}/pause`)
      .set('authorization', `Bearer ${operator}`)
      .expect(201)
      .expect({ id: campaign.id, status: 'pausada' });
    expect(await ledgerCount(db, campaign.id)).toBe(ledgerBefore);
    const paused = await request(app.getHttpServer())
      .get(`/v1/public/campaigns/${campaign.slug}`)
      .expect(200);
    expect(paused.body.status).toBe('pausada');
    expect(paused.body.donateEnabled).toBe(false);
    await request(app.getHttpServer())
      .post(`/v1/platform/campaigns/${campaign.id}/ledger`)
      .set('authorization', `Bearer ${operator}`)
      .expect(404);

    const webhook = await db.asWorker((client) =>
      client.query<{ id: string }>(
        `SELECT id FROM webhook_event WHERE provider = 'donations' AND event_id = $1`,
        [`evt-plat-${stamp}`],
      ),
    );
    const retried = await request(app.getHttpServer())
      .post(`/v1/platform/webhooks/${webhook.rows[0].id}/retry`)
      .set('authorization', `Bearer ${operator}`)
      .expect(201);
    expect(retried.body.result).toBe('already_applied');
    expect(await ledgerCount(db, campaign.id)).toBe(ledgerBefore);

    const income = await request(app.getHttpServer())
      .get('/v1/platform/income')
      .set('authorization', `Bearer ${operator}`)
      .expect(200);
    const fees = await db.asWorker((client) =>
      client.query<{ fees: string }>(
        `SELECT COALESCE(SUM(amount_minor), 0) AS fees FROM campaign_ledger_entry
         WHERE kind = 'platform_fee' AND created_at >= date_trunc('month', now())`,
      ),
    );
    const reported = income.body.reduce(
      (sum: number, item: { feesMinor: number }) => sum + item.feesMinor,
      0,
    );
    expect(reported).toBe(Number(fees.rows[0].fees));
    expect(JSON.stringify(income.body)).not.toContain('netMinor');
    const csv = await request(app.getHttpServer())
      .get('/v1/platform/income.csv')
      .set('authorization', `Bearer ${operator}`)
      .expect(200);
    expect(csv.text).toContain('suscripcion');
    expect(csv.text).toContain('comision');
    expect(csv.text).not.toContain('neto');

    await request(app.getHttpServer())
      .post(`/v1/platform/organizations/${created.body.id}/support`)
      .set('authorization', `Bearer ${operator}`)
      .expect(201);
    const visits = await request(app.getHttpServer())
      .get('/v1/support-access')
      .set('authorization', `Bearer ${owner}`)
      .expect(200);
    expect(visits.body[0].organization).toBe('Causa de plataforma');

    await request(app.getHttpServer())
      .post(`/v1/platform/users/${await userId(db, ownerEmail)}/remove`)
      .set('authorization', `Bearer ${operator}`)
      .expect(422)
      .expect({ code: 'membership_exists' });
    const spareId = await userId(db, spareEmail);
    const removed = await request(app.getHttpServer())
      .post(`/v1/platform/users/${spareId}/remove`)
      .set('authorization', `Bearer ${operator}`)
      .expect(201);
    expect(removed.body.blocked).toBe(true);
    await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: spareEmail, password })
      .expect(401)
      .expect({ code: 'account_blocked' });
  });
});

async function operatorAccount(
  app: INestApplication<App>,
  mail: MailService,
  db: DbService,
  email: string,
  password: string,
) {
  await request(app.getHttpServer())
    .post('/v1/auth/register')
    .send({ email, password })
    .expect(201);
  await request(app.getHttpServer())
    .post('/v1/auth/verify')
    .send({ token: mail.latest(email, 'verify')?.token })
    .expect(204);
  await db.asWorker((client) =>
    client.query(
      `UPDATE app_user SET platform_operator = true WHERE email = $1`,
      [email],
    ),
  );
  const login = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email, password })
    .expect(401);
  expect(login.body.code).toBe('mfa_enroll_required');
  const enrolled = await request(app.getHttpServer())
    .post('/v1/auth/mfa/enroll')
    .send({ ticket: login.body.ticket })
    .expect(200);
  const confirmed = await request(app.getHttpServer())
    .post('/v1/auth/mfa/confirm')
    .send({
      ticket: enrolled.body.ticket,
      code: totpCode(base32Decode(enrolled.body.secret)),
    })
    .expect(200);
  return confirmed.body.accessToken as string;
}

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
  await request(app.getHttpServer())
    .post('/v1/auth/verify')
    .send({ token: mail.latest(email, 'verify')?.token })
    .expect(204);
  const login = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email, password })
    .expect(200);
  return login.body.accessToken as string;
}

async function createCampaign(
  app: INestApplication<App>,
  token: string,
  organizationId: string,
) {
  const response = await request(app.getHttpServer())
    .post('/v1/campaigns')
    .set('authorization', `Bearer ${token}`)
    .set('x-organization-id', organizationId)
    .send({
      name: 'Rio de plataforma',
      currency: 'USD',
      kind: 'causa',
      jurisdiction: 'MX',
      timeZone: 'America/Mexico_City',
    })
    .expect(201);
  return response.body as { id: string; slug: string };
}

async function publishAndActivate(
  app: INestApplication<App>,
  token: string,
  organizationId: string,
  campaignId: string,
) {
  const draft = await request(app.getHttpServer())
    .post(`/v1/campaigns/${campaignId}/privacy-notices`)
    .set('authorization', `Bearer ${token}`)
    .set('x-organization-id', organizationId)
    .send({
      controller: 'Causa de plataforma',
      purpose: 'Recibir donativos para la consola',
      dataCategories: 'Nombre y correo del donante',
      retention: 'El plazo de la jurisdicción de la campaña',
    })
    .expect(201);
  await request(app.getHttpServer())
    .post(
      `/v1/campaigns/${campaignId}/privacy-notices/${draft.body.id}/publish`,
    )
    .set('authorization', `Bearer ${token}`)
    .set('x-organization-id', organizationId)
    .expect(200);
  await request(app.getHttpServer())
    .post(`/v1/campaigns/${campaignId}/activate`)
    .set('authorization', `Bearer ${token}`)
    .set('x-organization-id', organizationId)
    .expect(200);
}

async function donate(app: INestApplication<App>, slug: string, key: string) {
  const response = await request(app.getHttpServer())
    .post(`/v1/public/campaigns/${slug}/donations`)
    .set('idempotency-key', key)
    .send({
      amountMinor: 2000,
      currency: 'USD',
      donorName: 'Ana Ruiz',
      donorEmail: 'donante-plataforma@example.test',
      personKind: 'individual',
    })
    .expect(201);
  return response.body as { donationId: string };
}

async function settle(
  app: INestApplication<App>,
  eventId: string,
  donationId: string,
) {
  const split = splitDonation(2000, 0);
  const payload = JSON.stringify({
    id: eventId,
    donationId,
    grossMinor: 2000,
    netMinor: split.netMinor,
    processorFeeMinor: split.processorFeeMinor,
    platformFeeMinor: split.platformFeeMinor,
    currency: 'USD',
  });
  await request(app.getHttpServer())
    .post('/v1/webhooks/donations')
    .set('stripe-signature', signWebhook(payload))
    .send(payload)
    .expect(200);
}

async function ledgerCount(db: DbService, campaignId: string) {
  const rows = await db.asWorker((client) =>
    client.query<{ count: string }>(
      `SELECT count(*) FROM campaign_ledger_entry WHERE campaign_id = $1`,
      [campaignId],
    ),
  );
  return Number(rows.rows[0].count);
}

async function userId(db: DbService, email: string) {
  const rows = await db.asWorker((client) =>
    client.query<{ id: string }>(`SELECT id FROM app_user WHERE email = $1`, [
      email,
    ]),
  );
  return rows.rows[0].id;
}
