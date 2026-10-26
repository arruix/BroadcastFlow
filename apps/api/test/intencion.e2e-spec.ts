import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { MailService } from '../src/mail/mail.service';

jest.setTimeout(60000);

describe('intención de donar', () => {
  let app: INestApplication<App>;
  let mail: MailService;
  const password = 'clave-segura-12';
  const savedFlag = process.env.DONATIONS_SIMULATED_PAYMENTS;
  const savedEnv = process.env.NODE_ENV;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('v1');
    await app.init();
    mail = app.get(MailService);
  });

  afterAll(async () => {
    process.env.DONATIONS_SIMULATED_PAYMENTS = savedFlag;
    process.env.NODE_ENV = savedEnv;
    await app.close();
  });

  it('registra la intención sin cobrar y bloquea /pay salvo bandera explícita', async () => {
    const stamp = Date.now();
    const owner = await account(
      app,
      mail,
      `intencion-${stamp}@example.test`,
      password,
    );
    const org = await request(app.getHttpServer())
      .post('/v1/organizations')
      .set('authorization', `Bearer ${owner}`)
      .send({ name: 'Causa de la intención', country: 'MX' })
      .expect(201);
    const campaign = await createCampaign(
      app,
      owner,
      org.body.id,
      `Rio intencion ${stamp}`,
    );
    await publishAndActivate(app, owner, org.body.id, campaign.id);
    const pledge = await donate(app, campaign.slug, `intencion-${stamp}`);

    const receipt = await request(app.getHttpServer())
      .get(`/v1/public/donations/${pledge.donationId}`)
      .expect(200);
    expect(receipt.body.status).toBe('pendiente');

    delete process.env.DONATIONS_SIMULATED_PAYMENTS;
    await request(app.getHttpServer())
      .post(`/v1/public/donations/${pledge.donationId}/pay`)
      .expect(503)
      .expect({ code: 'payments_not_enabled' });

    process.env.DONATIONS_SIMULATED_PAYMENTS = 'false';
    await request(app.getHttpServer())
      .post(`/v1/public/donations/${pledge.donationId}/pay`)
      .expect(503);

    process.env.DONATIONS_SIMULATED_PAYMENTS = 'true';
    process.env.NODE_ENV = 'production';
    await request(app.getHttpServer())
      .post(`/v1/public/donations/${pledge.donationId}/pay`)
      .expect(503)
      .expect({ code: 'payments_not_enabled' });
    process.env.NODE_ENV = savedEnv;

    const still = await request(app.getHttpServer())
      .get(`/v1/public/donations/${pledge.donationId}`)
      .expect(200);
    expect(still.body.status).toBe('pendiente');

    const simulated = await request(app.getHttpServer())
      .post(`/v1/public/donations/${pledge.donationId}/pay`)
      .expect(200);
    expect(simulated.body.status).toBe('liquidada');
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
      donorEmail: 'donante-intencion@example.test',
      personKind: 'individual',
    })
    .expect(201);
  return response.body as { donationId: string };
}

