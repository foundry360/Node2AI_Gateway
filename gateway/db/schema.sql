-- Node2AI Gateway — Canonical PostgreSQL schema (Phase 1+)
-- Appliance-local governance store. Not an enterprise system of record.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

CREATE TABLE organizations (
  organization_id   TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('active', 'suspended', 'deleted')),
  configuration     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE applications (
  application_id    TEXT PRIMARY KEY,
  organization_id   TEXT NOT NULL REFERENCES organizations(organization_id),
  name              TEXT NOT NULL,
  type              TEXT NOT NULL,
  environment       TEXT NOT NULL CHECK (environment IN ('dev', 'test', 'staging', 'prod')),
  status            TEXT NOT NULL CHECK (status IN ('active', 'suspended', 'deleted')),
  trust_level       TEXT NOT NULL DEFAULT 'standard'
                      CHECK (trust_level IN ('trusted', 'standard', 'untrusted')),
  allowed_models    JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_datasets  JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_operations JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  user_id           TEXT PRIMARY KEY,
  organization_id   TEXT NOT NULL REFERENCES organizations(organization_id),
  email             TEXT,
  roles             JSONB NOT NULL DEFAULT '[]'::jsonb,
  permissions       JSONB NOT NULL DEFAULT '[]'::jsonb,
  status            TEXT NOT NULL CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE api_keys (
  api_key_id        TEXT PRIMARY KEY,
  organization_id   TEXT NOT NULL REFERENCES organizations(organization_id),
  application_id    TEXT NOT NULL REFERENCES applications(application_id),
  key_prefix        TEXT NOT NULL,
  key_hash          TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at        TIMESTAMPTZ
);

CREATE UNIQUE INDEX api_keys_key_hash_uidx ON api_keys(key_hash);

-- ---------------------------------------------------------------------------
-- Model registry
-- ---------------------------------------------------------------------------

CREATE TABLE providers (
  provider_id       TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  kind              TEXT NOT NULL CHECK (kind IN ('local', 'private', 'cloud')),
  status            TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  endpoint_allowlist JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE models (
  model_id          TEXT PRIMARY KEY,
  provider_id       TEXT NOT NULL REFERENCES providers(provider_id),
  name              TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  capabilities      JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Policies (versioned)
-- ---------------------------------------------------------------------------

CREATE TABLE policies (
  policy_id         TEXT PRIMARY KEY,
  organization_id   TEXT REFERENCES organizations(organization_id),
  name              TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  version           INTEGER NOT NULL,
  rules             JSONB NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        TEXT
);

CREATE UNIQUE INDEX policies_org_name_version_uidx
  ON policies(organization_id, name, version);

-- ---------------------------------------------------------------------------
-- Datasets (metadata only)
-- ---------------------------------------------------------------------------

CREATE TABLE datasets (
  dataset_id        TEXT PRIMARY KEY,
  organization_id   TEXT NOT NULL REFERENCES organizations(organization_id),
  name              TEXT NOT NULL,
  source_id         TEXT,
  classification    TEXT NOT NULL,
  owner             TEXT,
  permissions       JSONB NOT NULL DEFAULT '{}'::jsonb,
  status            TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Token vault (Phase 3+)
-- ---------------------------------------------------------------------------

CREATE TABLE token_vault (
  token_id          TEXT PRIMARY KEY,
  organization_id   TEXT NOT NULL REFERENCES organizations(organization_id),
  token_value       TEXT NOT NULL,
  ciphertext        BYTEA NOT NULL,
  entity_type       TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ
);

CREATE UNIQUE INDEX token_vault_token_value_uidx ON token_vault(token_value);

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------

CREATE TABLE audit_events (
  audit_id              TEXT PRIMARY KEY,
  timestamp             TIMESTAMPTZ NOT NULL DEFAULT now(),
  organization_id       TEXT,
  application_id        TEXT,
  user_id               TEXT,
  request_id            TEXT NOT NULL,
  correlation_id        TEXT NOT NULL,
  operation             TEXT,
  data_classification   TEXT,
  policy_ids            JSONB,
  policy_decision       TEXT,
  model_selected        TEXT,
  provider              TEXT,
  input_transformation  TEXT,
  response_transformation TEXT,
  response_decision     TEXT,
  latency_ms            INTEGER,
  usage                 JSONB,
  reason_codes          JSONB,
  errors                JSONB,
  -- Raw sensitive content intentionally omitted by default
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX audit_events_request_id_idx ON audit_events(request_id);
CREATE INDEX audit_events_correlation_id_idx ON audit_events(correlation_id);
CREATE INDEX audit_events_timestamp_idx ON audit_events(timestamp DESC);

-- ---------------------------------------------------------------------------
-- System configuration
-- ---------------------------------------------------------------------------

CREATE TABLE system_config (
  key               TEXT PRIMARY KEY,
  value             JSONB NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Example keys: deployment_mode (connected|airgap), audit_policy, egress_allowlist
