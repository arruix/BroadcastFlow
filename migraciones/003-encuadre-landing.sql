-- Aplica sobre una base creada antes de las tablas de encuadre y página pública.
-- Bases nuevas: basta con campanas-esquema.sql. Esta migración es aditiva.
BEGIN;

CREATE TABLE campaign_frame (
  campaign_id uuid NOT NULL REFERENCES campaign (id),
  organization_id uuid NOT NULL REFERENCES organization (id),
  placement text NOT NULL CHECK (placement IN (
    'facebook', 'instagram-feed', 'instagram-story', 'tiktok', 'x', 'linkedin', 'whatsapp', 'youtube'
  )),
  focus_x double precision NOT NULL CHECK (focus_x >= 0 AND focus_x <= 100),
  focus_y double precision NOT NULL CHECK (focus_y >= 0 AND focus_y <= 100),
  zoom double precision NOT NULL CHECK (zoom >= 1 AND zoom <= 3),
  PRIMARY KEY (campaign_id, placement)
);

CREATE TABLE campaign_landing (
  campaign_id uuid PRIMARY KEY REFERENCES campaign (id),
  organization_id uuid NOT NULL REFERENCES organization (id),
  title text NOT NULL CHECK (char_length(btrim(title)) > 0 AND char_length(title) <= 140),
  story text NOT NULL CHECK (char_length(btrim(story)) > 0 AND char_length(story) <= 4000),
  image_key text CHECK (image_key IS NULL OR (image_key LIKE 'https://%' AND char_length(image_key) <= 2000)),
  hero_x double precision NOT NULL DEFAULT 50 CHECK (hero_x >= 0 AND hero_x <= 100),
  hero_y double precision NOT NULL DEFAULT 35 CHECK (hero_y >= 0 AND hero_y <= 100),
  hero_zoom double precision NOT NULL DEFAULT 1 CHECK (hero_zoom >= 1 AND hero_zoom <= 3),
  accent text NOT NULL DEFAULT '#0f766e' CHECK (accent ~ '^#[0-9a-f]{6}$'),
  amounts_minor integer[] NOT NULL DEFAULT ARRAY[1000, 2500, 5000, 10000],
  cta text NOT NULL DEFAULT '' CHECK (char_length(cta) <= 80),
  show_progress boolean NOT NULL DEFAULT true,
  thank_you text NOT NULL DEFAULT '' CHECK (char_length(thank_you) <= 400),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_landing_amounts CHECK (cardinality(amounts_minor) BETWEEN 1 AND 6)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON campaign_frame, campaign_landing TO app_worker;
GRANT SELECT, INSERT, UPDATE ON campaign_frame, campaign_landing TO app_api;

ALTER TABLE campaign_frame ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_frame FORCE ROW LEVEL SECURITY;
ALTER TABLE campaign_landing ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_landing FORCE ROW LEVEL SECURITY;

CREATE POLICY campaign_frame_select ON campaign_frame FOR SELECT TO app_api
  USING (app_can_select(organization_id));
CREATE POLICY campaign_landing_select ON campaign_landing FOR SELECT TO app_api
  USING (app_can_select(organization_id));

CREATE POLICY frame_write ON campaign_frame FOR INSERT TO app_api WITH CHECK (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
  OR 'editor' = ANY (app_member_roles(organization_id))
);
CREATE POLICY frame_update ON campaign_frame FOR UPDATE TO app_api USING (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
  OR 'editor' = ANY (app_member_roles(organization_id))
) WITH CHECK (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
  OR 'editor' = ANY (app_member_roles(organization_id))
);

CREATE POLICY landing_write ON campaign_landing FOR INSERT TO app_api WITH CHECK (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
  OR 'editor' = ANY (app_member_roles(organization_id))
);
CREATE POLICY landing_update ON campaign_landing FOR UPDATE TO app_api USING (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
  OR 'editor' = ANY (app_member_roles(organization_id))
) WITH CHECK (
  'owner' = ANY (app_member_roles(organization_id))
  OR 'admin' = ANY (app_member_roles(organization_id))
  OR 'editor' = ANY (app_member_roles(organization_id))
);

COMMIT;
