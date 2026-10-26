import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { DbService } from '../src/db/db.service';
import { LiveGateway } from '../src/envivo/live.gateway';
import { MailService } from '../src/mail/mail.service';
import { decrypt, encrypt, signBillingWebhook } from '../src/shared/crypto';

jest.setTimeout(60000);

describe('live', () => {
  let app: INestApplication<App>;
  let mail: MailService;
  let db: DbService;
  let gateway: LiveGateway;
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
    gateway = app.get(LiveGateway);
  });

  afterAll(async () => {
    await app.close();
  });

  it('el fundador y la electoral sin paquete no abren sala', async () => {
    const session = await account(
      app,
      mail,
      `live-cero-${Date.now()}@example.test`,
      password,
    );
    const org = await request(app.getHttpServer())
      .post('/v1/organizations')
      .set('authorization', `Bearer ${session}`)
      .send({ name: 'Causa sin minutos', country: 'MX' })
      .expect(201);
    const campaign = await request(app.getHttpServer())
      .post('/v1/campaigns')
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .send(campaignBody('Rio sin minutos', 'causa'))
      .expect(201);
    const facebook = await connect(
      app,
      session,
      org.body.id,
      'facebook',
      'pagina-sin-minutos',
    );
    const denied = await request(app.getHttpServer())
      .post(`/v1/campaigns/${campaign.body.id}/live-sessions`)
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .send({ connectionIds: [facebook] })
      .expect(422);
    expect(denied.body.code).toBe('live_minutes_exhausted');
    expect(await sessionCount(db, org.body.id)).toBe(0);

    const electoralOrg = await request(app.getHttpServer())
      .post('/v1/organizations')
      .set('authorization', `Bearer ${session}`)
      .send({ name: 'Causa electoral', country: 'MX' })
      .expect(201);
    const electoral = await request(app.getHttpServer())
      .post('/v1/campaigns')
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', electoralOrg.body.id)
      .send(campaignBody('Rio electoral', 'electoral'))
      .expect(201);
    const blocked = await request(app.getHttpServer())
      .post(`/v1/campaigns/${electoral.body.id}/live-sessions`)
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', electoralOrg.body.id)
      .send({ connectionIds: ['00000000-0000-4000-8000-000000000001'] })
      .expect(422);
    expect(blocked.body.code).toBe('electoral_without_policy');
  });

  it('un destino rechazado deja al otro en vivo y no devuelve la llave', async () => {
    const session = await account(
      app,
      mail,
      `live-red-${Date.now()}@example.test`,
      password,
    );
    const org = await request(app.getHttpServer())
      .post('/v1/organizations')
      .set('authorization', `Bearer ${session}`)
      .send({ name: 'Causa en vivo', country: 'MX' })
      .expect(201);
    await pay(app, session, org.body.id);
    const campaign = await request(app.getHttpServer())
      .post('/v1/campaigns')
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .send(campaignBody('Rio en vivo', 'causa'))
      .expect(201);
    const facebook = await connect(
      app,
      session,
      org.body.id,
      'facebook',
      'pagina-en-vivo',
    );
    const youtube = await connect(
      app,
      session,
      org.body.id,
      'youtube',
      'canal-en-vivo',
    );
    await db.asWorker((client) =>
      client.query(
        `INSERT INTO social_connection (organization_id, network_code, external_account_id, token_ciphertext, status)
         VALUES ($1, 'linkedin', 'li-apagado', $2, 'active')`,
        [org.body.id, encrypt(Buffer.from('no-se-usa'))],
      ),
    );
    const linkedin = await db.asWorker((client) =>
      client.query<{ id: string }>(
        `SELECT id FROM social_connection WHERE organization_id = $1 AND network_code = 'linkedin'`,
        [org.body.id],
      ),
    );
    const off = await request(app.getHttpServer())
      .post(`/v1/campaigns/${campaign.body.id}/live-sessions`)
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .send({ connectionIds: [linkedin.rows[0].id] })
      .expect(422);
    expect(off.body.code).toBe('live_network_unavailable');

    const desk = await request(app.getHttpServer())
      .get(`/v1/campaigns/${campaign.body.id}/live`)
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .expect(200);
    expect(desk.body.minutesIncluded).toBe(60);
    expect(
      desk.body.networks.find(
        (network: { code: string }) => network.code === 'instagram',
      ).reason,
    ).toBeTruthy();
    expect(
      desk.body.networks.find(
        (network: { code: string }) => network.code === 'linkedin',
      ).reason,
    ).toBeTruthy();

    gateway.reject = new Set(['youtube']);
    gateway.opened = [];
    const opened = await request(app.getHttpServer())
      .post(`/v1/campaigns/${campaign.body.id}/live-sessions`)
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .send({ connectionIds: [facebook, youtube] })
      .expect(201);
    const started = await request(app.getHttpServer())
      .post(`/v1/live-sessions/${opened.body.id}/start`)
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .expect(200);
    const again = await request(app.getHttpServer())
      .post(`/v1/live-sessions/${opened.body.id}/start`)
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .expect(409);
    expect(again.status).toBe(409);
    expect(gateway.opened).toHaveLength(2);
    expect(started.body.status).toBe('live');
    expect(started.body.roomToken).toEqual(expect.any(String));
    expect(started.body.playbackUrl).toContain(opened.body.id);
    const facebookDestination = started.body.destinations.find(
      (row: { network: string }) => row.network === 'facebook',
    );
    const youtubeDestination = started.body.destinations.find(
      (row: { network: string }) => row.network === 'youtube',
    );
    expect(facebookDestination.status).toBe('live');
    expect(youtubeDestination.status).toBe('failed');
    const body = JSON.stringify(started.body);
    expect(body).not.toMatch(/ingest|rtmp/i);
    const stored = await db.asWorker((client) =>
      client.query<{ ingest_ciphertext: Buffer | null; network_code: string }>(
        `SELECT network_code, ingest_ciphertext FROM live_destination WHERE live_session_id = $1`,
        [opened.body.id],
      ),
    );
    const secret = stored.rows.find((row) => row.network_code === 'facebook');
    const key = decrypt(
      secret?.ingest_ciphertext ?? Buffer.alloc(0),
    ).toString();
    expect(key.length).toBeGreaterThan(10);
    expect(body.includes(key)).toBe(false);
    expect(
      stored.rows.find((row) => row.network_code === 'youtube')
        ?.ingest_ciphertext,
    ).toBeNull();
    const notices = await db.asWorker((client) =>
      client.query<{ count: string }>(
        `SELECT count(*) FROM notification WHERE organization_id = $1 AND event_code = 'live.destination.failed'`,
        [org.body.id],
      ),
    );
    expect(Number(notices.rows[0].count)).toBe(1);

    const pub = await request(app.getHttpServer())
      .get(`/v1/public/campaigns/${campaign.body.slug}`)
      .expect(200);
    expect(pub.body.live.playbackUrl).toContain(opened.body.id);
    await request(app.getHttpServer())
      .get(`/v1/public/live/${opened.body.id}/index.m3u8`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/v1/live-sessions/${opened.body.id}/origin`)
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .send({ connected: false })
      .expect(200);
    const realNow = Date.now;
    Date.now = () => realNow() + 31_000;
    try {
      const dropped = await request(app.getHttpServer())
        .get(`/v1/live-sessions/${opened.body.id}`)
        .set('authorization', `Bearer ${session}`)
        .set('x-organization-id', org.body.id)
        .expect(200);
      expect(dropped.body.status).toBe('ended');
      expect(dropped.body.roomToken).toBeUndefined();
    } finally {
      Date.now = realNow;
    }
    await request(app.getHttpServer())
      .get(`/v1/public/live/${opened.body.id}/index.m3u8`)
      .expect(404);
    const quiet = await request(app.getHttpServer())
      .get(`/v1/public/campaigns/${campaign.body.slug}`)
      .expect(200);
    expect(quiet.body.live).toBeNull();

    gateway.reject = new Set();
    const second = await request(app.getHttpServer())
      .post(`/v1/campaigns/${campaign.body.id}/live-sessions`)
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .send({ connectionIds: [facebook] })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/v1/live-sessions/${second.body.id}/start`)
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .expect(200);
    await db.asWorker((client) =>
      client.query(
        `UPDATE live_session SET started_at = now() - interval '4 hours 1 second' WHERE id = $1`,
        [second.body.id],
      ),
    );
    const capped = await request(app.getHttpServer())
      .get(`/v1/live-sessions/${second.body.id}`)
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .expect(200);
    expect(capped.body.status).toBe('ended');
    const usage = await db.asWorker((client) =>
      client.query<{ seconds_used: number }>(
        `SELECT seconds_used FROM live_usage WHERE organization_id = $1`,
        [org.body.id],
      ),
    );
    expect(usage.rows[0].seconds_used).toBe(3600);
    const exhausted = await request(app.getHttpServer())
      .post(`/v1/campaigns/${campaign.body.id}/live-sessions`)
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .send({ connectionIds: [facebook] })
      .expect(422);
    expect(exhausted.body.code).toBe('live_minutes_exhausted');
    gateway.reject = new Set();
  });
});

