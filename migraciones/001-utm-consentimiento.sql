-- Aplica sobre una base creada con la versión anterior de campanas-esquema.sql.
-- Bases nuevas: basta con campanas-esquema.sql.
BEGIN;
ALTER TABLE visit_event
  ADD COLUMN utm_source text CHECK (utm_source IS NULL OR length(utm_source) <= 100),
  ADD COLUMN utm_medium text CHECK (utm_medium IS NULL OR length(utm_medium) <= 100),
  ADD COLUMN utm_campaign text CHECK (utm_campaign IS NULL OR length(utm_campaign) <= 100),
  ADD COLUMN utm_content text CHECK (utm_content IS NULL OR length(utm_content) <= 100);
ALTER TABLE donation
  ADD COLUMN origin text CHECK (origin IS NULL OR origin IN (
    'facebook', 'instagram', 'tiktok', 'youtube', 'x', 'linkedin', 'direct', 'other'
  )),
  ADD COLUMN utm_source text CHECK (utm_source IS NULL OR length(utm_source) <= 100),
  ADD COLUMN utm_medium text CHECK (utm_medium IS NULL OR length(utm_medium) <= 100),
  ADD COLUMN utm_campaign text CHECK (utm_campaign IS NULL OR length(utm_campaign) <= 100),
  ADD COLUMN utm_content text CHECK (utm_content IS NULL OR length(utm_content) <= 100),
  ADD COLUMN consent_notice_version integer CHECK (consent_notice_version IS NULL OR consent_notice_version > 0),
  ADD COLUMN consented_at timestamptz,
  ADD CONSTRAINT donation_consent_pair CHECK ((consent_notice_version IS NULL) = (consented_at IS NULL));
DROP FUNCTION record_visit(uuid, uuid, uuid, text, text, text, text, boolean, text, text);
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
COMMIT;
