-- Modelo físico. PostgreSQL 16.
-- Reglas: analisis-sistema-campanas.md (CU-01 a CU-23).
-- La API de consola conecta como app_api y queda sujeta a RLS.
-- Webhooks, pixel, libro y el worker de live conectan como app_worker (BYPASSRLS).
-- Los triggers de solo inserción aplican también a app_worker.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_api') THEN
    CREATE ROLE app_api NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_worker') THEN
    CREATE ROLE app_worker NOLOGIN BYPASSRLS;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app_current_user() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_touch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

-- Catálogo global. Sin organization_id, como pide el análisis.
CREATE TABLE network_catalog (
  code text PRIMARY KEY,
  feed_supported boolean NOT NULL,
  live_mode text NOT NULL CHECK (live_mode IN ('on', 'off', 'unavailable', 'out'))
);

INSERT INTO network_catalog (code, feed_supported, live_mode) VALUES
  ('facebook', true, 'on'),
  ('instagram', true, 'unavailable'),
  ('x', true, 'off'),
  ('youtube', true, 'on'),
  ('tiktok', true, 'off'),
  ('linkedin', true, 'off'),
  ('threads', false, 'out'),
  ('pinterest', false, 'out'),
  ('whatsapp', false, 'out'),
  ('telegram', false, 'out'),
  ('snapchat', false, 'out');

CREATE TABLE plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  price_minor bigint NOT NULL CHECK (price_minor >= 0),
  currency char(3) NOT NULL,
  interval_unit text NOT NULL CHECK (interval_unit IN ('month', 'year', 'internal')),
  campaign_limit integer CHECK (campaign_limit IS NULL OR campaign_limit > 0),
  connection_limit integer CHECK (connection_limit IS NULL OR connection_limit > 0),
  publication_limit integer CHECK (publication_limit IS NULL OR publication_limit >= 0),
  donations_enabled boolean NOT NULL,
  platform_fee_bps integer NOT NULL CHECK (platform_fee_bps >= 0 AND platform_fee_bps <= 10000),
  live_minutes_included integer NOT NULL DEFAULT 0 CHECK (live_minutes_included >= 0),
  seat_limit integer CHECK (seat_limit IS NULL OR seat_limit > 0)
);

-- NULL en un cupo del plan de pago significa que el análisis no fijó tope.
-- El plan fundador trae 0 minutos de live. El plan campana incluye 60 al mes.
INSERT INTO plan (
  code, price_minor, currency, interval_unit, campaign_limit, connection_limit,
  donations_enabled, platform_fee_bps, live_minutes_included, seat_limit
) VALUES
  ('fundador', 0, 'USD', 'internal', 1, 2, true, 0, 0, 1),
  ('campana', 19900, 'USD', 'month', 5, NULL, true, 150, 60, NULL);

-- El análisis la llama user. En PostgreSQL ese nombre es reservado.
CREATE TABLE app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text,
  email_verified_at timestamptz,
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until timestamptz,
  blocked_at timestamptz,
  platform_operator boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- El proveedor no crea usuario ni se enlaza por correo.
-- El subject se guarda después de entrar con la clave local.
CREATE TABLE external_identity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user (id),
  provider text NOT NULL CHECK (provider IN ('google', 'microsoft')),
  subject text NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, subject),
  UNIQUE (user_id, provider)
);

-- State de un uso. El verifier va cifrado y no se escribe en logs.
CREATE TABLE oauth_transaction (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('google', 'microsoft')),
  state_hash text NOT NULL UNIQUE,
  verifier_ciphertext bytea NOT NULL,
  user_id uuid REFERENCES app_user (id),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organization (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  country char(2) NOT NULL,
  legal_name text,
  identity_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE membership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization (id),
  user_id uuid NOT NULL REFERENCES app_user (id),
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'publisher', 'treasurer', 'analyst')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

-- El owner que crea la organización puede sumar un segundo owner para aprobar dispersiones.
CREATE OR REPLACE FUNCTION membership_owner_limit() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role = 'owner' AND (
    SELECT count(*) FROM membership
    WHERE organization_id = NEW.organization_id AND role = 'owner' AND id IS DISTINCT FROM NEW.id
  ) >= 2 THEN
    RAISE EXCEPTION 'owner limit';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER membership_owner_limit BEFORE INSERT OR UPDATE OF role ON membership
  FOR EACH ROW EXECUTE FUNCTION membership_owner_limit();

CREATE TABLE invitation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization (id),
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'editor', 'publisher', 'treasurer', 'analyst')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user (id),
  family_id uuid NOT NULL,
  refresh_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  step_up_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mfa_secret (
  user_id uuid PRIMARY KEY REFERENCES app_user (id),
  secret_ciphertext bytea NOT NULL,
  enabled_at timestamptz NOT NULL
);

