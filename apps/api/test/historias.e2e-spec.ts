import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { MailService } from '../src/mail/mail.service';
import { IdentidadService } from '../src/identidad/identidad.service';
import { base32Decode, totpCode } from '../src/shared/crypto';

jest.setTimeout(60000);

describe('historias 1 a 4', () => {
  let app: INestApplication<App>;
  let mail: MailService;
  const password = 'clave-segura-12';
  const email = `owner-${Date.now()}@example.test`;

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

  it('verifica, entra, crea la organización y una campaña en borrador', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, password: 'corta' })
      .expect(422);
    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, password })
      .expect(201);
    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, password })
      .expect(422);

    const token = mail.latest(email, 'verify')?.token;
    expect(token).toBeTruthy();
    await request(app.getHttpServer())
      .post('/v1/auth/verify')
      .send({ token: 'vencido' })
      .expect(422);
    await request(app.getHttpServer())
      .post('/v1/auth/verify')
      .send({ token })
      .expect(204);
    await request(app.getHttpServer())
      .post('/v1/auth/verify')
      .send({ token })
      .expect(422);

    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const access = login.body.accessToken as string;
    const refresh = cookie(login);

    const org = await request(app.getHttpServer())
      .post('/v1/organizations')
      .set('authorization', `Bearer ${access}`)
      .send({ name: 'Causa Norte', country: 'MX' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/v1/auth/logout')
      .set('cookie', refresh)
      .expect(204);
    const enroll = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password })
      .expect(401);
    expect(enroll.body.code).toBe('mfa_enroll_required');

    const started = await request(app.getHttpServer())
      .post('/v1/auth/mfa/enroll')
      .send({ ticket: enroll.body.ticket })
      .expect(200);
    const code = totpCode(base32Decode(started.body.secret as string));
    const confirmed = await request(app.getHttpServer())
      .post('/v1/auth/mfa/confirm')
      .send({ ticket: started.body.ticket, code })
      .expect(200);
    expect(confirmed.body.recoveryCodes).toHaveLength(8);

    await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password })
      .expect(401);
    const again = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({
        email,
        password,
        totp: totpCode(base32Decode(started.body.secret as string)),
      })
      .expect(200);

    const campaignName = `Rio ${Date.now()}`;
    const campaign = await request(app.getHttpServer())
      .post('/v1/campaigns')
      .set('authorization', `Bearer ${again.body.accessToken}`)
      .set('x-organization-id', org.body.id)
      .send({
        name: campaignName,
        currency: 'USD',
        kind: 'electoral',
        jurisdiction: 'MX-DUR',
        timeZone: 'America/Mexico_City',
        storeUrl: 'https://tienda.example.test/agua',
      })
      .expect(201);
    expect(campaign.body.status).toBe('borrador');
    expect(campaign.body.slug).toBe(
      campaignName.toLowerCase().replace(' ', '-'),
    );
    expect(campaign.body.storeUrl).toBe('https://tienda.example.test/agua');

    await request(app.getHttpServer())
      .post('/v1/campaigns')
      .set('authorization', `Bearer ${again.body.accessToken}`)
      .set('x-organization-id', org.body.id)
      .send({
        name: 'Otra',
        currency: 'USD',
        kind: 'causa',
        jurisdiction: 'MX',
        timeZone: 'America/Mexico_City',
        storeUrl: 'http://insegura.example.test',
      })
      .expect(422);

    const listed = await request(app.getHttpServer())
      .get('/v1/campaigns')
      .set('authorization', `Bearer ${again.body.accessToken}`)
      .set('x-organization-id', org.body.id)
      .expect(200);
    expect(listed.body).toHaveLength(1);

    const repeated = await request(app.getHttpServer())
      .post('/v1/campaigns')
      .set('authorization', `Bearer ${again.body.accessToken}`)
      .set('x-organization-id', org.body.id)
      .send({
        name: campaign.body.name,
        currency: 'USD',
        kind: 'causa',
        jurisdiction: 'MX',
        timeZone: 'America/Mexico_City',
      })
      .expect(201);
    expect(repeated.body.slug).toBe(`${campaign.body.slug}-2`);
  });

  it('bloquea la clave al quinto fallo y la nueva clave revoca la sesión', async () => {
    const other = `lock-${Date.now()}@example.test`;
    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email: other, password })
      .expect(201);
    const token = mail.latest(other, 'verify')?.token ?? '';
    await request(app.getHttpServer())
      .post('/v1/auth/verify')
      .send({ token })
      .expect(204);
    const first = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: other, password })
      .expect(200);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: other, password: 'clave-mala-1234' })
        .expect(401);
    }
    const locked = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: other, password: 'clave-mala-1234' })
      .expect(401);
    expect(locked.body.code).toBe('locked');

    await request(app.getHttpServer())
      .post('/v1/auth/password/forgot')
      .send({ email: other })
      .expect(204);
    await request(app.getHttpServer())
      .post('/v1/auth/password/forgot')
      .send({ email: 'nadie@example.test' })
      .expect(204);
    const reset = mail.latest(other, 'reset')?.token ?? '';
    await request(app.getHttpServer())
      .post('/v1/auth/password/reset')
      .send({ token: reset, password: 'clave-nueva-1234' })
      .expect(204);
    await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .set('cookie', cookie(first))
      .expect(401);
    await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: other, password: 'clave-nueva-1234' })
      .expect(200);
  });

  it('no enlaza un subject de proveedor por correo', async () => {
    const service = app.get(IdentidadService);
    const first = `a-${Date.now()}@example.test`;
    const second = `b-${Date.now()}@example.test`;
    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email: first, password })
      .expect(201);
    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email: second, password })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: first, password })
      .expect(401);
    expect(login.body.code).toBe('email_unverified');
    await request(app.getHttpServer())
      .post('/v1/auth/verify')
      .send({ token: mail.latest(first, 'verify')?.token })
      .expect(204);
    await request(app.getHttpServer())
      .post('/v1/auth/verify')
      .send({ token: mail.latest(second, 'verify')?.token })
      .expect(204);
    const session = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: first, password })
      .expect(200);
    const payload = JSON.parse(
      Buffer.from(
        String(session.body.accessToken).split('.')[1],
        'base64url',
      ).toString(),
    ) as { sub: string };
    const other = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: second, password })
      .expect(200);
    const otherId = JSON.parse(
      Buffer.from(
        String(other.body.accessToken).split('.')[1],
        'base64url',
      ).toString(),
    ) as { sub: string };
    await service.saveSubject(payload.sub, 'google', `sub-${Date.now()}`);
    const subject = `shared-${Date.now()}`;
    await service.saveSubject(payload.sub, 'microsoft', subject);
    await expect(
      service.saveSubject(otherId.sub, 'microsoft', subject),
    ).rejects.toMatchObject({ code: 'subject_taken' });
    await expect(
      service.userIdForSubject('google', first),
    ).resolves.toBeUndefined();
  });
});

function cookie(res: request.Response): string {
  const raw = res.headers['set-cookie'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (value ?? '').split(';')[0];
}
