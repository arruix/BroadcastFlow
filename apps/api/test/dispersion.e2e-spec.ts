import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { DbService } from '../src/db/db.service';
import { PayoutGateway } from '../src/libro/payout.gateway';
import { MailService } from '../src/mail/mail.service';
import { signWebhook } from '../src/shared/crypto';
import { splitDonation } from '../src/shared/fees';

jest.setTimeout(60000);

describe('historia 12', () => {
  let app: INestApplication<App>;
  let mail: MailService;
  let db: DbService;
  let gateway: PayoutGateway;
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
    gateway = app.get(PayoutGateway);
  });

  afterAll(async () => {
    gateway.outcome = 'ok';
    await app.close();
  });

  it('por encima de 100000 USD el otro owner aprueba y una disputa reserva el neto', async () => {
    gateway.outcome = 'ok';
    gateway.sent = [];
    const stamp = Date.now();
    const email = `libro-${stamp}@example.test`;
    const owner = await account(app, mail, email, password);
    const secondEmail = `libro-owner-${stamp}@example.test`;
    const second = await account(app, mail, secondEmail, password);
    const editorEmail = `libro-editor-${stamp}@example.test`;
    const editor = await account(app, mail, editorEmail, password);
    const org = await request(app.getHttpServer())
      .post('/v1/organizations')
      .set('authorization', `Bearer ${owner}`)
      .send({ name: 'Causa del libro', country: 'MX' })
      .expect(201);
    await db.asWorker((client) =>
      client.query(
        `INSERT INTO membership (organization_id, user_id, role) SELECT $1, id, 'editor' FROM app_user WHERE email = $2`,
        [org.body.id, editorEmail],
      ),
    );
    const campaign = await createCampaign(
      app,
      owner,
      org.body.id,
      'Rio del libro',
      'USD',
    );
    await publishAndActivate(app, owner, org.body.id, campaign.id);
    const small = await donate(app, campaign.slug, 2000, `libro-peq-${stamp}`);
    const large = await donate(
      app,
      campaign.slug,
      110000,
      `libro-gra-${stamp}`,
    );
    await settle(app, `evt-libro-peq-${stamp}`, small.donationId, 2000);
    await settle(app, `evt-libro-gra-${stamp}`, large.donationId, 110000);

    await elevate(db, email);
    await request(app.getHttpServer())
      .post(`/v1/campaigns/${campaign.id}/payouts`)
      .set('authorization', `Bearer ${owner}`)
      .set('x-organization-id', org.body.id)
      .send({ amountMinor: 1000 })
      .expect(422)
      .expect({ code: 'identity_unverified' });
    await request(app.getHttpServer())
      .post(`/v1/organizations/${org.body.id}/identity`)
      .set('authorization', `Bearer ${owner}`)
      .set('x-organization-id', org.body.id)
      .send({ legalName: 'Causa del libro AC' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/v1/organizations/${org.body.id}/payout-account`)
      .set('authorization', `Bearer ${owner}`)
      .set('x-organization-id', org.body.id)
      .send({ destinationRef: 'CUENTA1234', currency: 'USD' })
      .expect(201);

    await dropStep(db, email);
    await request(app.getHttpServer())
      .post(`/v1/campaigns/${campaign.id}/payouts`)
      .set('authorization', `Bearer ${owner}`)
      .set('x-organization-id', org.body.id)
      .send({ amountMinor: 1000 })
      .expect(422)
      .expect({ code: 'step_up_required' });
    await request(app.getHttpServer())
      .get(`/v1/campaigns/${campaign.id}/ledger`)
      .set('authorization', `Bearer ${editor}`)
      .set('x-organization-id', org.body.id)
      .expect(403);

    const opened = JSON.stringify({
      id: `evt-libro-disputa-${stamp}`,
      type: 'dispute_opened',
      donationId: small.donationId,
    });
    await request(app.getHttpServer())
      .post('/v1/webhooks/donations')
      .set('stripe-signature', signWebhook(opened))
      .send(opened)
      .expect(200);
    await request(app.getHttpServer())
      .post('/v1/webhooks/donations')
      .set('stripe-signature', signWebhook(opened))
      .send(opened)
      .expect(200);
    const disputes = await request(app.getHttpServer())
      .get(`/v1/campaigns/${campaign.id}/disputes`)
      .set('authorization', `Bearer ${owner}`)
      .set('x-organization-id', org.body.id)
      .expect(200);
    expect(disputes.body).toHaveLength(1);
    expect(disputes.body[0].status).toBe('disputada');
    expect(disputes.body[0].dueAt).toEqual(expect.any(String));

    await elevate(db, email);
    const held = splitDonation(110000, 0).netMinor;
    const book = await request(app.getHttpServer())
      .get(`/v1/campaigns/${campaign.id}/ledger`)
      .set('authorization', `Bearer ${owner}`)
      .set('x-organization-id', org.body.id)
      .expect(200);
    expect(book.body.availableMinor).toBe(held);

    const pending = await request(app.getHttpServer())
      .post(`/v1/campaigns/${campaign.id}/payouts`)
      .set('authorization', `Bearer ${owner}`)
      .set('x-organization-id', org.body.id)
      .send({ amountMinor: 100001 })
      .expect(201);
    expect(pending.body.status).toBe('requested');
    expect(gateway.sent).toHaveLength(0);
    await request(app.getHttpServer())
      .post(`/v1/payouts/${pending.body.id}/approve`)
      .set('authorization', `Bearer ${owner}`)
      .set('x-organization-id', org.body.id)
      .expect(422)
      .expect({ code: 'approval_invalid' });

    await request(app.getHttpServer())
      .post(`/v1/organizations/${org.body.id}/owners`)
      .set('authorization', `Bearer ${owner}`)
      .set('x-organization-id', org.body.id)
      .send({ email: secondEmail })
      .expect(201);
    await elevate(db, secondEmail);
    const approved = await request(app.getHttpServer())
      .post(`/v1/payouts/${pending.body.id}/approve`)
      .set('authorization', `Bearer ${second}`)
      .set('x-organization-id', org.body.id)
      .expect(201);
    expect(approved.body.status).toBe('sent');
    expect(gateway.sent).toEqual([pending.body.id]);

    const won = JSON.stringify({
      id: `evt-libro-gana-${stamp}`,
      type: 'dispute_won',
      donationId: small.donationId,
    });
    await request(app.getHttpServer())
      .post('/v1/webhooks/donations')
      .set('stripe-signature', signWebhook(won))
      .send(won)
      .expect(200);
    const restored = await request(app.getHttpServer())
      .get(`/v1/campaigns/${campaign.id}/ledger`)
      .set('authorization', `Bearer ${owner}`)
      .set('x-organization-id', org.body.id)
      .expect(200);
    expect(restored.body.availableMinor).toBe(
      held - 100001 + splitDonation(2000, 0).netMinor,
    );
    const closed = await request(app.getHttpServer())
      .get(`/v1/campaigns/${campaign.id}/disputes`)
      .set('authorization', `Bearer ${owner}`)
      .set('x-organization-id', org.body.id)
      .expect(200);
    expect(closed.body).toHaveLength(0);

    const extra = await donate(
      app,
      campaign.slug,
      2000,
      `libro-extra-${stamp}`,
    );
    await settle(app, `evt-libro-extra-${stamp}`, extra.donationId, 2000);
    const lost = JSON.stringify({
      id: `evt-libro-pierde-${stamp}`,
      type: 'dispute_opened',
      donationId: extra.donationId,
    });
    await request(app.getHttpServer())
      .post('/v1/webhooks/donations')
      .set('stripe-signature', signWebhook(lost))
      .send(lost)
      .expect(200);
    const decided = JSON.stringify({
      id: `evt-libro-perdida-${stamp}`,
      type: 'dispute_lost',
      donationId: extra.donationId,
    });
    await request(app.getHttpServer())
      .post('/v1/webhooks/donations')
      .set('stripe-signature', signWebhook(decided))
      .send(decided)
      .expect(200);
    const holds = await db.asWorker((client) =>
      client.query(
        `SELECT kind FROM campaign_ledger_entry WHERE donation_id = $1 AND kind IN ('dispute_hold', 'dispute_release')`,
        [extra.donationId],
      ),
    );
    expect(holds.rows.map((row) => row.kind)).toEqual(['dispute_hold']);

    gateway.outcome = 'failed';
    const failed = await request(app.getHttpServer())
      .post(`/v1/campaigns/${campaign.id}/payouts`)
      .set('authorization', `Bearer ${owner}`)
      .set('x-organization-id', org.body.id)
      .send({ amountMinor: splitDonation(2000, 0).netMinor })
      .expect(201);
    expect(failed.body.status).toBe('failed');
    const afterFail = await request(app.getHttpServer())
      .get(`/v1/campaigns/${campaign.id}/ledger`)
      .set('authorization', `Bearer ${owner}`)
      .set('x-organization-id', org.body.id)
      .expect(200);
    expect(afterFail.body.availableMinor).toBe(restored.body.availableMinor);

    const report = await request(app.getHttpServer())
      .post(`/v1/campaigns/${campaign.id}/ledger/report`)
      .set('authorization', `Bearer ${owner}`)
      .set('x-organization-id', org.body.id)
      .set('x-surface', 'tablet')
      .expect(201);
    const pdf = await request(app.getHttpServer())
      .get(`/v1/reports/${report.body.id}`)
      .set('authorization', `Bearer ${owner}`)
      .set('x-organization-id', org.body.id)
      .expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    const bytes = Buffer.isBuffer(pdf.body) ? pdf.body : Buffer.from(pdf.text);
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF');

    await dropStep(db, email);
    await request(app.getHttpServer())
      .post('/v1/subscriptions/checkout')
      .set('authorization', `Bearer ${owner}`)
      .set('x-organization-id', org.body.id)
      .send({ plan: 'campana' })
      .expect(422)
      .expect({ code: 'step_up_required' });
    await elevate(db, email);
    await request(app.getHttpServer())
      .post('/v1/subscriptions/checkout')
      .set('authorization', `Bearer ${owner}`)
      .set('x-organization-id', org.body.id)
      .send({ plan: 'campana' })
      .expect(201);
    gateway.outcome = 'ok';
  });

  it('una dispersión en otra moneda espera al otro owner', async () => {
    gateway.outcome = 'ok';
    gateway.sent = [];
    const stamp = Date.now();
    const email = `libro-mxn-${stamp}@example.test`;
    const owner = await account(app, mail, email, password);
    const secondEmail = `libro-mxn-owner-${stamp}@example.test`;
    await account(app, mail, secondEmail, password);
    const org = await request(app.getHttpServer())
      .post('/v1/organizations')
      .set('authorization', `Bearer ${owner}`)
      .send({ name: 'Causa en pesos', country: 'MX' })
      .expect(201);
    const campaign = await createCampaign(
      app,
      owner,
      org.body.id,
      'Rio en pesos',
      'MXN',
    );
    await publishAndActivate(app, owner, org.body.id, campaign.id);
    const pending = await donate(
      app,
      campaign.slug,
      2000,
      `libro-mxn-${stamp}`,
      'MXN',
    );
    await settle(
      app,
      `evt-libro-mxn-${stamp}`,
      pending.donationId,
      2000,
      'MXN',
    );
    await elevate(db, email);
    await request(app.getHttpServer())
      .post(`/v1/organizations/${org.body.id}/identity`)
      .set('authorization', `Bearer ${owner}`)
      .set('x-organization-id', org.body.id)
      .send({ legalName: 'Causa en pesos AC' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/v1/organizations/${org.body.id}/payout-account`)
      .set('authorization', `Bearer ${owner}`)
      .set('x-organization-id', org.body.id)
      .send({ destinationRef: 'CLABE1234', currency: 'MXN' })
      .expect(201);
    const payout = await request(app.getHttpServer())
      .post(`/v1/campaigns/${campaign.id}/payouts`)
      .set('authorization', `Bearer ${owner}`)
      .set('x-organization-id', org.body.id)
      .send({ amountMinor: splitDonation(2000, 0).netMinor })
      .expect(201);
    expect(payout.body.status).toBe('requested');
    expect(gateway.sent).toHaveLength(0);
  });
});