CREATE TABLE mfa_recovery_code (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user (id),
  code_hash text NOT NULL UNIQUE,
  used_at timestamptz
);

CREATE TABLE email_token (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user (id),
  purpose text NOT NULL CHECK (purpose IN ('verify', 'reset')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE TABLE device (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user (id),
  organization_id uuid NOT NULL REFERENCES organization (id),
  platform text NOT NULL CHECK (platform IN ('ipad', 'android')),
  display_name text NOT NULL,
  last_refresh_at timestamptz
);

CREATE TABLE subscription (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES organization (id),
  plan_id uuid NOT NULL REFERENCES plan (id),
  pending_plan_id uuid REFERENCES plan (id),
  status text NOT NULL CHECK (status IN ('internal', 'incomplete', 'active', 'past_due', 'canceled')),
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER subscription_touch BEFORE UPDATE ON subscription
  FOR EACH ROW EXECUTE FUNCTION app_touch();

CREATE TABLE invoice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization (id),
  subscription_id uuid NOT NULL REFERENCES subscription (id),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency char(3) NOT NULL,
  status text NOT NULL CHECK (status IN ('open', 'paid', 'void')),
  cfdi_status text NOT NULL DEFAULT 'not_required' CHECK (cfdi_status IN ('not_required', 'pending', 'stamped', 'failed')),
  cfdi_uuid uuid,
  paid_at timestamptz,
  UNIQUE (id)
);

CREATE UNIQUE INDEX invoice_one_cfdi ON invoice (cfdi_uuid) WHERE cfdi_uuid IS NOT NULL;

CREATE TABLE jurisdiction_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  loaded_at timestamptz,
  UNIQUE (code, version)
);

CREATE TABLE campaign (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization (id),
  name text NOT NULL,
  goal_minor bigint CHECK (goal_minor IS NULL OR goal_minor >= 0),
  currency char(3) NOT NULL,
  kind text NOT NULL CHECK (kind IN ('electoral', 'causa', 'comercial')),
  jurisdiction text NOT NULL,
  jurisdiction_policy_id uuid REFERENCES jurisdiction_policy (id),
  time_zone text NOT NULL,
  starts_on date,
  ends_on date,
  status text NOT NULL CHECK (status IN ('borrador', 'en_revision', 'programada', 'activa', 'pausada', 'cerrada', 'archivada')),
  slug text NOT NULL UNIQUE,
  store_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 3 AND 60),
  CONSTRAINT campaign_store_https CHECK (store_url IS NULL OR store_url ~ '^https://'),
  CONSTRAINT campaign_electoral_needs_policy CHECK (kind <> 'electoral' OR jurisdiction_policy_id IS NOT NULL OR status = 'borrador'),
  CONSTRAINT campaign_dates CHECK (starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on)
);

CREATE TRIGGER campaign_touch BEFORE UPDATE ON campaign
  FOR EACH ROW EXECUTE FUNCTION app_touch();

CREATE TABLE privacy_notice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization (id),
  campaign_id uuid NOT NULL REFERENCES campaign (id),
  version integer NOT NULL CHECK (version > 0),
  controller text NOT NULL,
  purpose text NOT NULL,
  data_categories text NOT NULL,
  retention text NOT NULL,
  published_at timestamptz,
  retired_at timestamptz,
  UNIQUE (campaign_id, version),
  CONSTRAINT notice_retired_after_publish CHECK (retired_at IS NULL OR published_at IS NOT NULL)
);

CREATE UNIQUE INDEX privacy_notice_one_published
  ON privacy_notice (campaign_id)
  WHERE published_at IS NOT NULL AND retired_at IS NULL;

-- Con un aviso publicado, el slug de la URL pública queda fijo.
CREATE OR REPLACE FUNCTION campaign_slug_lock() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.slug IS DISTINCT FROM OLD.slug AND EXISTS (
    SELECT 1 FROM privacy_notice
    WHERE campaign_id = OLD.id AND published_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'slug is locked after the privacy notice is published';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER campaign_slug_lock BEFORE UPDATE OF slug ON campaign
  FOR EACH ROW EXECUTE FUNCTION campaign_slug_lock();

CREATE TABLE campaign_share (
  campaign_id uuid PRIMARY KEY REFERENCES campaign (id),
  organization_id uuid NOT NULL REFERENCES organization (id),
  title text NOT NULL,
  description text NOT NULL,
  image_key text
);

CREATE TABLE content_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization (id),
  campaign_id uuid NOT NULL REFERENCES campaign (id),
  status text NOT NULL CHECK (status IN ('borrador', 'en_revision', 'aprobada')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE content_variant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization (id),
  content_item_id uuid NOT NULL REFERENCES content_item (id),
  network_code text NOT NULL REFERENCES network_catalog (code),
  body text NOT NULL,
  media_key text,
  valid boolean NOT NULL DEFAULT false,
  UNIQUE (content_item_id, network_code)
);

CREATE TABLE content_approval (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization (id),
  content_item_id uuid NOT NULL REFERENCES content_item (id),
  approved_by uuid NOT NULL REFERENCES app_user (id),
  approved_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE social_connection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization (id),
  network_code text NOT NULL REFERENCES network_catalog (code),
  external_account_id text NOT NULL,
  token_ciphertext bytea NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'reauth')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, network_code, external_account_id)
);

