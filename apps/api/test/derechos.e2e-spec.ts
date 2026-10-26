import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { DbService } from '../src/db/db.service';
import { MailService } from '../src/mail/mail.service';
import { signWebhook } from '../src/shared/crypto';
import { splitDonation } from '../src/shared/fees';

jest.setTimeout(60000);

describe('historia 16', () => {
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

  it('vacía nombre y correo a los cinco años y deja el bruto del libro', async () => {
    const stamp = Date.now();
    const email = `derechos-${stamp}@example.test`;
    const owner = await account(app, mail, email, password);
    const treasurerEmail = `derechos-tesorero-${stamp}@example.test`;
    const treasurer = await account(app, mail, treasurerEmail, password);
    const editorEmail = `derechos-editor-${stamp}@example.test`;
    const editor = await account(app, mail, editorEmail, password);
    const org = await request(app.getHttpServer())
      .post('/v1/organizations')
      .set('authorization', `Bearer ${owner}`)
      .send({ name: 'Causa de los derechos', country: 'MX' })
      .expect(201);
    await db.asWorker((client) =>
      client.query(
        `INSERT INTO membership (organization_id, user_id, role)
         SELECT $1, id, role FROM app_user
         JOIN (VALUES ($2::text, 'treasurer'), ($3::text, 'editor')) AS member(email, role) USING (email)`,
        [org.body.id, treasurerEmail, editorEmail],
      ),
    );
    const campaign = await createCampaign(
      app,
      owner,
      org.body.id,
      `Rio derechos ${stamp}`,
    );
    const noticeId = await publishAndActivate(
      app,
      owner,
      org.body.id,
      campaign.id,
    );
    const donated = await donate(app, campaign.slug, `derechos-${stamp}`);
    await settle(app, `evt-derechos-${stamp}`, donated.donationId, 2000);
    const ledgerBefore = await ledgerCount(db, campaign.id);

    await request(app.getHttpServer())
      .post(`/v1/donations/${donated.donationId}/rights`)
      .set('authorization', `Bearer ${editor}`)
      .set('x-organization-id', org.body.id)
      .send({ action: 'access' })
      .expect(403);

    const access = await request(app.getHttpServer())
      .post(`/v1/donations/${donated.donationId}/rights`)
      .set('authorization', `Bearer ${treasurer}`)
      .set('x-organization-id', org.body.id)
      .send({ action: 'access' })
      .expect(200);
    expect(access.body.donorName).toBe('Ana Ruiz');
    expect(access.body.privacyNoticeId).toBe(noticeId);
    expect(access.body.grossMinor).toBe(2000);
    expect(access.body.fiscalReceipt).toBe(false);

    const rectified = await request(app.getHttpServer())
      .post(`/v1/donations/${donated.donationId}/rights`)
      .set('authorization', `Bearer ${owner}`)
      .set('x-organization-id', org.body.id)
      .send({
        action: 'rectify',
        donorName: 'Ana López',
        donorEmail: 'ana.lopez@example.test',
      })
      .expect(200);
    expect(rectified.body.donorName).toBe('Ana López');
    expect(rectified.body.donorEmail).toBe('ana.lopez@example.test');
    expect(rectified.body.grossMinor).toBe(2000);
    expect(rectified.body.privacyNoticeId).toBe(noticeId);

    await request(app.getHttpServer())
      .post(`/v1/donations/${donated.donationId}/rights`)
      .set('authorization', `Bearer ${owner}`)
      .set('x-organization-id', org.body.id)
      .send({ action: 'cancel' })
      .expect(422)
      .expect({ code: 'rights_retention_active' });

    await db.asWorker((client) =>
      client.query(
        `UPDATE donation SET created_at = now() - interval '5 years' - interval '1 day' WHERE id = $1`,
        [donated.donationId],
      ),
    );

    const cleared = await request(app.getHttpServer())
      .post(`/v1/donations/${donated.donationId}/rights`)
      .set('authorization', `Bearer ${owner}`)
      .set('x-organization-id', org.body.id)
      .send({ action: 'oppose' })
      .expect(200);
    expect(cleared.body.donorName).toBeNull();
    expect(cleared.body.donorEmail).toBeNull();
    expect(cleared.body.anonymizedAt).toEqual(expect.any(String));
    expect(cleared.body.grossMinor).toBe(2000);
    expect(cleared.body.privacyNoticeId).toBe(noticeId);
    expect(await ledgerCount(db, campaign.id)).toBe(ledgerBefore);

    await request(app.getHttpServer())
      .post(`/v1/donations/${donated.donationId}/rights`)
      .set('authorization', `Bearer ${owner}`)
      .set('x-organization-id', org.body.id)
      .send({
        action: 'rectify',
        donorName: 'Otra',
        donorEmail: 'otra@example.test',
      })
      .expect(422)
      .expect({ code: 'not_eligible' });

    const again = await request(app.getHttpServer())
      .post(`/v1/donations/${donated.donationId}/rights`)
      .set('authorization', `Bearer ${owner}`)
      .set('x-organization-id', org.body.id)
      .send({ action: 'cancel' })
      .expect(200);
    expect(again.body.anonymizedAt).toBe(cleared.body.anonymizedAt);

    const receipt = await request(app.getHttpServer())
      .get(`/v1/public/donations/${donated.donationId}`)
      .expect(200);
    expect(receipt.body.donorName).toBeNull();
    expect(receipt.body.grossMinor).toBe(2000);
  });
});

async function ledgerCount(db: DbService, campaignId: string) {
  const rows = await db.asWorker((client) =>
    client.query<{ count: string }>(
      `SELECT count(*) FROM campaign_ledger_entry WHERE campaign_id = $1`,
      [campaignId],
    ),
  );
  return Number(rows.rows[0].count);
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
  name: string,
) {
  const response = await request(app.getHttpServer())
    .post('/v1/campaigns')
    .set('authorization', `Bearer ${token}`)
    .set('x-organization-id', organizationId)
    .send({
      name,
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
      controller: 'Causa de los derechos',
      purpose: 'Recibir donativos',
      dataCategories: 'Nombre y correo del donante',
      retention: 'Cinco años desde la donación',
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
  return draft.body.id as string;
}

async function donate(app: INestApplication<App>, slug: string, key: string) {
  const response = await request(app.getHttpServer())
    .post(`/v1/public/campaigns/${slug}/donations`)
    .set('idempotency-key', key)
    .send({
      amountMinor: 2000,
      currency: 'USD',
      donorName: 'Ana Ruiz',
      donorEmail: 'donante-derechos@example.test',
      personKind: 'individual',
    })
    .expect(201);
  return response.body as { donationId: string };
}

async function settle(
  app: INestApplication<App>,
  eventId: string,
  donationId: string,
  grossMinor: number,
) {
  const split = splitDonation(grossMinor, 0);
  const payload = JSON.stringify({
    id: eventId,
    donationId,
    grossMinor,
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
