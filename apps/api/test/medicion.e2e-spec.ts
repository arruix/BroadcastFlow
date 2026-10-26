import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import http from 'http';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { DbService } from '../src/db/db.service';
import { MailService } from '../src/mail/mail.service';
import { signWebhook } from '../src/shared/crypto';
import { splitDonation } from '../src/shared/fees';

jest.setTimeout(60000);

const chrome =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

describe('historia 10', () => {
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
    await app.listen(0);
    mail = app.get(MailService);
    db = app.get(DbService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('deja fuera la vista previa y la recarga, y calcula el CPC con el gasto', async () => {
    const email = `medida-${Date.now()}@example.test`;
    const session = await account(app, mail, email, password);
    const org = await request(app.getHttpServer())
      .post('/v1/organizations')
      .set('authorization', `Bearer ${session}`)
      .send({ name: 'Causa medida', country: 'MX' })
      .expect(201);
    const campaign = await createCampaign(
      app,
      session,
      org.body.id,
      `Rio medida ${Date.now()}`,
    );
    const anonymousId = '11111111-1111-4111-8111-111111111111';

    await request(app.getHttpServer())
      .post(`/v1/public/campaigns/${campaign.slug}/visits`)
      .set('user-agent', chrome)
      .send({ anonymousId, eventType: 'view' })
      .expect(404);
    expect(await visitCount(db, campaign.id)).toBe(0);

    await publishAndActivate(app, session, org.body.id, campaign.id);
    const day = await campaignDay(db, campaign.id);

    await request(app.getHttpServer())
      .post(`/v1/public/campaigns/${campaign.slug}/visits`)
      .set('user-agent', chrome)
      .send({ anonymousId, eventType: 'view', utmSource: 'facebook' })
      .expect(204);
    await request(app.getHttpServer())
      .post(`/v1/public/campaigns/${campaign.slug}/visits`)
      .set('user-agent', chrome)
      .send({ anonymousId, eventType: 'view', utmSource: 'facebook' })
      .expect(204);
    await request(app.getHttpServer())
      .post(`/v1/public/campaigns/${campaign.slug}/visits`)
      .set('user-agent', 'facebookexternalhit/1.1')
      .send({
        anonymousId: '22222222-2222-4222-8222-222222222222',
        eventType: 'view',
      })
      .expect(204);
    await request(app.getHttpServer())
      .post(`/v1/public/campaigns/${campaign.slug}/visits`)
      .set('user-agent', '')
      .send({
        anonymousId: '33333333-3333-4333-8333-333333333333',
        eventType: 'view',
      })
      .expect(204);
    await request(app.getHttpServer())
      .post(`/v1/public/campaigns/${campaign.slug}/visits`)
      .set('user-agent', chrome)
      .send({ anonymousId, eventType: 'click', utmSource: 'facebook' })
      .expect(204);

    const metrics = await request(app.getHttpServer())
      .get(`/v1/campaigns/${campaign.id}/metrics`)
      .query({ from: day, to: day })
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .expect(200);
    expect(metrics.body.origins).toEqual([
      expect.objectContaining({
        origin: 'facebook',
        views: 1,
        clicks: 1,
        clickRate: 1,
        viewShare: 1,
        cpcMinor: null,
      }),
    ]);
    expect(metrics.body.excludedCount).toBe(3);
    expect(metrics.body.series[0]).toEqual({ day, views: 1, clicks: 1 });
    expect(await bucketCount(db, campaign.id, 'view')).toBe(1);

    const stored = await db.asWorker((client) =>
      client.query<{ postal_code: string | null; browser: string | null }>(
        'SELECT postal_code, browser FROM visit_event WHERE campaign_id = $1 AND counted ORDER BY occurred_at',
        [campaign.id],
      ),
    );
    expect(stored.rows.every((row) => row.postal_code === null)).toBe(true);
    expect(stored.rows[0].browser).toBe('Chrome');

    const direct = await request(app.getHttpServer())
      .post(`/v1/campaigns/${campaign.id}/spend`)
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .send({
        network: 'direct',
        periodStart: day,
        periodEnd: day,
        amountMinor: 500,
        currency: 'USD',
      })
      .expect(422);
    expect(direct.body.code).toBe('spend_invalid');
    const spend = await request(app.getHttpServer())
      .post(`/v1/campaigns/${campaign.id}/spend`)
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .send({
        network: 'facebook',
        periodStart: day,
        periodEnd: day,
        amountMinor: 1000,
        currency: 'USD',
      })
      .expect(201);
    const withCpc = await request(app.getHttpServer())
      .get(`/v1/campaigns/${campaign.id}/metrics`)
      .query({ from: day, to: day })
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .expect(200);
    expect(withCpc.body.origins[0].cpcMinor).toBe(1000);
    await request(app.getHttpServer())
      .post(`/v1/campaigns/${campaign.id}/spend/${spend.body.id}/close`)
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .expect(200);
    const revised = await request(app.getHttpServer())
      .put(`/v1/campaigns/${campaign.id}/spend/${spend.body.id}`)
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .send({ amountMinor: 2000 })
      .expect(422);
    expect(revised.body.code).toBe('spend_invalid');

    const editorEmail = `editor-${Date.now()}@example.test`;
    const editor = await account(app, mail, editorEmail, password);
    await db.asWorker((client) =>
      client.query(
        `INSERT INTO membership (organization_id, user_id, role)
         SELECT $1, id, 'editor' FROM app_user WHERE email = $2`,
        [org.body.id, editorEmail],
      ),
    );
    await request(app.getHttpServer())
      .get(`/v1/campaigns/${campaign.id}/metrics`)
      .query({ from: day, to: day })
      .set('authorization', `Bearer ${editor}`)
      .set('x-organization-id', org.body.id)
      .expect(403);

    const heard = waitForCounted(app, session, org.body.id);
    await new Promise((resolve) => setTimeout(resolve, 200));
    await request(app.getHttpServer())
      .post(`/v1/public/campaigns/${campaign.slug}/visits`)
      .set('user-agent', chrome)
      .send({
        anonymousId: '44444444-4444-4444-8444-444444444444',
        eventType: 'view',
        referrer: 'https://www.instagram.com/p/1',
      })
      .expect(204);
    expect(await heard).toContain('visit.counted');

    const split = splitDonation(1000, 0);
    const pending = await request(app.getHttpServer())
      .post(`/v1/public/campaigns/${campaign.slug}/donations`)
      .set('idempotency-key', 'medida-donacion-01')
      .send({
        amountMinor: 1000,
        currency: 'USD',
        donorName: 'Ana Ruiz',
        donorEmail: 'donante-medida@example.test',
        personKind: 'individual',
        consent: true,
        visitAnonymousId: anonymousId,
      })
      .expect(201);
    const payload = JSON.stringify({
      id: `evt-medida-${Date.now()}`,
      donationId: pending.body.donationId,
      grossMinor: 1000,
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
    const donated = await request(app.getHttpServer())
      .get(`/v1/campaigns/${campaign.id}/metrics`)
      .query({ from: day, to: day })
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .expect(200);
    const facebook = donated.body.origins.find(
      (row: { origin: string }) => row.origin === 'facebook',
    );
    expect(facebook.donations).toBe(1);
    expect(facebook.donationRate).toBe(1);
  });
});

function waitForCounted(
  app: INestApplication<App>,
  token: string,
  organizationId: string,
) {
  const address = app.getHttpServer().address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return new Promise<string>((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: `/v1/organizations/${organizationId}/events`,
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'text/event-stream',
        },
      },
      (response) => {
        response.setEncoding('utf8');
        let body = '';
        response.on('data', (chunk) => {
          body += chunk;
          if (body.includes('visit.counted')) {
            req.destroy();
            resolve(body);
          }
        });
      },
    );
    req.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'ECONNRESET') reject(error);
    });
    req.end();
    setTimeout(() => reject(new Error('sse timeout')), 8000);
  });
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
      controller: 'Causa medida',
      purpose: 'Recibir donativos para medir el río',
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

async function campaignDay(db: DbService, campaignId: string) {
  const rows = await db.asWorker((client) =>
    client.query<{ day: string }>(
      `SELECT to_char((now() AT TIME ZONE time_zone)::date, 'YYYY-MM-DD') AS day FROM campaign WHERE id = $1`,
      [campaignId],
    ),
  );
  return rows.rows[0].day;
}

async function visitCount(db: DbService, campaignId: string) {
  const rows = await db.asWorker((client) =>
    client.query<{ count: string }>(
      'SELECT count(*) FROM visit_event WHERE campaign_id = $1',
      [campaignId],
    ),
  );
  return Number(rows.rows[0].count);
}

async function bucketCount(
  db: DbService,
  campaignId: string,
  eventType: string,
) {
  const rows = await db.asWorker((client) =>
    client.query<{ total: string | null }>(
      'SELECT sum(event_count) AS total FROM metric_bucket WHERE campaign_id = $1 AND event_type = $2',
      [campaignId, eventType],
    ),
  );
  return Number(rows.rows[0].total ?? 0);
}
