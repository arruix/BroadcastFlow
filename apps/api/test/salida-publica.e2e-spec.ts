import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { MailService } from '../src/mail/mail.service';

jest.setTimeout(60000);

describe('salida pública honesta', () => {
  let app: INestApplication<App>;
  let mail: MailService;
  const password = 'clave-segura-12';

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
    await app.close();
  });

  it('guarda la historia en la primera organización y el borrador sigue siendo público', async () => {
    const stamp = Date.now();
    const email = `salida-${stamp}@example.test`;
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
    const token = login.body.accessToken as string;

    const campaign = await request(app.getHttpServer())
      .post('/v1/campaigns')
      .set('authorization', `Bearer ${token}`)
      .send({
        name: `Rio salida ${stamp}`,
        currency: 'MXN',
        kind: 'causa',
        jurisdiction: 'MX',
        timeZone: 'America/Mexico_City',
        paymentLinkUrl: 'https://mpago.la/salida',
      })
      .expect(201);
    expect(campaign.body.organizationId).toMatch(
      /^[0-9a-f-]{36}$/i,
    );
    expect(campaign.body.status).toBe('borrador');

    await request(app.getHttpServer())
      .put(`/v1/campaigns/${campaign.body.id}/share`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', campaign.body.organizationId)
      .send({
        title: `Rio salida ${stamp}`,
        description: 'La historia que antes se perdía',
      })
      .expect(200);

    const draft = await request(app.getHttpServer())
      .get(`/v1/public/campaigns/${campaign.body.slug}`)
      .expect(200);
    expect(draft.body.status).toBe('borrador');
    expect(draft.body.share.description).toBe(
      'La historia que antes se perdía',
    );
    expect(draft.body.paymentMethod).toBeNull();
    expect(draft.body.donateEnabled).toBe(false);
  });

  it('el recibo público no devuelve el correo y los derechos sí', async () => {
    const stamp = Date.now();
    const email = `recibo-${stamp}@example.test`;
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
    const token = login.body.accessToken as string;
    const created = await request(app.getHttpServer())
      .post('/v1/campaigns')
      .set('authorization', `Bearer ${token}`)
      .send({
        name: `Rio recibo ${stamp}`,
        currency: 'MXN',
        kind: 'causa',
        jurisdiction: 'MX',
        timeZone: 'America/Mexico_City',
      })
      .expect(201);
    const org = created.body.organizationId as string;
    const notice = await request(app.getHttpServer())
      .post(`/v1/campaigns/${created.body.id}/privacy-notices`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', org)
      .send({
        controller: 'Causa salida',
        purpose: 'Recibir apoyo externo',
        dataCategories: 'Nombre y correo',
        retention: 'Cinco años desde la donación',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(
        `/v1/campaigns/${created.body.id}/privacy-notices/${notice.body.id}/publish`,
      )
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', org)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/v1/campaigns/${created.body.id}/activate`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', org)
      .expect(200);

    const pledge = await request(app.getHttpServer())
      .post(`/v1/public/campaigns/${created.body.slug}/donations`)
      .set('idempotency-key', `salida-${stamp}`)
      .send({
        amountMinor: 2500,
        currency: 'MXN',
        donorName: 'Ana Ruiz',
        donorEmail: 'ana.salida@example.test',
        consent: true,
      })
      .expect(201);
    expect(pledge.body.clientSecret).toBeUndefined();

    const receipt = await request(app.getHttpServer())
      .get(`/v1/public/donations/${pledge.body.donationId}`)
      .expect(200);
    expect(receipt.body.status).toBe('pendiente');
    expect(receipt.body).not.toHaveProperty('donorName');
    expect(receipt.body).not.toHaveProperty('donorEmail');

    const rights = await request(app.getHttpServer())
      .post(`/v1/donations/${pledge.body.donationId}/rights`)
      .set('authorization', `Bearer ${token}`)
      .set('x-organization-id', org)
      .send({ action: 'access' })
      .expect(200);
    expect(rights.body.donorEmail).toBe('ana.salida@example.test');
    expect(rights.body.donorName).toBe('Ana Ruiz');
  });
});