CREATE TABLE publication (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization (id),
  content_variant_id uuid NOT NULL REFERENCES content_variant (id),
  social_connection_id uuid NOT NULL REFERENCES social_connection (id),
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('scheduled', 'sending', 'published', 'failed', 'canceled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE publication_attempt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization (id),
  publication_id uuid NOT NULL REFERENCES publication (id),
  outcome text NOT NULL CHECK (outcome IN ('retry', 'terminal', 'ok')),
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE donation_page (
  campaign_id uuid PRIMARY KEY REFERENCES campaign (id),
  organization_id uuid NOT NULL REFERENCES organization (id),
  published_at timestamptz
);

CREATE TABLE mandate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization (id),
  campaign_id uuid NOT NULL REFERENCES campaign (id),
  status text NOT NULL CHECK (status IN ('active', 'past_due', 'canceled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE donation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization (id),
  campaign_id uuid NOT NULL REFERENCES campaign (id),
  donation_page_campaign_id uuid NOT NULL REFERENCES donation_page (campaign_id),
  privacy_notice_id uuid NOT NULL REFERENCES privacy_notice (id),
  mandate_id uuid REFERENCES mandate (id),
  parent_donation_id uuid REFERENCES donation (id),
  idempotency_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('pendiente', 'requiere_accion', 'liquidada', 'fallida', 'reembolsada', 'disputada')),
  gross_minor bigint NOT NULL CHECK (gross_minor > 0),
  net_minor bigint NOT NULL CHECK (net_minor >= 0),
  processor_fee_minor bigint NOT NULL CHECK (processor_fee_minor >= 0),
  platform_fee_minor bigint NOT NULL CHECK (platform_fee_minor >= 0),
  currency char(3) NOT NULL,
  donor_name text,
  donor_email text,
  anonymized_at timestamptz,
  visit_anonymous_id uuid,
  provider_payment_id text,
  card_brand text,
  card_last4 char(4),
  origin text CHECK (origin IS NULL OR origin IN (
    'facebook', 'instagram', 'tiktok', 'youtube', 'x', 'linkedin', 'direct', 'other'
  )),
  utm_source text CHECK (utm_source IS NULL OR length(utm_source) <= 100),
  utm_medium text CHECK (utm_medium IS NULL OR length(utm_medium) <= 100),
  utm_campaign text CHECK (utm_campaign IS NULL OR length(utm_campaign) <= 100),
  utm_content text CHECK (utm_content IS NULL OR length(utm_content) <= 100),
  consent_notice_version integer CHECK (consent_notice_version IS NULL OR consent_notice_version > 0),
  consented_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT donation_consent_pair CHECK ((consent_notice_version IS NULL) = (consented_at IS NULL)),
  CONSTRAINT donation_page_same_campaign CHECK (donation_page_campaign_id = campaign_id),
  CONSTRAINT donation_balances CHECK (
    gross_minor = net_minor + processor_fee_minor + platform_fee_minor
  ),
  CONSTRAINT donation_anonymized_clears_contact CHECK (
    anonymized_at IS NULL OR (donor_name IS NULL AND donor_email IS NULL)
  ),
  UNIQUE (campaign_id, idempotency_key)
);

CREATE TABLE campaign_ledger_entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization (id),
  campaign_id uuid NOT NULL REFERENCES campaign (id),
  donation_id uuid REFERENCES donation (id),
  payout_id uuid,
  kind text NOT NULL CHECK (kind IN (
    'gross', 'processor_fee', 'platform_fee', 'refund',
    'dispute_hold', 'dispute_release', 'payout', 'payout_reversal'
  )),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payout (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization (id),
  campaign_id uuid NOT NULL REFERENCES campaign (id),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL,
  status text NOT NULL CHECK (status IN ('requested', 'sent', 'failed')),
  destination_ref text NOT NULL,
  requested_by uuid NOT NULL REFERENCES app_user (id),
  approved_by uuid REFERENCES app_user (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payout_account (
  organization_id uuid PRIMARY KEY REFERENCES organization (id),
  destination_ref text NOT NULL,
  currency char(3) NOT NULL,
  verified_at timestamptz NOT NULL
);

ALTER TABLE campaign_ledger_entry
  ADD CONSTRAINT ledger_payout_fk FOREIGN KEY (payout_id) REFERENCES payout (id);

COMMENT ON TABLE payout IS 'Por encima de 100000 unidades menores de USD, u otra moneda, otro owner aprueba.';

CREATE TABLE ad_spend (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization (id),
  campaign_id uuid NOT NULL REFERENCES campaign (id),
  network_code text NOT NULL REFERENCES network_catalog (code),
  period_start date NOT NULL,
  period_end date NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency char(3) NOT NULL,
  closed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ad_spend_period CHECK (period_end >= period_start)
);

CREATE TABLE visit_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization (id),
  campaign_id uuid NOT NULL REFERENCES campaign (id),
  anonymous_id uuid NOT NULL,
  origin text NOT NULL CHECK (origin IN (
    'facebook', 'instagram', 'tiktok', 'youtube', 'x', 'linkedin', 'direct', 'other'
  )),
  event_type text NOT NULL CHECK (event_type IN ('view', 'click')),
  postal_code text,
  browser text,
  device_class text CHECK (device_class IS NULL OR device_class IN ('phone', 'tablet', 'desktop')),
  counted boolean NOT NULL,
  exclude_reason text CHECK (exclude_reason IS NULL OR exclude_reason IN (
    'preview_ua', 'reload_30m', 'missing_ua', 'bot'
  )),
  utm_source text CHECK (utm_source IS NULL OR length(utm_source) <= 100),
  utm_medium text CHECK (utm_medium IS NULL OR length(utm_medium) <= 100),
  utm_campaign text CHECK (utm_campaign IS NULL OR length(utm_campaign) <= 100),
  utm_content text CHECK (utm_content IS NULL OR length(utm_content) <= 100),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT visit_reason_matches_counted CHECK (
    (counted AND exclude_reason IS NULL) OR (NOT counted AND exclude_reason IS NOT NULL)
  )
);

COMMENT ON TABLE visit_event IS 'view es la carga del landing. click es el clic en Donar. Sin dirección de red. La IP se usa para el código postal y se descarta.';

CREATE TABLE metric_bucket (
  organization_id uuid NOT NULL REFERENCES organization (id),
  campaign_id uuid NOT NULL REFERENCES campaign (id),
  origin text NOT NULL,
  bucket_start timestamptz NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('view', 'click', 'donation')),
  event_count bigint NOT NULL DEFAULT 0 CHECK (event_count >= 0),
  PRIMARY KEY (campaign_id, origin, bucket_start, event_type)
);

CREATE TABLE live_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization (id),
  campaign_id uuid NOT NULL REFERENCES campaign (id),
  started_by uuid NOT NULL REFERENCES app_user (id),
  status text NOT NULL CHECK (status IN ('ready', 'live', 'ended', 'failed')),
  started_at timestamptz,
  ended_at timestamptz,
  recording_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT live_session_times CHECK (ended_at IS NULL OR started_at IS NOT NULL)
);

CREATE TABLE live_destination (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization (id),
  live_session_id uuid NOT NULL REFERENCES live_session (id),
  social_connection_id uuid NOT NULL REFERENCES social_connection (id),
  network_code text NOT NULL REFERENCES network_catalog (code),
  status text NOT NULL CHECK (status IN ('pending', 'live', 'failed', 'ended')),
  failure_reason text,
  external_id text,
  ingest_ciphertext bytea,
  UNIQUE (live_session_id, social_connection_id)
);

COMMENT ON COLUMN live_destination.ingest_ciphertext IS 'Llave RTMP cifrada. No se devuelve al cliente ni se escribe en logs.';

CREATE TABLE live_usage (
  organization_id uuid NOT NULL REFERENCES organization (id),
  period_month date NOT NULL,
  seconds_used integer NOT NULL DEFAULT 0 CHECK (seconds_used >= 0),
  PRIMARY KEY (organization_id, period_month),
  CONSTRAINT live_usage_month CHECK (period_month = date_trunc('month', period_month::timestamp)::date)
);

CREATE TABLE notification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organization (id),
  event_code text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'in_app', 'push')),
  status text NOT NULL CHECK (status IN ('queued', 'sent', 'bounced', 'failed')),
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notification_delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES notification (id),
  attempt_no integer NOT NULL CHECK (attempt_no BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, attempt_no)
);

