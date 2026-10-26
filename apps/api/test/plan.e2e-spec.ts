import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { CfdiGateway } from '../src/comercial/cfdi.gateway';
import { DbService } from '../src/db/db.service';
import { MailService } from '../src/mail/mail.service';
import { signBillingWebhook } from '../src/shared/crypto';

jest.setTimeout(60000);

describe('historia 11', () => {
  let app: INestApplication<App>;
  let mail: MailService;
  let db: DbService;
  let cfdi: CfdiGateway;
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
    cfdi = app.get(CfdiGateway);
  });

  afterAll(async () => {
    await app.close();
  });

  it('un pago fallido no da de alta y uno pagado reemplaza al fundador con 60 minutos', async () => {
    const email = `plan-${Date.now()}@example.test`;
    const session = await account(app, mail, email, password);
    const org = await request(app.getHttpServer())
      .post('/v1/organizations')
      .set('authorization', `Bearer ${session}`)
      .send({ name: 'Causa del plan', country: 'MX' })
      .expect(201);
    const founder = await request(app.getHttpServer())
      .get('/v1/subscription')
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .expect(200);
    expect(founder.body).toMatchObject({
      plan: 'fundador',
      status: 'internal',
      liveMinutesIncluded: 0,
    });
    cfdi.outcome = 'ok';

    const checkout = await request(app.getHttpServer())
      .post('/v1/subscriptions/checkout')
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .send({ plan: 'campana' })
      .expect(201);
    await bill(
      app,
      checkout.body.invoiceId,
      'failed',
      `evt-falla-${Date.now()}`,
    );
    const blocked = await request(app.getHttpServer())
      .get('/v1/subscription')
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .expect(200);
    expect(blocked.body).toMatchObject({
      plan: 'fundador',
      status: 'incomplete',
      liveMinutesIncluded: 0,
    });
    const denied = await request(app.getHttpServer())
      .post('/v1/campaigns')
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .send(campaignBody(`Rio bloqueado ${Date.now()}`))
      .expect(422);
    expect(denied.body.code).toBe('subscription_inactive');
    expect(await campaignCount(db, org.body.id)).toBe(0);

    cfdi.calls = [];
    const paid = JSON.stringify({
      id: `evt-pago-${Date.now()}`,
      outcome: 'paid',
      invoiceId: checkout.body.invoiceId,
    });
    await request(app.getHttpServer())
      .post('/v1/webhooks/billing')
      .set('stripe-signature', signBillingWebhook(paid))
      .set('content-type', 'application/json')
      .send(paid)
      .expect(200);
    await request(app.getHttpServer())
      .post('/v1/webhooks/billing')
      .set('stripe-signature', signBillingWebhook(paid))
      .set('content-type', 'application/json')
      .send(paid)
      .expect(200);
    const active = await request(app.getHttpServer())
      .get('/v1/subscription')
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .expect(200);
    expect(active.body.plan).toBe('campana');
    expect(active.body.status).toBe('active');
    expect(active.body.liveMinutesIncluded).toBe(60);
    expect(active.body.invoice.cfdiStatus).toBe('stamped');
    expect(active.body.invoice.cfdiUuid).toBeTruthy();
    expect(cfdi.calls).toEqual([checkout.body.invoiceId]);
    expect(await ledgerCount(db, org.body.id)).toBe(0);

    await request(app.getHttpServer())
      .post('/v1/campaigns')
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .send(campaignBody(`Rio uno ${Date.now()}`))
      .expect(201);
    await request(app.getHttpServer())
      .post('/v1/campaigns')
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .send(campaignBody(`Rio dos ${Date.now()}`))
      .expect(201);
    const deferred = await request(app.getHttpServer())
      .post('/v1/subscriptions/downgrade')
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .expect(200);
    expect(deferred.body.plan).toBe('campana');
    expect(deferred.body.pendingPlan).toBe('fundador');

    const canceled = await request(app.getHttpServer())
      .post('/v1/subscriptions/cancel')
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .expect(200);
    expect(canceled.body.cancelAtPeriodEnd).toBe(true);
    await request(app.getHttpServer())
      .post('/v1/campaigns')
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .send(campaignBody(`Rio tres ${Date.now()}`))
      .expect(201);
    await db.asWorker((client) =>
      client.query(
        `UPDATE subscription SET current_period_end = now() - interval '1 day' WHERE organization_id = $1`,
        [org.body.id],
      ),
    );
    const after = await request(app.getHttpServer())
      .post('/v1/campaigns')
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .send(campaignBody(`Rio cuatro ${Date.now()}`))
      .expect(422);
    expect(after.body.code).toBe('subscription_inactive');
  });

  it('el PAC puede fallar y el reintento usa la misma factura', async () => {
    const email = `cfdi-${Date.now()}@example.test`;
    const session = await account(app, mail, email, password);
    const org = await request(app.getHttpServer())
      .post('/v1/organizations')
      .set('authorization', `Bearer ${session}`)
      .send({ name: 'Causa del folio', country: 'MX' })
      .expect(201);
    const checkout = await request(app.getHttpServer())
      .post('/v1/subscriptions/checkout')
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .send({ plan: 'campana' })
      .expect(201);
    cfdi.outcome = 'rejected';
    cfdi.calls = [];
    await bill(
      app,
      checkout.body.invoiceId,
      'paid',
      `evt-rechazo-${Date.now()}`,
    );
    const failed = await request(app.getHttpServer())
      .get('/v1/subscription')
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .expect(200);
    expect(failed.body.status).toBe('active');
    expect(failed.body.liveMinutesIncluded).toBe(60);
    expect(failed.body.invoice.cfdiStatus).toBe('failed');
    expect(failed.body.invoice.cfdiUuid).toBeNull();

    cfdi.outcome = 'ok';
    const stamped = await request(app.getHttpServer())
      .post(`/v1/invoices/${checkout.body.invoiceId}/cfdi`)
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .expect(200);
    expect(stamped.body.invoice.cfdiStatus).toBe('stamped');
    const folio = stamped.body.invoice.cfdiUuid;
    await request(app.getHttpServer())
      .post(`/v1/invoices/${checkout.body.invoiceId}/cfdi`)
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .expect(200);
    expect(cfdi.calls).toEqual([
      checkout.body.invoiceId,
      checkout.body.invoiceId,
    ]);
    const again = await request(app.getHttpServer())
      .get('/v1/subscription')
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .expect(200);
    expect(again.body.invoice.cfdiUuid).toBe(folio);

    await bill(
      app,
      checkout.body.invoiceId,
      'failed',
      `evt-vencido-${Date.now()}`,
    );
    const late = await request(app.getHttpServer())
      .post('/v1/campaigns')
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .send(campaignBody(`Rio vencido ${Date.now()}`))
      .expect(422);
    expect(late.body.code).toBe('subscription_inactive');
    const due = await request(app.getHttpServer())
      .get('/v1/subscription')
      .set('authorization', `Bearer ${session}`)
      .set('x-organization-id', org.body.id)
      .expect(200);
    expect(due.body.status).toBe('past_due');
    cfdi.outcome = 'ok';
  });
});

function bill(
  app: INestApplication<App>,
  invoiceId: string,
  outcome: string,
  id: string,
) {
  const payload = JSON.stringify({ id, outcome, invoiceId });
  return request(app.getHttpServer())
    .post('/v1/webhooks/billing')
    .set('stripe-signature', signBillingWebhook(payload))
    .set('content-type', 'application/json')
    .send(payload)
    .expect(200);
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

function campaignBody(name: string) {
  return {
    name,
    currency: 'USD',
    kind: 'causa',
    jurisdiction: 'MX',
    timeZone: 'America/Mexico_City',
  };
}

async function campaignCount(db: DbService, organizationId: string) {
  const rows = await db.asWorker((client) =>
    client.query<{ count: string }>(
      'SELECT count(*) FROM campaign WHERE organization_id = $1',
      [organizationId],
    ),
  );
  return Number(rows.rows[0].count);
}

async function ledgerCount(db: DbService, organizationId: string) {
  const rows = await db.asWorker((client) =>
    client.query<{ count: string }>(
      'SELECT count(*) FROM campaign_ledger_entry WHERE organization_id = $1',
      [organizationId],
    ),
  );
  return Number(rows.rows[0].count);
}
