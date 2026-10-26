import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { MailService } from '../src/mail/mail.service';

jest.setTimeout(60000);

describe('campaña de un individuo', () => {
  let app: INestApplication<App>;
  let mail: MailService;
  const password = 'clave-segura-12';
  const email = `individuo-${Date.now()}@example.test`;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    mail = app.get(MailService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('guarda la campaña sin un alta de organización previa', async () => {
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
    const access = login.body.accessToken as string;

    const empty = await request(app.getHttpServer())
      .get('/v1/organizations')
      .set('authorization', `Bearer ${access}`)
      .expect(200);
    expect(empty.body).toEqual([]);

    const name = `Causa sola ${Date.now()}`;
    const campaign = await request(app.getHttpServer())
      .post('/v1/campaigns')
      .set('authorization', `Bearer ${access}`)
      .send({
        name,
        currency: 'USD',
        kind: 'causa',
        jurisdiction: 'MX',
        timeZone: 'America/Mexico_City',
      })
      .expect(201);
    expect(campaign.body.name).toBe(name);
    expect(campaign.body.status).toBe('borrador');

    const organizations = await request(app.getHttpServer())
      .get('/v1/organizations')
      .set('authorization', `Bearer ${access}`)
      .expect(200);
    expect(organizations.body).toHaveLength(1);
    expect(organizations.body[0].role).toBe('owner');

    const listed = await request(app.getHttpServer())
      .get('/v1/campaigns')
      .set('authorization', `Bearer ${access}`)
      .set('x-organization-id', organizations.body[0].id)
      .expect(200);
    expect(listed.body[0].id).toBe(campaign.body.id);
  });
});