CREATE TABLE push_token (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES device (id),
  organization_id uuid NOT NULL REFERENCES organization (id),
  token_ciphertext bytea NOT NULL,
  revoked_at timestamptz
);

CREATE TABLE report_job (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization (id),
  requested_by uuid NOT NULL REFERENCES app_user (id),
  surface text NOT NULL CHECK (surface IN ('web', 'tablet')),
  kind text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'ready', 'failed')),
  filters jsonb NOT NULL,
  object_key text,
  provisional boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE webhook_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('donations', 'billing')),
  event_id text NOT NULL,
  payload jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);

CREATE TABLE outbox_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organization (id),
  event_code text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE TABLE audit_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organization (id),
  actor_user_id uuid REFERENCES app_user (id),
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_action (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES app_user (id),
  organization_id uuid REFERENCES organization (id),
  action text NOT NULL,
  support_mode boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Solo inserción y columnas que sí pueden cambiar.

CREATE OR REPLACE FUNCTION reject_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'delete prohibited on %', TG_TABLE_NAME;
END $$;

CREATE OR REPLACE FUNCTION reject_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'update prohibited on %', TG_TABLE_NAME;
END $$;

CREATE OR REPLACE FUNCTION donation_update_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.gross_minor IS DISTINCT FROM OLD.gross_minor
     OR NEW.net_minor IS DISTINCT FROM OLD.net_minor
     OR NEW.processor_fee_minor IS DISTINCT FROM OLD.processor_fee_minor
     OR NEW.platform_fee_minor IS DISTINCT FROM OLD.platform_fee_minor
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.campaign_id IS DISTINCT FROM OLD.campaign_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.privacy_notice_id IS DISTINCT FROM OLD.privacy_notice_id
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
  THEN
    RAISE EXCEPTION 'donation money, campaign and notice version are immutable';
  END IF;
  IF OLD.anonymized_at IS NOT NULL AND (
    NEW.donor_name IS NOT NULL OR NEW.donor_email IS NOT NULL OR NEW.anonymized_at IS DISTINCT FROM OLD.anonymized_at
  ) THEN
    RAISE EXCEPTION 'anonymized donor data cannot be restored';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION ad_spend_update_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.closed AND (
    NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
    OR NEW.period_start IS DISTINCT FROM OLD.period_start
    OR NEW.period_end IS DISTINCT FROM OLD.period_end
    OR NEW.network_code IS DISTINCT FROM OLD.network_code
  ) THEN
    RAISE EXCEPTION 'closed ad spend period cannot be edited';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER donation_no_delete BEFORE DELETE ON donation
  FOR EACH ROW EXECUTE FUNCTION reject_delete();
CREATE TRIGGER donation_guard BEFORE UPDATE ON donation
  FOR EACH ROW EXECUTE FUNCTION donation_update_guard();

CREATE TRIGGER ledger_no_delete BEFORE DELETE ON campaign_ledger_entry
  FOR EACH ROW EXECUTE FUNCTION reject_delete();
CREATE TRIGGER ledger_no_update BEFORE UPDATE ON campaign_ledger_entry
  FOR EACH ROW EXECUTE FUNCTION reject_update();

CREATE TRIGGER attempt_no_delete BEFORE DELETE ON publication_attempt
  FOR EACH ROW EXECUTE FUNCTION reject_delete();
CREATE TRIGGER attempt_no_update BEFORE UPDATE ON publication_attempt
  FOR EACH ROW EXECUTE FUNCTION reject_update();

CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_event
  FOR EACH ROW EXECUTE FUNCTION reject_delete();
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_event
  FOR EACH ROW EXECUTE FUNCTION reject_update();

CREATE TRIGGER webhook_no_delete BEFORE DELETE ON webhook_event
  FOR EACH ROW EXECUTE FUNCTION reject_delete();
CREATE TRIGGER webhook_no_update BEFORE UPDATE ON webhook_event
  FOR EACH ROW EXECUTE FUNCTION reject_update();

CREATE TRIGGER visit_no_delete BEFORE DELETE ON visit_event
  FOR EACH ROW EXECUTE FUNCTION reject_delete();
CREATE TRIGGER visit_no_update BEFORE UPDATE ON visit_event
  FOR EACH ROW EXECUTE FUNCTION reject_update();

CREATE TRIGGER ad_spend_guard BEFORE UPDATE ON ad_spend
  FOR EACH ROW EXECUTE FUNCTION ad_spend_update_guard();

CREATE OR REPLACE FUNCTION donation_page_kind_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_kind text;
BEGIN
  SELECT kind INTO v_kind FROM campaign WHERE id = NEW.campaign_id;
  IF v_kind = 'comercial' THEN
    RAISE EXCEPTION 'a commercial campaign does not open a donation page';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER donation_page_no_commercial BEFORE INSERT OR UPDATE ON donation_page
  FOR EACH ROW EXECUTE FUNCTION donation_page_kind_guard();

-- Visita contada y cubo, en la misma transacción. La clasificación la hace la API.
CREATE OR REPLACE FUNCTION record_visit(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_anonymous_id uuid,
  p_origin text,
  p_postal_code text,
  p_browser text,
  p_device_class text,
  p_counted boolean,
  p_exclude_reason text,
  p_event_type text,
  p_utm_source text DEFAULT NULL,
  p_utm_medium text DEFAULT NULL,
  p_utm_campaign text DEFAULT NULL,
  p_utm_content text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid;
  v_bucket timestamptz := date_trunc('hour', now());
BEGIN
  INSERT INTO visit_event (
    organization_id, campaign_id, anonymous_id, origin, event_type, postal_code, browser,
    device_class, counted, exclude_reason, utm_source, utm_medium, utm_campaign, utm_content
  ) VALUES (
    p_organization_id, p_campaign_id, p_anonymous_id, p_origin, p_event_type, p_postal_code, p_browser,
    p_device_class, p_counted, p_exclude_reason, p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content
  ) RETURNING id INTO v_id;

  IF p_counted THEN
    INSERT INTO metric_bucket (organization_id, campaign_id, origin, bucket_start, event_type, event_count)
    VALUES (p_organization_id, p_campaign_id, p_origin, v_bucket, p_event_type, 1)
    ON CONFLICT (campaign_id, origin, bucket_start, event_type)
    DO UPDATE SET event_count = metric_bucket.event_count + 1;
  END IF;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION record_visit(
  uuid, uuid, uuid, text, text, text, text, boolean, text, text, text, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_visit(
  uuid, uuid, uuid, text, text, text, text, boolean, text, text, text, text, text, text
) TO app_worker;

-- RLS. app_worker la salta. app_api no.

-- SECURITY DEFINER y dueño app_worker: la lectura de membership no se enreda con su propia RLS.
CREATE OR REPLACE FUNCTION app_can_select(p_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM membership m
    WHERE m.organization_id = p_org AND m.user_id = app_current_user()
  );
$$;

CREATE OR REPLACE FUNCTION app_member_roles(p_org uuid) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(m.role), ARRAY[]::text[])
  FROM membership m
  WHERE m.organization_id = p_org AND m.user_id = app_current_user()
$$;

ALTER FUNCTION app_can_select(uuid) OWNER TO app_worker;
ALTER FUNCTION app_member_roles(uuid) OWNER TO app_worker;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'membership', 'invitation', 'device', 'subscription', 'invoice', 'campaign',
    'privacy_notice', 'campaign_share', 'content_item', 'content_variant', 'content_approval',
    'social_connection', 'publication', 'publication_attempt', 'donation_page', 'mandate',
    'donation', 'campaign_ledger_entry', 'payout', 'ad_spend', 'visit_event', 'metric_bucket',
    'live_session', 'live_destination', 'live_usage', 'notification', 'report_job', 'push_token',
    'payout_account'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO app_api USING (app_can_select(organization_id))',
      t || '_select', t
    );
  END LOOP;
END $$;

-- Lectura más estrecha: instrumentos de pago y gasto.
DROP POLICY donation_select ON donation;
CREATE POLICY donation_select ON donation FOR SELECT TO app_api USING (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
  OR 'treasurer' = ANY (app_member_roles(organization_id))
  OR 'analyst' = ANY (app_member_roles(organization_id))
);

CREATE POLICY donation_contact_update ON donation FOR UPDATE TO app_api USING (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'treasurer' = ANY (app_member_roles(organization_id))
) WITH CHECK (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'treasurer' = ANY (app_member_roles(organization_id))
);

DROP POLICY campaign_ledger_entry_select ON campaign_ledger_entry;
CREATE POLICY ledger_select ON campaign_ledger_entry FOR SELECT TO app_api USING (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
  OR 'treasurer' = ANY (app_member_roles(organization_id))
  OR 'analyst' = ANY (app_member_roles(organization_id))
);

DROP POLICY payout_select ON payout;
CREATE POLICY payout_select ON payout FOR SELECT TO app_api USING (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'treasurer' = ANY (app_member_roles(organization_id))
  OR 'analyst' = ANY (app_member_roles(organization_id))
);

CREATE POLICY payout_write ON payout FOR INSERT TO app_api WITH CHECK (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'treasurer' = ANY (app_member_roles(organization_id))
);

CREATE POLICY payout_update ON payout FOR UPDATE TO app_api USING (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'treasurer' = ANY (app_member_roles(organization_id))
) WITH CHECK (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'treasurer' = ANY (app_member_roles(organization_id))
);

DROP POLICY payout_account_select ON payout_account;
CREATE POLICY payout_account_select ON payout_account FOR SELECT TO app_api USING (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'treasurer' = ANY (app_member_roles(organization_id))
  OR 'analyst' = ANY (app_member_roles(organization_id))
);

CREATE POLICY payout_account_write ON payout_account FOR INSERT TO app_api WITH CHECK (
  'owner' = ANY (app_member_roles(organization_id))
);

CREATE POLICY payout_account_update ON payout_account FOR UPDATE TO app_api USING (
  'owner' = ANY (app_member_roles(organization_id))
) WITH CHECK (
  'owner' = ANY (app_member_roles(organization_id))
);

DROP POLICY ad_spend_select ON ad_spend;
CREATE POLICY ad_spend_select ON ad_spend FOR SELECT TO app_api USING (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
);

CREATE POLICY membership_self_owner ON membership FOR INSERT TO app_api
  WITH CHECK (user_id = app_current_user() AND role = 'owner');

CREATE POLICY membership_second_owner ON membership FOR INSERT TO app_api
  WITH CHECK (
    role = 'owner'
    AND user_id <> app_current_user()
    AND 'owner' = ANY (app_member_roles(organization_id))
  );

CREATE POLICY membership_remove ON membership FOR DELETE TO app_api
  USING (
    role <> 'owner'
    AND user_id <> app_current_user()
    AND (
      'owner' = ANY (app_member_roles(organization_id))
      OR 'admin' = ANY (app_member_roles(organization_id))
    )
  );

CREATE POLICY invitation_write ON invitation FOR INSERT TO app_api
  WITH CHECK (
    role IN ('admin', 'editor', 'publisher', 'treasurer', 'analyst')
    AND (
      'owner' = ANY (app_member_roles(organization_id))
      OR 'admin' = ANY (app_member_roles(organization_id))
    )
  );

CREATE POLICY invitation_update ON invitation FOR UPDATE TO app_api
  USING (
    'owner' = ANY (app_member_roles(organization_id))
    OR 'admin' = ANY (app_member_roles(organization_id))
  )
  WITH CHECK (
    role IN ('admin', 'editor', 'publisher', 'treasurer', 'analyst')
    AND (
      'owner' = ANY (app_member_roles(organization_id))
      OR 'admin' = ANY (app_member_roles(organization_id))
    )
  );

CREATE POLICY report_write ON report_job FOR INSERT TO app_api
  WITH CHECK (
    requested_by = app_current_user()
    AND (
      'owner' = ANY (app_member_roles(organization_id))
      OR 'treasurer' = ANY (app_member_roles(organization_id))
      OR 'analyst' = ANY (app_member_roles(organization_id))
    )
  );

CREATE POLICY subscription_owner_insert ON subscription FOR INSERT TO app_api
  WITH CHECK ('owner' = ANY (app_member_roles(organization_id)));
CREATE POLICY subscription_owner_update ON subscription FOR UPDATE TO app_api USING (
  'owner' = ANY (app_member_roles(organization_id))
) WITH CHECK (
  'owner' = ANY (app_member_roles(organization_id))
);

CREATE POLICY campaign_write ON campaign FOR INSERT TO app_api WITH CHECK (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
  OR 'editor' = ANY (app_member_roles(organization_id))
);
CREATE POLICY campaign_update ON campaign FOR UPDATE TO app_api USING (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
  OR 'editor' = ANY (app_member_roles(organization_id))
);

CREATE POLICY notice_write ON privacy_notice FOR INSERT TO app_api WITH CHECK (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
);
CREATE POLICY notice_update ON privacy_notice FOR UPDATE TO app_api USING (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
);

CREATE POLICY page_write ON donation_page FOR INSERT TO app_api WITH CHECK (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
);
CREATE POLICY page_update ON donation_page FOR UPDATE TO app_api USING (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
);

CREATE POLICY live_dest_write ON live_destination FOR INSERT TO app_api WITH CHECK (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
  OR 'publisher' = ANY (app_member_roles(organization_id))
);
CREATE POLICY live_dest_update ON live_destination FOR UPDATE TO app_api USING (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
  OR 'publisher' = ANY (app_member_roles(organization_id))
);

CREATE POLICY live_write ON live_session FOR INSERT TO app_api WITH CHECK (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
  OR 'publisher' = ANY (app_member_roles(organization_id))
);
CREATE POLICY live_update ON live_session FOR UPDATE TO app_api USING (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
  OR 'publisher' = ANY (app_member_roles(organization_id))
);

CREATE POLICY spend_write ON ad_spend FOR INSERT TO app_api WITH CHECK (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
);
CREATE POLICY spend_update ON ad_spend FOR UPDATE TO app_api USING (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
) WITH CHECK (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
);

GRANT SELECT ON network_catalog, plan, jurisdiction_policy TO app_api, app_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_worker;
GRANT SELECT, INSERT ON external_identity TO app_api;

GRANT DELETE ON membership TO app_api;

GRANT SELECT, INSERT, UPDATE ON
  app_user, organization, membership, invitation, session, mfa_secret, mfa_recovery_code,
  email_token, device, subscription, invoice, campaign, privacy_notice, campaign_share,
  content_item, content_variant, content_approval, social_connection, publication,
  donation_page, mandate, donation, payout, payout_account, ad_spend, live_session, live_destination,
  live_usage, notification, push_token, report_job, outbox_event
TO app_api;

GRANT SELECT ON publication_attempt, campaign_ledger_entry, visit_event, metric_bucket TO app_api;

ALTER TABLE audit_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_event FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_select ON audit_event FOR SELECT TO app_api
  USING (organization_id IS NOT NULL AND app_can_select(organization_id));

ALTER TABLE outbox_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_event FORCE ROW LEVEL SECURITY;
CREATE POLICY outbox_select ON outbox_event FOR SELECT TO app_api
  USING (organization_id IS NOT NULL AND app_can_select(organization_id));
CREATE POLICY outbox_insert ON outbox_event FOR INSERT TO app_api
  WITH CHECK (organization_id IS NOT NULL AND app_can_select(organization_id));

GRANT SELECT ON audit_event TO app_api;

ALTER TABLE external_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_identity FORCE ROW LEVEL SECURITY;
CREATE POLICY external_identity_select ON external_identity FOR SELECT TO app_api
  USING (user_id = app_current_user());
CREATE POLICY external_identity_insert ON external_identity FOR INSERT TO app_api
  WITH CHECK (user_id = app_current_user());

REVOKE DELETE ON donation, campaign_ledger_entry, publication_attempt, visit_event,
  webhook_event, audit_event FROM app_worker;

-- State del OAuth de una red. No abre sesión en la consola.
CREATE TABLE network_oauth_transaction (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization (id),
  user_id uuid NOT NULL REFERENCES app_user (id),
  network_code text NOT NULL REFERENCES network_catalog (code),
  state_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON network_oauth_transaction TO app_worker;

CREATE POLICY connection_write ON social_connection FOR INSERT TO app_api WITH CHECK (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
);
CREATE POLICY connection_update ON social_connection FOR UPDATE TO app_api USING (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
) WITH CHECK (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
);

CREATE POLICY content_write ON content_item FOR INSERT TO app_api WITH CHECK (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
  OR 'editor' = ANY (app_member_roles(organization_id))
);
CREATE POLICY content_update ON content_item FOR UPDATE TO app_api USING (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
  OR 'editor' = ANY (app_member_roles(organization_id))
) WITH CHECK (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
  OR 'editor' = ANY (app_member_roles(organization_id))
);

CREATE POLICY variant_write ON content_variant FOR INSERT TO app_api WITH CHECK (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
  OR 'editor' = ANY (app_member_roles(organization_id))
);
CREATE POLICY variant_update ON content_variant FOR UPDATE TO app_api USING (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
  OR 'editor' = ANY (app_member_roles(organization_id))
) WITH CHECK (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
  OR 'editor' = ANY (app_member_roles(organization_id))
);

CREATE POLICY approval_write ON content_approval FOR INSERT TO app_api WITH CHECK (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
);

CREATE POLICY share_write ON campaign_share FOR INSERT TO app_api WITH CHECK (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
  OR 'editor' = ANY (app_member_roles(organization_id))
);
CREATE POLICY share_update ON campaign_share FOR UPDATE TO app_api USING (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
  OR 'editor' = ANY (app_member_roles(organization_id))
) WITH CHECK (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
  OR 'editor' = ANY (app_member_roles(organization_id))
);

CREATE POLICY publication_write ON publication FOR INSERT TO app_api WITH CHECK (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
  OR 'publisher' = ANY (app_member_roles(organization_id))
);
CREATE POLICY publication_update ON publication FOR UPDATE TO app_api USING (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
  OR 'publisher' = ANY (app_member_roles(organization_id))
) WITH CHECK (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
  OR 'publisher' = ANY (app_member_roles(organization_id))
);
