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
-- Application BYOK provider credentials (customer-supplied model keys)
-- ---------------------------------------------------------------------------

CREATE TABLE application_provider_credentials (
  application_id     TEXT PRIMARY KEY REFERENCES applications(application_id),
  organization_id    TEXT NOT NULL REFERENCES organizations(organization_id),
  provider_kind      TEXT NOT NULL
                       CHECK (provider_kind IN ('openai_compatible', 'custom')),
  endpoint_url       TEXT NOT NULL,
  api_key_ciphertext TEXT NOT NULL,
  api_key_last4      TEXT NOT NULL,
  model_map          JSONB NOT NULL DEFAULT '{}'::jsonb,
  status             TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'disabled')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
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
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Tamper-evident integrity (response body not stored — hash only)
  response_hash         TEXT,
  prev_event_hash       TEXT,
  event_hash            TEXT,
  integrity_signature   TEXT,
  -- Cryptographic Decision binding (null when event has no policy evaluation)
  evaluation_id         TEXT,
  decision_hash         TEXT,
  -- Audit Integrity Phase 1
  deployment_id         TEXT,
  sequence_number       BIGINT,
  audit_canonical_version INTEGER,
  input_hash            TEXT
);

CREATE INDEX audit_events_request_id_idx ON audit_events(request_id);
CREATE INDEX audit_events_correlation_id_idx ON audit_events(correlation_id);
CREATE INDEX audit_events_timestamp_idx ON audit_events(timestamp DESC);
CREATE INDEX audit_events_evaluation_id_idx ON audit_events(evaluation_id)
  WHERE evaluation_id IS NOT NULL;
CREATE UNIQUE INDEX audit_events_deployment_sequence_uidx
  ON audit_events (deployment_id, sequence_number)
  WHERE sequence_number IS NOT NULL AND deployment_id IS NOT NULL;
CREATE INDEX audit_events_deployment_id_idx
  ON audit_events (deployment_id)
  WHERE deployment_id IS NOT NULL;

-- Append-only: block UPDATE/DELETE/TRUNCATE on audit_events
CREATE OR REPLACE FUNCTION forbid_audit_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION forbid_audit_truncate()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only (TRUNCATE prohibited)';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_events_no_update ON audit_events;
CREATE TRIGGER audit_events_no_update
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_mutation();

DROP TRIGGER IF EXISTS audit_events_no_truncate ON audit_events;
CREATE TRIGGER audit_events_no_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_truncate();

