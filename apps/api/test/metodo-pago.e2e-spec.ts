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
const clabe = '002010077777777771';

describe('Método de pago externo', () => {
  let app: INestApplication<App>;
  let mail: MailService;
  let db: DbService;
  const password = 'clave-segura-12';
  const savedSecret = process.env.TURNSTILE_SECRET_KEY;
  const savedDomains = process.env.PAYMENT_LINK_ALLOWED_DOMAINS;

  beforeAll(async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    delete process.env.PAYMENT_LINK_ALLOWED_DOMAINS;
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
    if (savedDomains === undefined)
      delete process.env.PAYMENT_LINK_ALLOWED_DOMAINS;
    else process.env.PAYMENT_LINK_ALLOWED_DOMAINS = savedDomains;
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
      `Pago ${label} ${stamp}`,
    );
    return { owner, org: org.body.id as string, campaign, stamp };
  }

  function putMethod(owner: string, org: string, id: string, body: object) {
    return request(app.getHttpServer())
      .put(`/v1/campaigns/${id}/payment-method`)
      .set('authorization', `Bearer ${owner}`)
      .set('x-organization-id', org)
      .send(body);
  }

  it('valida enlace (https y lista de dominios) y CLABE', async () => {
    const { owner, org, campaign } = await setup('valida');
    const cases: [object, string][] = [
      [{ paymentLinkUrl: 'http://mpago.la/abc' }, 'payment_link_invalid'],
      [{ paymentLinkUrl: 'https://evil.example/pay' }, 'payment_link_domain'],
      [
        { paymentLinkUrl: 'https://paypal.me.evil.example/x' },
        'payment_link_domain',
      ],
      [
        {
          transferBank: 'BBVA',
          transferHolder: 'Causa AC',
          transferClabe: '002010077777777772',
        },
        'clabe_invalid',
      ],
      [{ transferClabe: clabe }, 'transfer_incomplete'],
    ];
    for (const [body, code] of cases) {
      const response = await putMethod(owner, org, campaign.id, body).expect(
        422,
      );
      expect(response.body.code ?? response.body.message).toBe(code);
    }

    // Al crear también se valida.
    await request(app.getHttpServer())
      .post('/v1/campaigns')
      .set('authorization', `Bearer ${owner}`)
      .set('x-organization-id', org)
      .send({
        name: 'Con enlace malo',
        currency: 'USD',
        kind: 'causa',
        jurisdiction: 'MX',
        timeZone: 'America/Mexico_City',
        paymentLinkUrl: 'https://evil.example/pay',
      })
      .expect(422);

    // Lista de dominios configurable por entorno.
    process.env.PAYMENT_LINK_ALLOWED_DOMAINS = 'pagos.example';
    await putMethod(owner, org, campaign.id, {
      paymentLinkUrl: 'https://mpago.la/abc',
    }).expect(422);
    const custom = await putMethod(owner, org, campaign.id, {
      paymentLinkUrl: 'https://www.pagos.example/c/1',
    }).expect(200);
    expect(custom.body.paymentMethod.link).toEqual({
      url: 'https://www.pagos.example/c/1',
      provider: 'other',
    });
    delete process.env.PAYMENT_LINK_ALLOWED_DOMAINS;
  });

  it('publica el método, registra clics con UTM y filtra bots', async () => {
    const { owner, org, campaign } = await setup('publica');
    const saved = await putMethod(owner, org, campaign.id, {
      paymentLinkUrl: 'https://mpago.la/2Xyz',
      transferBank: 'BBVA',
      transferHolder: 'Causa AC',
      transferClabe: '0020 1007 7777 7777 71',
      transferReference: 'DONATIVO',
    }).expect(200);
    expect(saved.body.paymentMethod).toEqual({
      link: { url: 'https://mpago.la/2Xyz', provider: 'mercadopago' },
      transfer: {
        bank: 'BBVA',
        holder: 'Causa AC',
        clabe,
        reference: 'DONATIVO',
      },
    });

    // En borrador no se publica ni acepta eventos de pago.
    const draft = await request(app.getHttpServer())
      .get(`/v1/public/campaigns/${campaign.slug}`)
      .expect((response) => expect(response.status).not.toBe(500));
    if (draft.status === 200) expect(draft.body.paymentMethod).toBeNull();

    await publishAndActivate(app, owner, org, campaign.id);
    const publicCampaign = await request(app.getHttpServer())
      .get(`/v1/public/campaigns/${campaign.slug}`)
      .expect(200);
    expect(publicCampaign.body.paymentMethod.link.provider).toBe('mercadopago');
    expect(publicCampaign.body.paymentMethod.transfer.clabe).toBe(clabe);

    const visitor = '33333333-3333-4333-8333-333333333333';
    const utm = {
      utmSource: 'facebook',
      utmMedium: 'paid_social',
      utmCampaign: 'pago',
    };
    for (const eventType of ['view', 'pay_link', 'pay_transfer']) {
      await request(app.getHttpServer())
        .post(`/v1/public/campaigns/${campaign.slug}/visits`)
        .set('user-agent', chrome)
        .send({ anonymousId: visitor, eventType, ...utm })
        .expect(204);
    }
    // Un bot no cuenta.
    await request(app.getHttpServer())
      .post(`/v1/public/campaigns/${campaign.slug}/visits`)
      .set('user-agent', 'Googlebot/2.1 (+http://www.google.com/bot.html)')
      .send({
        anonymousId: '44444444-4444-4444-8444-444444444444',
        eventType: 'pay_link',
        ...utm,
      })
      .expect(204);
    await request(app.getHttpServer())
      .post(`/v1/public/campaigns/${campaign.slug}/visits`)
      .set('user-agent', chrome)
      .send({ anonymousId: visitor, eventType: 'pay_card' })
      .expect(422);

    const events = await db.asWorker((client) =>
      client.query<{ event_type: string; counted: boolean; origin: string }>(
        `SELECT event_type, counted, origin FROM visit_event
         WHERE campaign_id = $1 AND event_type LIKE 'pay_%' ORDER BY counted, event_type`,
        [campaign.id],
      ),
    );
    expect(events.rows).toEqual([
      { event_type: 'pay_link', counted: false, origin: 'facebook' },
      { event_type: 'pay_link', counted: true, origin: 'facebook' },
      { event_type: 'pay_transfer', counted: true, origin: 'facebook' },
    ]);

    const from = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    const to = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const conversion = await request(app.getHttpServer())
      .get(`/v1/campaigns/${campaign.id}/conversion?from=${from}&to=${to}`)
      .set('authorization', `Bearer ${owner}`)
      .set('x-organization-id', org)
      .expect(200);
    expect(conversion.body.rows[0]).toMatchObject({
      origin: 'facebook',
      utmCampaign: 'pago',
      visitors: 1,
      payLinkClicks: 1,
      payTransferViews: 1,
      payRate: 2,
    });
    const csv = await request(app.getHttpServer())
      .get(`/v1/campaigns/${campaign.id}/conversion.csv?from=${from}&to=${to}`)
      .set('authorization', `Bearer ${owner}`)
      .set('x-organization-id', org)
      .expect(200);
    expect(csv.text.trim().split('\r\n')[1]).toBe(
      'facebook,facebook,paid_social,pago,,1,0,0,0,1,1,2',
    );

    // Quitar el método: los eventos de pago se rechazan.
    await putMethod(owner, org, campaign.id, {}).expect(200);
    await request(app.getHttpServer())
      .post(`/v1/public/campaigns/${campaign.slug}/visits`)
      .set('user-agent', chrome)
      .send({ anonymousId: visitor, eventType: 'pay_link' })
      .expect(422);
  });

  it('la intención de donativo sigue funcionando sin método externo', async () => {
    const { owner, org, campaign, stamp } = await setup('sinmetodo');
    await publishAndActivate(app, owner, org, campaign.id);
    const publicCampaign = await request(app.getHttpServer())
      .get(`/v1/public/campaigns/${campaign.slug}`)
      .expect(200);
    expect(publicCampaign.body.paymentMethod).toEqual({
      link: null,
      transfer: null,
    });
    expect(publicCampaign.body.donateEnabled).toBe(true);
    await request(app.getHttpServer())
      .post(`/v1/public/campaigns/${campaign.slug}/donations`)
      .set('idempotency-key', `sin-metodo-${stamp}`)
      .send({
        amountMinor: 2000,
        currency: 'USD',
        donorName: 'Ana Ruiz',
        donorEmail: 'donante-pago@example.test',
        personKind: 'individual',
        consent: true,
      })
      .expect(201);
  });

  it('solo owner/admin pueden cambiarlo', async () => {
    const { campaign, org } = await setup('permiso');
    const stranger = await account(
      app,
      mail,
      `extrano-${Date.now()}@example.test`,
      password,
    );
    await putMethod(stranger, org, campaign.id, {
      paymentLinkUrl: 'https://mpago.la/x',
    }).expect((response) => expect([403, 404]).toContain(response.status));
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
