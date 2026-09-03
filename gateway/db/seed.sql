-- Phase seed data (PostgreSQL). Aligns with in-memory demo fixtures.

INSERT INTO organizations (organization_id, name, status, configuration)
VALUES ('org_demo', 'Demo Healthcare Org', 'active', '{}'::jsonb);

INSERT INTO applications (
  application_id, organization_id, name, type, environment, status, trust_level,
  allowed_models, allowed_datasets, allowed_operations
) VALUES
(
  'app_clinical', 'org_demo', 'Approved Clinical App', 'clinical', 'prod', 'active', 'trusted',
  '["local-general-v1"]'::jsonb,
  '["ds_clinical_notes"]'::jsonb,
  '["summarize","classify","generate"]'::jsonb
),
(
  'app_limited', 'org_demo', 'Limited App', 'custom', 'prod', 'active', 'standard',
  '["local-general-v1"]'::jsonb,
  '[]'::jsonb,
  '["summarize"]'::jsonb
),
(
  'app_general', 'org_demo', 'General Integration App', 'custom', 'prod', 'active', 'standard',
  '["local-general-v1","cloud-public-gpt"]'::jsonb,
  '[]'::jsonb,
  '["summarize","generate"]'::jsonb
);

INSERT INTO users (user_id, organization_id, email, roles, permissions, status)
VALUES (
  'user_clinician', 'org_demo', 'clinician@example.com',
  '["clinician"]'::jsonb, '["ai:summarize"]'::jsonb, 'active'
);

-- SHA-256 of demo API keys (see gateway/src/shared/ids.ts hashApiKey)
INSERT INTO api_keys (api_key_id, organization_id, application_id, key_prefix, key_hash, status)
VALUES
(
  'key_clinical', 'org_demo', 'app_clinical', 'n2ai_test',
  'c63c847fbab5f2c7689c17962dc676cb232ea6f1d4660a81b4169527f5db0c17', 'active'
),
(
  'key_limited', 'org_demo', 'app_limited', 'n2ai_lim',
  '4030e0b8db142edb3007afddbc3fe337d40b5acf9b7e596ad397bd32ca6d87bf', 'active'
),
(
  'key_general', 'org_demo', 'app_general', 'n2ai_gen',
  '23a8b79d40134e31db9717428029c9da0d6fb843f0a4d773bce6cd7c3e688f89', 'active'
);

INSERT INTO providers (provider_id, name, kind, status, endpoint_allowlist)
VALUES
  ('local-runtime', 'Local Model Runtime', 'local', 'active', '[]'::jsonb),
  ('external-openai-compatible', 'External OpenAI Compatible', 'cloud', 'active', '[]'::jsonb);

INSERT INTO models (model_id, provider_id, name, status, capabilities, metadata)
VALUES
  ('local-general-v1', 'local-runtime', 'Local General v1', 'active', '["chat"]'::jsonb, '{}'::jsonb),
  ('cloud-public-gpt', 'external-openai-compatible', 'Approved External GPT', 'active', '["chat"]'::jsonb, '{}'::jsonb);

INSERT INTO system_config (key, value)
VALUES ('deployment_mode', '"connected"'::jsonb);
