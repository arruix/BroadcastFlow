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

describe('historias 5 y 6', () => {
  let app: INestApplication<App>;
  let mail: MailService;
  let db: DbService;
  const password = 'clave-segura-12';

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('v1');
    await app.init();
    mail = app.get(MailService);
    db = app.get(DbService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('publica el aviso, cobra y deja tres asientos', async () => {
    const email = `aviso-${Date.now()}@example.test`;
    const session = await account(app, mail, email, password);
    const org = await request(app.getHttpServer())
      .post('/v1/organizations')
      .set('authorization', `Bearer ${session}`)
      .send({ name: 'Causa del aviso', country: 'MX' })
      .expect(201);
    const campaign = await createCampaign(app, session, org.body.id, `Rio aviso ${Date.now()}`, 'causa');

    const hidden = await request(app.getHttpServer()).get(`/v1/public/campaigns/${campaign.slug}`).expect(200);
    expect(hidden.body.notice).toBeNull();
    expect(hidden.body.donateEnabled).toBe(false);
    await request(app.getHttpServer())
      .post(`/v1/public/campaigns/${campaign.slug}/donations`)
      .set('idempotency-key', 'antes-del-aviso')
      .send(donationBody())
      .expect(422);

    const sample = await request(app.getHttpServer())
      .post(`/v1/campaigns/${campaign.id}/privacy-notices`)
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .send({
        controller: 'Responsable de ejemplo',
        purpose: 'Ayudar',
        dataCategories: 'Nombre y correo',
        retention: 'El plazo de la jurisdicción',
      })
      .expect(201);
    expect(sample.body.publishedAt).toBeNull();
    await request(app.getHttpServer())
      .post(`/v1/campaigns/${campaign.id}/privacy-notices/${sample.body.id}/publish`)
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .expect(422);

    const draft = await request(app.getHttpServer())
      .post(`/v1/campaigns/${campaign.id}/privacy-notices`)
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .send({
        controller: 'Causa del aviso',
        purpose: 'Recibir donativos para el río',
        dataCategories: 'Nombre y correo del donante',
        retention: 'El plazo de la jurisdicción de la campaña',
      })
      .expect(201);
    const published = await request(app.getHttpServer())
      .post(`/v1/campaigns/${campaign.id}/privacy-notices/${draft.body.id}/publish`)
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .expect(200);
    expect(published.body.publishedAt).toBeTruthy();

    const drafted = await request(app.getHttpServer()).get(`/v1/public/campaigns/${campaign.slug}`).expect(200);
    expect(drafted.body.notice.controller).toBe('Causa del aviso');
    expect(drafted.body.donateEnabled).toBe(false);
    const rejected = await request(app.getHttpServer())
      .post(`/v1/public/campaigns/${campaign.slug}/donations`)
      .set('idempotency-key', 'campana-en-borrador')
      .send(donationBody())
      .expect(422);
    expect(rejected.body.code).toBe('not_eligible');
    expect(await donationCount(db, campaign.id)).toBe(0);

    const active = await request(app.getHttpServer())
      .post(`/v1/campaigns/${campaign.id}/activate`)
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .expect(200);
    expect(active.body.status).toBe('activa');
    const open = await request(app.getHttpServer()).get(`/v1/public/campaigns/${campaign.slug}`).expect(200);
    expect(open.body.donateEnabled).toBe(true);

    await db.asWorker((client) =>
      client.query(
        `UPDATE subscription SET plan_id = (SELECT id FROM plan WHERE code = 'campana') WHERE organization_id = $1`,
        [org.body.id],
      ),
    );
    const split = splitDonation(10000, 150);
    const pending = await request(app.getHttpServer())
      .post(`/v1/public/campaigns/${campaign.slug}/donations`)
      .set('idempotency-key', 'donacion-rio-01')
      .send(donationBody())
      .expect(201);
    const replay = await request(app.getHttpServer())
      .post(`/v1/public/campaigns/${campaign.slug}/donations`)
      .set('idempotency-key', 'donacion-rio-01')
      .send(donationBody())
      .expect(201);
    expect(replay.body.donationId).toBe(pending.body.donationId);
    expect(await donationCount(db, campaign.id)).toBe(1);

    const otherCurrency = await request(app.getHttpServer())
      .post(`/v1/public/campaigns/${campaign.slug}/donations`)
      .set('idempotency-key', 'moneda-distinta')
      .send({ ...donationBody(), currency: 'EUR' })
      .expect(422);
    expect(otherCurrency.body.code).toBe('not_eligible');
    expect(await donationCount(db, campaign.id)).toBe(1);

    const bad = JSON.stringify({ id: 'evt-mal', donationId: pending.body.donationId, ...split, grossMinor: 1, currency: 'USD' });
    await request(app.getHttpServer())
      .post('/v1/webhooks/donations')
      .set('stripe-signature', 't=1,v1=0000')
      .set('content-type', 'application/json')
      .send(bad)
      .expect(400);
    await request(app.getHttpServer())
      .post('/v1/webhooks/donations')
      .set('stripe-signature', signWebhook(bad))
      .set('content-type', 'application/json')
      .send(bad)
      .expect(422);
    expect(await ledgerCount(db, pending.body.donationId)).toBe(0);

    const good = JSON.stringify({
      id: 'evt-bien',
      donationId: pending.body.donationId,
      grossMinor: 10000,
      netMinor: split.netMinor,
      processorFeeMinor: split.processorFeeMinor,
      platformFeeMinor: split.platformFeeMinor,
      currency: 'USD',
    });
    await request(app.getHttpServer())
      .post('/v1/webhooks/donations')
      .set('stripe-signature', signWebhook(good))
      .set('content-type', 'application/json')
      .send(good)
      .expect(200);
    await request(app.getHttpServer())
      .post('/v1/webhooks/donations')
      .set('stripe-signature', signWebhook(good))
      .set('content-type', 'application/json')
      .send(good)
      .expect(200);
    expect(await ledgerCount(db, pending.body.donationId)).toBe(3);

    const receipt = await request(app.getHttpServer()).get(`/v1/public/donations/${pending.body.donationId}`).expect(200);
    expect(receipt.body.status).toBe('liquidada');
    expect(receipt.body.fiscalReceipt).toBe(false);
    expect(receipt.body.grossMinor).toBe(10000);
    expect(receipt.body.grossMinor).toBe(receipt.body.netMinor + receipt.body.processorFeeMinor + receipt.body.platformFeeMinor);
    expect(mail.latest('donante@example.test', 'receipt')?.token).toBe(pending.body.donationId);
  });

  it('la comercial no abre página y la electoral no sale de borrador', async () => {
    const email = `comercial-${Date.now()}@example.test`;
    const session = await account(app, mail, email, password);
    const org = await request(app.getHttpServer())
      .post('/v1/organizations')
      .set('authorization', `Bearer ${session}`)
      .send({ name: 'Tienda', country: 'MX' })
      .expect(201);
    const shop = await createCampaign(app, session, org.body.id, `Tienda ${Date.now()}`, 'comercial');
    const notice = await request(app.getHttpServer())
      .post(`/v1/campaigns/${shop.id}/privacy-notices`)
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .send({
        controller: 'Tienda',
        purpose: 'Mostrar productos',
        dataCategories: 'Ningún dato de donante',
        retention: 'No aplica',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/v1/campaigns/${shop.id}/privacy-notices/${notice.body.id}/publish`)
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/v1/campaigns/${shop.id}/activate`)
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .expect(200);
    const blocked = await request(app.getHttpServer())
      .post(`/v1/public/campaigns/${shop.slug}/donations`)
      .set('idempotency-key', 'comercial-no-cobra')
      .send(donationBody())
      .expect(422);
    expect(blocked.body.code).toBe('commercial_has_no_donation_page');
    expect(await donationCount(db, shop.id)).toBe(0);

    const electoral = await createCampaign(app, session, org.body.id, `Voto ${Date.now()}`, 'electoral');
    await request(app.getHttpServer())
      .post(`/v1/campaigns/${electoral.id}/activate`)
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .expect(422);
  });
});

function donationBody() {
  return {
    amountMinor: 10000,
    currency: 'USD',
    donorName: 'Ana Ruiz',
    donorEmail: 'donante@example.test',
    personKind: 'individual',
  };
}

async function account(app: INestApplication<App>, mail: MailService, email: string, password: string) {
  await request(app.getHttpServer()).post('/v1/auth/register').send({ email, password }).expect(201);
  await request(app.getHttpServer()).post('/v1/auth/verify').send({ token: mail.latest(email, 'verify')?.token }).expect(204);
  const login = await request(app.getHttpServer()).post('/v1/auth/login').send({ email, password }).expect(200);
  return login.body.accessToken as string;
}

async function createCampaign(app: INestApplication<App>, token: string, organizationId: string, name: string, kind: string) {
  const response = await request(app.getHttpServer())
    .post('/v1/campaigns')
    .set('authorization', `Bearer ${token}`)
    .set('x-organization-id', organizationId)
    .send({
      name,
      currency: 'USD',
      kind,
      jurisdiction: 'MX',
      timeZone: 'America/Mexico_City',
    })
    .expect(201);
  return response.body as { id: string; slug: string };
}

async function donationCount(db: DbService, campaignId: string) {
  const rows = await db.asWorker((client) =>
    client.query<{ count: string }>('SELECT count(*) FROM donation WHERE campaign_id = $1', [campaignId]),
  );
  return Number(rows.rows[0].count);
}

async function ledgerCount(db: DbService, donationId: string) {
  const rows = await db.asWorker((client) =>
    client.query<{ count: string }>('SELECT count(*) FROM campaign_ledger_entry WHERE donation_id = $1', [donationId]),
  );
  return Number(rows.rows[0].count);
}
