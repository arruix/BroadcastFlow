import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { DbService } from '../src/db/db.service';
import { FacebookGateway } from '../src/distribucion/facebook.gateway';
import { MailService } from '../src/mail/mail.service';
import { decrypt } from '../src/shared/crypto';

jest.setTimeout(60000);

describe('historias 7 a 9', () => {
  let app: INestApplication<App>;
  let mail: MailService;
  let db: DbService;
  let facebook: FacebookGateway;
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
    facebook = app.get(FacebookGateway);
  });

  afterAll(async () => {
    await app.close();
  });

  it('cifra el token, omite la imagen y publica una sola vez', async () => {
    const email = `facebook-${Date.now()}@example.test`;
    const session = await account(app, mail, email, password);
    const org = await request(app.getHttpServer())
      .post('/v1/organizations')
      .set('authorization', `Bearer ${session}`)
      .send({ name: 'Causa de la página', country: 'MX' })
      .expect(201);
    const campaign = await createCampaign(
      app,
      session,
      org.body.id,
      `Rio pagina ${Date.now()}`,
    );
    const page = await connect(app, session, org.body.id, 'pagina-rio', [
      'pages_show_list',
      'pages_manage_posts',
    ]);
    expect(page.status).toBe('active');
    expect(JSON.stringify(page)).not.toContain(facebook.lastToken);
    const stored = await db.asWorker((client) =>
      client.query<{ token_ciphertext: Buffer }>(
        'SELECT token_ciphertext FROM social_connection WHERE id = $1',
        [page.id],
      ),
    );
    expect(decrypt(stored.rows[0].token_ciphertext).toString('utf8')).toBe(
      facebook.lastToken,
    );
    expect(stored.rows[0].token_ciphertext.toString('utf8')).not.toContain(
      facebook.lastToken,
    );

    const reauth = await connect(
      app,
      session,
      org.body.id,
      'pagina-sin-permiso',
      ['pages_show_list'],
    );
    expect(reauth.status).toBe('reauth');
    const limited = await connect(
      app,
      session,
      org.body.id,
      'pagina-tres',
      ['pages_manage_posts'],
      422,
    );
    expect(limited.code).toBe('connection_limit');

    const share = await request(app.getHttpServer())
      .put(`/v1/campaigns/${campaign.id}/share`)
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .send({ title: 'Río en la red', description: 'El enlace de la causa' })
      .expect(200);
    expect(share.body.imageKey).toBeNull();
    const badImage = await request(app.getHttpServer())
      .put(`/v1/campaigns/${campaign.id}/share`)
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .send({
        title: 'Río en la red',
        description: 'El enlace de la causa',
        imageKey: 'http://imagen.example/foto.jpg',
      })
      .expect(422);
    expect(badImage.body.code).toBe('image_invalid');

    const item = await request(app.getHttpServer())
      .post(`/v1/campaigns/${campaign.id}/content-items`)
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .expect(201);
    const invalid = await request(app.getHttpServer())
      .post(`/v1/content-items/${item.body.id}/variants`)
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .send({ network: 'facebook', body: '   ' })
      .expect(200);
    expect(invalid.body.valid).toBe(false);
    const blocked = await request(app.getHttpServer())
      .post('/v1/publications')
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .send({
        variantId: invalid.body.id,
        connectionId: page.id,
        scheduledAt: future(),
      })
      .expect(422);
    expect(blocked.body.code).toBe('variant_invalid');
    expect(await publicationCount(db, invalid.body.id)).toBe(0);

    const variant = await request(app.getHttpServer())
      .post(`/v1/content-items/${item.body.id}/variants`)
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .send({ network: 'facebook', body: 'El río sigue abierto.' })
      .expect(200);
    expect(variant.body.valid).toBe(true);
    const denied = await request(app.getHttpServer())
      .post('/v1/publications')
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .send({
        variantId: variant.body.id,
        connectionId: reauth.id,
        scheduledAt: future(),
      })
      .expect(422);
    expect(denied.body.code).toBe('connection_reauth');

    const scheduled = await request(app.getHttpServer())
      .post('/v1/publications')
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .send({
        variantId: variant.body.id,
        connectionId: page.id,
        scheduledAt: future(),
      })
      .expect(201);
    await due(db, scheduled.body.id);
    facebook.outcome = 'ok';
    facebook.publishes = [];
    const published = await request(app.getHttpServer())
      .post('/v1/publications/dispatch')
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .expect(200);
    expect(published.body[0].status).toBe('published');
    expect(facebook.publishes).toEqual([
      expect.objectContaining({
        publicationId: scheduled.body.id,
        imageKey: null,
        body: 'El río sigue abierto.',
      }),
    ]);
    const again = await request(app.getHttpServer())
      .post('/v1/publications/dispatch')
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .expect(200);
    expect(again.body).toEqual([]);
    expect(facebook.publishes).toHaveLength(1);

    const publicPage = await request(app.getHttpServer())
      .get(`/v1/public/campaigns/${campaign.slug}`)
      .expect(200);
    expect(publicPage.body.share).toEqual({
      title: 'Río en la red',
      description: 'El enlace de la causa',
      imageKey: null,
    });
    expect(await itemCount(db, item.body.id)).toBe(1);
  });

  it('reintenta un 5xx y el fallo no borra la pieza', async () => {
    const email = `facebook-fallo-${Date.now()}@example.test`;
    const session = await account(app, mail, email, password);
    const org = await request(app.getHttpServer())
      .post('/v1/organizations')
      .set('authorization', `Bearer ${session}`)
      .send({ name: 'Causa del reintento', country: 'MX' })
      .expect(201);
    const campaign = await createCampaign(
      app,
      session,
      org.body.id,
      `Rio reintento ${Date.now()}`,
    );
    const page = await connect(app, session, org.body.id, 'pagina-reintento', [
      'pages_manage_posts',
    ]);
    const item = await request(app.getHttpServer())
      .post(`/v1/campaigns/${campaign.id}/content-items`)
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .expect(201);
    const variant = await request(app.getHttpServer())
      .post(`/v1/content-items/${item.body.id}/variants`)
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .send({ network: 'facebook', body: 'Seguimos.' })
      .expect(200);
    const scheduled = await request(app.getHttpServer())
      .post('/v1/publications')
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .send({
        variantId: variant.body.id,
        connectionId: page.id,
        scheduledAt: future(),
      })
      .expect(201);
    await due(db, scheduled.body.id);
    facebook.outcome = 'retry';
    let last = '';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const dispatched = await request(app.getHttpServer())
        .post('/v1/publications/dispatch')
        .set('authorization', `Bearer ${session}`)
        .set('x-organization-id', org.body.id)
        .expect(200);
      last = dispatched.body[0].status;
    }
    expect(last).toBe('failed');
    expect(await itemCount(db, item.body.id)).toBe(1);

    const terminal = await request(app.getHttpServer())
      .post('/v1/publications')
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .send({
        variantId: variant.body.id,
        connectionId: page.id,
        scheduledAt: future(),
      })
      .expect(201);
    await due(db, terminal.body.id);
    facebook.outcome = 'terminal';
    const failed = await request(app.getHttpServer())
      .post('/v1/publications/dispatch')
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .expect(200);
    expect(failed.body[0].status).toBe('failed');
    expect(await itemCount(db, item.body.id)).toBe(1);
  });
});