function campaignBody(name: string, kind: string) {
  return {
    name,
    currency: 'USD',
    kind,
    jurisdiction: 'MX',
    timeZone: 'America/Mexico_City',
  };
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

async function connect(
  app: INestApplication<App>,
  token: string,
  organizationId: string,
  network: 'facebook' | 'youtube',
  accountId: string,
) {
  const started = await request(app.getHttpServer())
    .post(`/v1/connections/${network}/start`)
    .set('authorization', `Bearer ${token}`)
    .set('x-organization-id', organizationId)
    .expect(200);
  const state = new URL(started.body.authorizationUrl).searchParams.get(
    'state',
  );
  const body =
    network === 'facebook'
      ? { state, pageId: accountId, scopes: ['pages_manage_posts'] }
      : { state, channelId: accountId, scopes: ['youtube'] };
  const saved = await request(app.getHttpServer())
    .post(`/v1/connections/${network}/callback`)
    .send(body)
    .expect(200);
  return saved.body.id as string;
}

async function pay(
  app: INestApplication<App>,
  token: string,
  organizationId: string,
) {
  const checkout = await request(app.getHttpServer())
    .post('/v1/subscriptions/checkout')
    .set('authorization', `Bearer ${token}`)
    .set('x-organization-id', organizationId)
    .send({ plan: 'campana' })
    .expect(201);
  const payload = JSON.stringify({
    id: `evt-live-${Date.now()}`,
    outcome: 'paid',
    invoiceId: checkout.body.invoiceId,
  });
  await request(app.getHttpServer())
    .post('/v1/webhooks/billing')
    .set('stripe-signature', signBillingWebhook(payload))
    .set('content-type', 'application/json')
    .send(payload)
    .expect(200);
}

async function sessionCount(db: DbService, organizationId: string) {
  const rows = await db.asWorker((client) =>
    client.query<{ count: string }>(
      'SELECT count(*) FROM live_session WHERE organization_id = $1',
      [organizationId],
    ),
  );
  return Number(rows.rows[0].count);
}