CREATE TABLE IF NOT EXISTS audit_ledger_counters (
  deployment_id   TEXT PRIMARY KEY,
  next_sequence   BIGINT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS audit_checkpoints (
  checkpoint_id       TEXT PRIMARY KEY,
  deployment_id       TEXT NOT NULL,
  sequence_start      BIGINT NOT NULL,
  sequence_end        BIGINT NOT NULL,
  event_count         INTEGER NOT NULL,
  root_hash           TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  key_id              TEXT NOT NULL,
  signature           TEXT NOT NULL,
  canonical_version   INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS audit_checkpoints_deployment_created_idx
  ON audit_checkpoints (deployment_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS audit_checkpoints_deployment_sequence_end_uidx
  ON audit_checkpoints (deployment_id, sequence_end);

CREATE UNIQUE INDEX IF NOT EXISTS audit_checkpoints_deployment_sequence_start_uidx
  ON audit_checkpoints (deployment_id, sequence_start);

CREATE OR REPLACE FUNCTION forbid_checkpoint_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_checkpoints is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION forbid_checkpoint_truncate()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_checkpoints is append-only (TRUNCATE prohibited)';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_checkpoints_no_update ON audit_checkpoints;
CREATE TRIGGER audit_checkpoints_no_update
  BEFORE UPDATE OR DELETE ON audit_checkpoints
  FOR EACH ROW EXECUTE FUNCTION forbid_checkpoint_mutation();

DROP TRIGGER IF EXISTS audit_checkpoints_no_truncate ON audit_checkpoints;
CREATE TRIGGER audit_checkpoints_no_truncate
  BEFORE TRUNCATE ON audit_checkpoints
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_checkpoint_truncate();

CREATE TABLE IF NOT EXISTS audit_evidence_anchors (
  anchor_record_id      TEXT PRIMARY KEY,
  anchor_id             TEXT NOT NULL,
  deployment_id         TEXT NOT NULL,
  checkpoint_id         TEXT NOT NULL,
  sequence_start        BIGINT NOT NULL,
  sequence_end          BIGINT NOT NULL,
  event_count           INTEGER NOT NULL,
  root_hash             TEXT NOT NULL,
  checkpoint_signature  TEXT NOT NULL,
  checkpoint_key_id     TEXT NOT NULL,
  canonical_version     INTEGER NOT NULL DEFAULT 1,
  recorded_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  anchored_at           TIMESTAMPTZ,
  anchor_type           TEXT NOT NULL,
  anchor_uri            TEXT,
  anchor_hash           TEXT,
  anchor_status         TEXT NOT NULL
                          CHECK (anchor_status IN ('PENDING', 'ANCHORED', 'VERIFIED', 'FAILED')),
  failure_code          TEXT,
  payload_json          JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_evidence_anchors_deployment_recorded_idx
  ON audit_evidence_anchors (deployment_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS audit_evidence_anchors_checkpoint_idx
  ON audit_evidence_anchors (checkpoint_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS audit_evidence_anchors_anchor_id_idx
  ON audit_evidence_anchors (anchor_id, recorded_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS audit_evidence_anchors_checkpoint_anchored_uidx
  ON audit_evidence_anchors (checkpoint_id)
  WHERE anchor_status = 'ANCHORED';

CREATE OR REPLACE FUNCTION forbid_evidence_anchor_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_evidence_anchors is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION forbid_evidence_anchor_truncate()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_evidence_anchors is append-only (TRUNCATE prohibited)';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_evidence_anchors_no_update ON audit_evidence_anchors;
CREATE TRIGGER audit_evidence_anchors_no_update
  BEFORE UPDATE OR DELETE ON audit_evidence_anchors
  FOR EACH ROW EXECUTE FUNCTION forbid_evidence_anchor_mutation();

DROP TRIGGER IF EXISTS audit_evidence_anchors_no_truncate ON audit_evidence_anchors;
CREATE TRIGGER audit_evidence_anchors_no_truncate
  BEFORE TRUNCATE ON audit_evidence_anchors
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_evidence_anchor_truncate();

-- Phase 3A: durable anchoring jobs (operational state — not evidence)
CREATE TABLE IF NOT EXISTS audit_anchor_jobs (
  job_id              TEXT PRIMARY KEY,
  anchor_id           TEXT NOT NULL,
  deployment_id       TEXT NOT NULL,
  checkpoint_id       TEXT NOT NULL,
  status              TEXT NOT NULL
                        CHECK (status IN (
                          'PENDING', 'IN_PROGRESS', 'ANCHORED', 'RETRY', 'FAILED'
                        )),
  attempt_count       INTEGER NOT NULL DEFAULT 0,
  max_attempts        INTEGER NOT NULL DEFAULT 8,
  next_attempt_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempt_at     TIMESTAMPTZ,
  last_error          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ,
  payload_json        JSONB NOT NULL,
  UNIQUE (checkpoint_id)
);

CREATE INDEX IF NOT EXISTS audit_anchor_jobs_due_idx
  ON audit_anchor_jobs (status, next_attempt_at)
  WHERE status IN ('PENDING', 'RETRY');

CREATE INDEX IF NOT EXISTS audit_anchor_jobs_deployment_idx
  ON audit_anchor_jobs (deployment_id, created_at DESC);

CREATE OR REPLACE FUNCTION forbid_anchor_job_delete()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_anchor_jobs DELETE/TRUNCATE prohibited';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_anchor_jobs_no_delete ON audit_anchor_jobs;
CREATE TRIGGER audit_anchor_jobs_no_delete
  BEFORE DELETE ON audit_anchor_jobs
  FOR EACH ROW EXECUTE FUNCTION forbid_anchor_job_delete();

DROP TRIGGER IF EXISTS audit_anchor_jobs_no_truncate ON audit_anchor_jobs;
CREATE TRIGGER audit_anchor_jobs_no_truncate
  BEFORE TRUNCATE ON audit_anchor_jobs
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_anchor_job_delete();

-- ---------------------------------------------------------------------------
-- Phase 4 / 4.1: client-reported action Outcome projection (atomic claim index)
-- Cryptographic evidence remains in audit_events. Append-only projection.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS action_outcomes (
  deployment_id   TEXT NOT NULL,
  execution_id    TEXT NOT NULL,
  evaluation_id   TEXT NOT NULL,
  application_id  TEXT NOT NULL,
  outcome         TEXT NOT NULL,
  receipt_hash    TEXT NOT NULL,
  audit_event_id  TEXT NOT NULL,
  request_id      TEXT,
  reported_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id         TEXT,
  agent_id        TEXT,
  tool_id         TEXT,
  operation       TEXT,
  purpose         TEXT,
  authorization_context TEXT,
  action_kind     TEXT,
  target_id       TEXT,
  action_field    TEXT,
  PRIMARY KEY (deployment_id, execution_id),
  CONSTRAINT action_outcomes_outcome_check CHECK (
    outcome IN (
      'EXECUTED',
      'EXECUTION_FAILED',
      'EXECUTION_TIMEOUT',
      'EXECUTION_UNKNOWN'
    )
  )
);

CREATE INDEX IF NOT EXISTS action_outcomes_evaluation_dep_idx
  ON action_outcomes (deployment_id, evaluation_id);

CREATE INDEX IF NOT EXISTS action_outcomes_application_idx
  ON action_outcomes (application_id);

CREATE OR REPLACE FUNCTION forbid_action_outcome_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'action_outcomes is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION forbid_action_outcome_truncate()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'action_outcomes is append-only (TRUNCATE prohibited)';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS action_outcomes_no_update ON action_outcomes;
CREATE TRIGGER action_outcomes_no_update
  BEFORE UPDATE OR DELETE ON action_outcomes
  FOR EACH ROW EXECUTE FUNCTION forbid_action_outcome_mutation();

DROP TRIGGER IF EXISTS action_outcomes_no_truncate ON action_outcomes;
CREATE TRIGGER action_outcomes_no_truncate
  BEFORE TRUNCATE ON action_outcomes
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_action_outcome_truncate();

-- ---------------------------------------------------------------------------
-- Agent / Tool governance (Phase A — authorization substrate, not a PDP)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agents (
  deployment_id     TEXT NOT NULL,
  agent_id          TEXT NOT NULL,
  organization_id   TEXT NOT NULL REFERENCES organizations(organization_id),
  name              TEXT NOT NULL,
  status            TEXT NOT NULL
                      CHECK (status IN ('ACTIVE', 'SUSPENDED', 'RETIRED')),
  autonomy_level    TEXT NOT NULL
                      CHECK (autonomy_level IN ('ASSISTIVE', 'HUMAN_APPROVED', 'AUTONOMOUS')),
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (deployment_id, agent_id)
);

CREATE INDEX IF NOT EXISTS agents_org_idx
  ON agents (deployment_id, organization_id);

CREATE TABLE IF NOT EXISTS tools (
  deployment_id     TEXT NOT NULL,
  tool_id           TEXT NOT NULL,
  organization_id   TEXT NOT NULL REFERENCES organizations(organization_id),
  name              TEXT NOT NULL,
  status            TEXT NOT NULL
                      CHECK (status IN ('ACTIVE', 'SUSPENDED', 'RETIRED')),
  operations        JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (deployment_id, tool_id)
);

CREATE INDEX IF NOT EXISTS tools_org_idx
  ON tools (deployment_id, organization_id);

CREATE TABLE IF NOT EXISTS agent_application_bindings (
  deployment_id     TEXT NOT NULL,
  agent_id          TEXT NOT NULL,
  application_id    TEXT NOT NULL REFERENCES applications(application_id),
  status            TEXT NOT NULL
                      CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (deployment_id, agent_id, application_id),
  FOREIGN KEY (deployment_id, agent_id)
    REFERENCES agents (deployment_id, agent_id)
);

CREATE INDEX IF NOT EXISTS agent_app_bindings_app_idx
  ON agent_application_bindings (deployment_id, application_id);

CREATE TABLE IF NOT EXISTS agent_tool_grants (
  deployment_id       TEXT NOT NULL,
  agent_id            TEXT NOT NULL,
  tool_id             TEXT NOT NULL,
  allowed_operations  JSONB NOT NULL DEFAULT '[]'::jsonb,
  status              TEXT NOT NULL
                        CHECK (status IN ('ACTIVE', 'REVOKED')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (deployment_id, agent_id, tool_id),
  FOREIGN KEY (deployment_id, agent_id)
    REFERENCES agents (deployment_id, agent_id),
  FOREIGN KEY (deployment_id, tool_id)
    REFERENCES tools (deployment_id, tool_id)
);

CREATE INDEX IF NOT EXISTS agent_tool_grants_tool_idx
  ON agent_tool_grants (deployment_id, tool_id);

-- ---------------------------------------------------------------------------
-- System configuration
-- ---------------------------------------------------------------------------

CREATE TABLE system_config (
  key               TEXT PRIMARY KEY,
  value             JSONB NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Example keys:
--   deployment_mode (connected|airgap)
--   deployment_id   (installation UUID; generated once at first boot — not a license id)
--   audit_policy, egress_allowlist

-- ---------------------------------------------------------------------------
-- Console admin users (V1 RBAC — separate from AI subject users)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS admin_users (
  user_id           TEXT PRIMARY KEY,
  organization_id   TEXT NOT NULL REFERENCES organizations(organization_id),
  username          TEXT NOT NULL,
  password_hash     TEXT NOT NULL,
  role              TEXT NOT NULL
                      CHECK (role IN (
                        'ADMINISTRATOR',
                        'GOVERNANCE_REVIEWER',
                        'OPERATOR',
                        'READ_ONLY'
                      )),
  status            TEXT NOT NULL
                      CHECK (status IN ('ACTIVE', 'DISABLED')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_users_username_uidx
  ON admin_users (lower(username));
