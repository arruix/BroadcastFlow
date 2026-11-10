import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { MailService } from '../src/mail/mail.service';

jest.setTimeout(60000);

describe('encuadre y página pública', () => {
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

  it('guarda el encuadre, sanea la página y no publica datos del donante', async () => {
    const stamp = Date.now();
    const email = `pagina-${stamp}@example.test`;
    const session = await account(app, mail, email, password);
    const campaign = await request(app.getHttpServer())
      .post('/v1/campaigns')
      .set('authorization', `Bearer ${session.token}`)
      .send({
        name: `Rio pagina ${stamp}`,
        currency: 'MXN',
        kind: 'causa',
        jurisdiction: 'MX',
        timeZone: 'America/Mexico_City',
        paymentLinkUrl: 'https://mpago.la/pagina',
      })
      .expect(201);
    const org = campaign.body.organizationId as string;

    const bad = await request(app.getHttpServer())
      .put(`/v1/campaigns/${campaign.body.id}/frames`)
      .set('authorization', `Bearer ${session.token}`)
      .set('x-organization-id', org)
      .send({ frames: { snapchat: { x: 10, y: 10, zoom: 1 } } })
      .expect(422);
    expect(bad.body.code).toBe('landing_invalid');

    const frames = await request(app.getHttpServer())
      .put(`/v1/campaigns/${campaign.body.id}/frames`)
      .set('authorization', `Bearer ${session.token}`)
      .set('x-organization-id', org)
      .send({
        frames: {
          x: { x: 180, y: -5, zoom: 1.5 },
          facebook: { x: 40, y: 22, zoom: 1 },
        },
      })
      .expect(200);
    expect(frames.body.frames.x).toEqual({ x: 100, y: 0, zoom: 1.5 });
    expect(frames.body.frames.facebook).toEqual({ x: 40, y: 22, zoom: 1 });

    const invalid = await request(app.getHttpServer())
      .put(`/v1/campaigns/${campaign.body.id}/landing`)
      .set('authorization', `Bearer ${session.token}`)
      .set('x-organization-id', org)
      .send({
        title: 'Titulo',
        story: 'Historia',
        accent: 'red',
        amountsMinor: [1000],
        hero: { x: 50, y: 35, zoom: 1 },
        showProgress: true,
      })
      .expect(422);
    expect(invalid.body.code).toBe('landing_invalid');

    const saved = await request(app.getHttpServer())
      .put(`/v1/campaigns/${campaign.body.id}/landing`)
      .set('authorization', `Bearer ${session.token}`)
      .set('x-organization-id', org)
      .send({
        title: '  <b>Vestidos</b> para la causa  ',
        story: '<script>alert(1)</script>Una historia\ncon salto',
        imageKey: 'https://cdn.example/portada.jpg',
        hero: { x: 33, y: 20, zoom: 1.4 },
        accent: '#BE123C',
        amountsMinor: [2000, 5000, 10000],
        cta: '<em>Apoyar ahora</em>',
        showProgress: false,
        thankYou: 'Gracias por estar <script>aquí</script>',
      })
      .expect(200);
    expect(saved.body.landing.title).toBe('Vestidos para la causa');
    expect(saved.body.landing.story).toBe('alert(1)Una historia\ncon salto');
    expect(saved.body.landing.story).not.toContain('<');
    expect(saved.body.landing.accent).toBe('#be123c');
    expect(saved.body.landing.cta).toBe('Apoyar ahora');
    expect(saved.body.landing.thankYou).toBe('Gracias por estar aquí');
    expect(saved.body.landing.showProgress).toBe(false);
    expect(saved.body.landing.hero).toEqual({ x: 33, y: 20, zoom: 1.4 });
    expect(saved.body.landing).not.toHaveProperty('donorEmail');

    const pub = await request(app.getHttpServer())
      .get(`/v1/public/campaigns/${campaign.body.slug}`)
      .expect(200);
    expect(pub.body.landing.story).toBe('alert(1)Una historia\ncon salto');
    expect(pub.body.landing.imageKey).toBe('https://cdn.example/portada.jpg');
    expect(pub.body.coverFrame).toEqual({ x: 33, y: 20, zoom: 1.4 });
    expect(pub.body.share.title).toBe('Vestidos para la causa');
    expect(JSON.stringify(pub.body)).not.toContain(email);
    expect(pub.body).not.toHaveProperty('donorName');
    expect(pub.body).not.toHaveProperty('donorEmail');
    expect(pub.body.paymentMethod).toBeNull();

    const notice = await request(app.getHttpServer())
      .post(`/v1/campaigns/${campaign.body.id}/privacy-notices`)
      .set('authorization', `Bearer ${session.token}`)
      .set('x-organization-id', org)
      .send({
        controller: 'Causa pagina',
        purpose: 'Recibir apoyo externo',
        dataCategories: 'Nombre y correo',
        retention: 'Cinco años desde la donación',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(
        `/v1/campaigns/${campaign.body.id}/privacy-notices/${notice.body.id}/publish`,
      )
      .set('authorization', `Bearer ${session.token}`)
      .set('x-organization-id', org)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/v1/campaigns/${campaign.body.id}/activate`)
      .set('authorization', `Bearer ${session.token}`)
      .set('x-organization-id', org)
      .expect(200);
    const pledge = await request(app.getHttpServer())
      .post(`/v1/public/campaigns/${campaign.body.slug}/donations`)
      .set('idempotency-key', `pagina-${stamp}`)
      .send({
        amountMinor: 2000,
        currency: 'MXN',
        donorName: 'Ana Ruiz',
        donorEmail: 'ana.pagina@example.test',
        consent: true,
      })
      .expect(201);
    const receipt = await request(app.getHttpServer())
      .get(`/v1/public/donations/${pledge.body.donationId}`)
      .expect(200);
    expect(receipt.body.thankYou).toBe('Gracias por estar aquí');
    expect(receipt.body).not.toHaveProperty('donorName');
    expect(receipt.body).not.toHaveProperty('donorEmail');
    expect(JSON.stringify(receipt.body)).not.toContain(
      'ana.pagina@example.test',
    );
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
  return { token: login.body.accessToken as string };
}