async function elevate(db: DbService, email: string) {
  await db.asWorker((client) =>
    client.query(
      `UPDATE session SET step_up_until = now() + interval '10 minutes'
       WHERE user_id = (SELECT id FROM app_user WHERE email = $1)`,
      [email],
    ),
  );
}

async function dropStep(db: DbService, email: string) {
  await db.asWorker((client) =>
    client.query(
      `UPDATE session SET step_up_until = NULL WHERE user_id = (SELECT id FROM app_user WHERE email = $1)`,
      [email],
    ),
  );
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
  currency: string,
) {
  const response = await request(app.getHttpServer())
    .post('/v1/campaigns')
    .set('authorization', `Bearer ${token}`)
    .set('x-organization-id', organizationId)
    .send({
      name,
      currency,
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
      controller: 'Causa del libro',
      purpose: 'Recibir donativos para el libro',
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

async function donate(
  app: INestApplication<App>,
  slug: string,
  amountMinor: number,
  key: string,
  currency = 'USD',
) {
  const response = await request(app.getHttpServer())
    .post(`/v1/public/campaigns/${slug}/donations`)
    .set('idempotency-key', key)
    .send({
      amountMinor,
      currency,
      donorName: 'Ana Ruiz',
      donorEmail: 'donante-libro@example.test',
      personKind: 'individual',
      consent: true,
    })
    .expect(201);
  return response.body as { donationId: string };
}

async function settle(
  app: INestApplication<App>,
  eventId: string,
  donationId: string,
  grossMinor: number,
  currency = 'USD',
) {
  const split = splitDonation(grossMinor, 0);
  const payload = JSON.stringify({
    id: eventId,
    donationId,
    grossMinor,
    netMinor: split.netMinor,
    processorFeeMinor: split.processorFeeMinor,
    platformFeeMinor: split.platformFeeMinor,
    currency,
  });
  await request(app.getHttpServer())
    .post('/v1/webhooks/donations')
    .set('stripe-signature', signWebhook(payload))
    .send(payload)
    .expect(200);
}