function future() {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
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

async function connect(
  app: INestApplication<App>,
  token: string,
  organizationId: string,
  pageId: string,
  scopes: string[],
  status = 200,
) {
  const started = await request(app.getHttpServer())
    .post('/v1/connections/facebook/start')
    .set('authorization', `Bearer ${token}`)
    .set('x-organization-id', organizationId)
    .expect(200);
  const state = new URL(started.body.authorizationUrl).searchParams.get(
    'state',
  );
  const finished = await request(app.getHttpServer())
    .post('/v1/connections/facebook/callback')
    .send({ state, pageId, scopes })
    .expect(status);
  return finished.body as { id: string; status: string; code?: string };
}

async function due(db: DbService, publicationId: string) {
  await db.asWorker((client) =>
    client.query(
      `UPDATE publication SET scheduled_at = now() - interval '1 minute' WHERE id = $1`,
      [publicationId],
    ),
  );
}

async function publicationCount(db: DbService, variantId: string) {
  const rows = await db.asWorker((client) =>
    client.query<{ count: string }>(
      'SELECT count(*) FROM publication WHERE content_variant_id = $1',
      [variantId],
    ),
  );
  return Number(rows.rows[0].count);
}

async function itemCount(db: DbService, itemId: string) {
  const rows = await db.asWorker((client) =>
    client.query<{ count: string }>(
      'SELECT count(*) FROM content_item WHERE id = $1',
      [itemId],
    ),
  );
  return Number(rows.rows[0].count);
}
