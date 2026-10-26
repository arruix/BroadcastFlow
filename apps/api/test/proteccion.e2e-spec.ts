import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { DbService } from '../src/db/db.service';
import { MailService } from '../src/mail/mail.service';

jest.setTimeout(60000);

const chrome =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const pledge = {
  amountMinor: 2000,
  currency: 'USD',
  donorName: 'Ana Ruiz',
  donorEmail: 'donante-proteccion@example.test',
  personKind: 'individual',
};

describe('UTM, consentimiento y anti-spam', () => {
  let app: INestApplication<App>;
  let mail: MailService;
  let db: DbService;
  const password = 'clave-segura-12';
  const savedSecret = process.env.TURNSTILE_SECRET_KEY;

  beforeAll(async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('v1');
    await app.init();
    mail = app.get(MailService);
    db = app.get(DbService);
  });

  afterAll(async () => {
    if (savedSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = savedSecret;
    await app.close();
  });

  async function setup(label: string) {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const owner = await account(
      app,
      mail,
      `${label}-${stamp}@example.test`,
      password,
    );
    const org = await request(app.getHttpServer())
      .post('/v1/organizations')
      .set('authorization', `Bearer ${owner}`)
      .send({ name: `Causa ${label}`, country: 'MX' })
      .expect(201);
    const campaign = await createCampaign(
      app,
      owner,
      org.body.id,
      `Rio ${label} ${stamp}`,
    );
    await publishAndActivate(app, owner, org.body.id, campaign.id);
    return { owner, org: org.body.id as string, campaign, stamp };
  }

  async function donation(id: string) {
    const rows = await db.asWorker((client) =>
      client.query<{
        origin: string | null;
        utm_source: string | null;
        utm_medium: string | null;
        utm_campaign: string | null;
        utm_content: string | null;
        consent_notice_version: number | null;
        consented_at: Date | null;
      }>(
        `SELECT origin, utm_source, utm_medium, utm_campaign, utm_content,
                consent_notice_version, consented_at
         FROM donation WHERE id = $1`,
        [id],
      ),
    );
    return rows.rows[0];
  }

  it('guarda UTM en visitas e intenciones y mide la conversión con CSV', async () => {
    const { owner, org, campaign, stamp } = await setup('utm');
    const visitor = '22222222-2222-4222-8222-222222222222';
    await request(app.getHttpServer())
      .post(`/v1/public/campaigns/${campaign.slug}/visits`)
      .set('user-agent', chrome)
      .send({
        anonymousId: visitor,
        eventType: 'view',
        utmSource: 'facebook',
        utmMedium: 'paid_social',
        utmCampaign: 'otono',
        utmContent: '<b>video-1</b>',
      })
      .expect(204);
    const visits = await db.asWorker((client) =>
      client.query(
        `SELECT origin, utm_source, utm_medium, utm_campaign, utm_content, counted
         FROM visit_event WHERE campaign_id = $1`,
        [campaign.id],
      ),
    );
    expect(visits.rows).toEqual([
      {
        origin: 'facebook',
        utm_source: 'facebook',
        utm_medium: 'paid_social',
        utm_campaign: 'otono',
        utm_content: 'video-1',
        counted: true,
      },
    ]);

    // Con UTM explícitos en la intención.
    const withUtm = await request(app.getHttpServer())
      .post(`/v1/public/campaigns/${campaign.slug}/donations`)
      .set('idempotency-key', `utm-a-${stamp}`)
      .send({
        ...pledge,
        consent: true,
        visitAnonymousId: visitor,
        utmSource: 'facebook',
        utmMedium: 'paid_social',
        utmCampaign: 'otono',
        utmContent: 'video-1',
      })
      .expect(201);
    expect(await donation(withUtm.body.donationId)).toMatchObject({
      origin: 'facebook',
      utm_source: 'facebook',
      utm_medium: 'paid_social',
      utm_campaign: 'otono',
      utm_content: 'video-1',
    });

    // Sin UTM: hereda el origen de la primera visita.
    const fromVisit = await request(app.getHttpServer())
      .post(`/v1/public/campaigns/${campaign.slug}/donations`)
      .set('idempotency-key', `utm-b-${stamp}`)
      .send({ ...pledge, consent: true, visitAnonymousId: visitor })
      .expect(201);
    expect((await donation(fromVisit.body.donationId)).origin).toBe('facebook');

    // Sin visita ni UTM: usa el referrer.
    const fromReferrer = await request(app.getHttpServer())
      .post(`/v1/public/campaigns/${campaign.slug}/donations`)
      .set('idempotency-key', `utm-c-${stamp}`)
      .send({
        ...pledge,
        consent: true,
        referrer: 'https://www.instagram.com/',
      })
      .expect(201);
    expect((await donation(fromReferrer.body.donationId)).origin).toBe(
      'instagram',
    );

    const today = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    const to = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    expect(today >= from).toBe(true);
    const conversion = await request(app.getHttpServer())
      .get(`/v1/campaigns/${campaign.id}/conversion?from=${from}&to=${to}`)
      .set('authorization', `Bearer ${owner}`)
      .set('x-organization-id', org)
      .expect(200);
    const facebook = conversion.body.origins.find(
      (row: { origin: string }) => row.origin === 'facebook',
    );
    expect(facebook).toMatchObject({ visitors: 1, pledges: 2 });
    expect(
      conversion.body.origins.find(
        (row: { origin: string }) => row.origin === 'instagram',
      ),
    ).toMatchObject({ visitors: 0, pledges: 1 });
    expect(
      conversion.body.rows.find(
        (row: { utmCampaign: string | null }) => row.utmCampaign === 'otono',
      ),
    ).toMatchObject({ visitors: 1, pledges: 1, conversion: 1 });

    const csv = await request(app.getHttpServer())
      .get(`/v1/campaigns/${campaign.id}/conversion.csv?from=${from}&to=${to}`)
      .set('authorization', `Bearer ${owner}`)
      .set('x-organization-id', org)
      .expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    const lines = csv.text.trim().split('\r\n');
    expect(lines[0]).toBe(
      'origen,utm_source,utm_medium,utm_campaign,utm_content,visitantes,intenciones,monto_minor,conversion',
    );
    expect(lines).toContain(
      'facebook,facebook,paid_social,otono,video-1,1,1,2000,1',
    );

    await request(app.getHttpServer())
      .get(`/v1/campaigns/${campaign.id}/conversion.csv?from=${from}&to=${to}`)
      .set('x-organization-id', org)
      .expect(401);
  });

  it('exige consentimiento ligado a la versión del aviso', async () => {
    const { campaign, stamp } = await setup('consent');
    await request(app.getHttpServer())
      .post(`/v1/public/campaigns/${campaign.slug}/donations`)
      .set('idempotency-key', `consent-a-${stamp}`)
      .send(pledge)
      .expect(422)
      .expect({ code: 'consent_required' });
    await request(app.getHttpServer())
      .post(`/v1/public/campaigns/${campaign.slug}/donations`)
      .set('idempotency-key', `consent-b-${stamp}`)
      .send({ ...pledge, consent: 'yes' })
      .expect(422)
      .expect({ code: 'consent_required' });
    await request(app.getHttpServer())
      .post(`/v1/public/campaigns/${campaign.slug}/donations`)
      .set('idempotency-key', `consent-c-${stamp}`)
      .send({ ...pledge, consent: true, noticeVersion: 99 })
      .expect(409)
      .expect({ code: 'notice_changed' });
    const page = await request(app.getHttpServer())
      .get(`/v1/public/campaigns/${campaign.slug}`)
      .expect(200);
    const version = page.body.notice.version as number;
    const ok = await request(app.getHttpServer())
      .post(`/v1/public/campaigns/${campaign.slug}/donations`)
      .set('idempotency-key', `consent-d-${stamp}`)
      .send({ ...pledge, consent: true, noticeVersion: version })
      .expect(201);
    const stored = await donation(ok.body.donationId);
    expect(stored.consent_notice_version).toBe(version);
    expect(stored.consented_at).toBeInstanceOf(Date);
  });

  it('rechaza el campo trampa, exige captcha con llave y limita la frecuencia', async () => {
    const { campaign, stamp } = await setup('spam');
    await request(app.getHttpServer())
      .post(`/v1/public/campaigns/${campaign.slug}/donations`)
      .set('idempotency-key', `spam-a-${stamp}`)
      .send({ ...pledge, consent: true, website: 'http://spam.example' })
      .expect(422)
      .expect({ code: 'spam_rejected' });
    await request(app.getHttpServer())
      .post(`/v1/public/campaigns/${campaign.slug}/visits`)
      .set('user-agent', chrome)
      .send({
        anonymousId: '33333333-3333-4333-8333-333333333333',
        eventType: 'view',
        website: 'http://spam.example',
      })
      .expect(422)
      .expect({ code: 'spam_rejected' });

    process.env.TURNSTILE_SECRET_KEY = 'llave-de-prueba';
    try {
      await request(app.getHttpServer())
        .post(`/v1/public/campaigns/${campaign.slug}/donations`)
        .set('idempotency-key', `spam-b-${stamp}`)
        .send({ ...pledge, consent: true })
        .expect(422)
        .expect({ code: 'captcha_required' });
    } finally {
      delete process.env.TURNSTILE_SECRET_KEY;
    }

    // Ya se usaron 2 de 10 envíos por minuto para esta IP y campaña.
    for (let index = 0; index < 8; index += 1) {
      await request(app.getHttpServer())
        .post(`/v1/public/campaigns/${campaign.slug}/donations`)
        .set('idempotency-key', `spam-c-${stamp}-${index}`)
        .send({ ...pledge, consent: true })
        .expect(201);
    }
    await request(app.getHttpServer())
      .post(`/v1/public/campaigns/${campaign.slug}/donations`)
      .set('idempotency-key', `spam-d-${stamp}`)
      .send({ ...pledge, consent: true })
      .expect(429)
      .expect({ code: 'rate_limited' });
  });

  it('no cuenta navegadores automatizados ni clientes HTTP', async () => {
    const { campaign } = await setup('bots');
    const agents = [
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36',
      'curl/8.4.0',
      'python-requests/2.31.0',
      'axios/1.6.0',
      'Go-http-client/1.1',
      'Mozilla/5.0 (compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)',
    ];
    for (const [index, agent] of agents.entries()) {
      await request(app.getHttpServer())
        .post(`/v1/public/campaigns/${campaign.slug}/visits`)
        .set('user-agent', agent)
        .send({
          anonymousId: `44444444-4444-4444-8444-44444444444${index}`,
          eventType: 'view',
        })
        .expect(204);
    }
    await request(app.getHttpServer())
      .post(`/v1/public/campaigns/${campaign.slug}/visits`)
      .set('user-agent', chrome)
      .send({
        anonymousId: '55555555-5555-4555-8555-555555555555',
        eventType: 'view',
      })
      .expect(204);
    const rows = await db.asWorker((client) =>
      client.query<{ counted: boolean; exclude_reason: string | null }>(
        'SELECT counted, exclude_reason FROM visit_event WHERE campaign_id = $1',
        [campaign.id],
      ),
    );
    expect(rows.rows.filter((row) => row.counted)).toHaveLength(1);
    expect(
      rows.rows.filter((row) => row.exclude_reason === 'bot'),
    ).toHaveLength(agents.length);
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
