-- Enigma Enterprise Policy Architecture tables (additive).
-- Safe to apply on existing volumes: migrate-epa.sql / docker init 04.

-- ---------------------------------------------------------------------------
-- Policy packs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS policy_packs (
  pack_id           TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  domain            TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL CHECK (status IN ('draft', 'active', 'retired')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS epa_policies (
  policy_id         TEXT PRIMARY KEY,
  pack_id           TEXT REFERENCES policy_packs(pack_id),
  organization_id   TEXT REFERENCES organizations(organization_id),
  name              TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  owner             TEXT,
  domain            TEXT NOT NULL DEFAULT 'enterprise',
  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS policy_versions (
  policy_version_id TEXT PRIMARY KEY,
  policy_id         TEXT NOT NULL REFERENCES epa_policies(policy_id),
  version           INTEGER NOT NULL,
  status            TEXT NOT NULL CHECK (status IN (
                      'draft', 'review', 'approved', 'active',
                      'suspended', 'retired', 'archived'
                    )),
  priority          INTEGER NOT NULL DEFAULT 100,
  scope_tier        TEXT NOT NULL DEFAULT 'enterprise',
  phase             TEXT NOT NULL CHECK (phase IN ('input', 'output', 'both')),
  effective_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ,
  approved_by       TEXT,
  activated_at      TIMESTAMPTZ,
  activated_by      TEXT,
  changelog         TEXT,
  content_hash      TEXT NOT NULL,
  -- Structured rule body for the pack interpreter (not free-form app code).
  rules             JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        TEXT,
  UNIQUE (policy_id, version)
);

CREATE INDEX IF NOT EXISTS policy_versions_status_idx
  ON policy_versions (status, effective_at);

CREATE TABLE IF NOT EXISTS policy_scopes (
  id                BIGSERIAL PRIMARY KEY,
  policy_version_id TEXT NOT NULL REFERENCES policy_versions(policy_version_id) ON DELETE CASCADE,
  scope_type        TEXT NOT NULL,
  scope_value       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS policy_obligations (
  id                BIGSERIAL PRIMARY KEY,
  policy_version_id TEXT NOT NULL REFERENCES policy_versions(policy_version_id) ON DELETE CASCADE,
  obligation        TEXT NOT NULL,
  parameters        JSONB NOT NULL DEFAULT '{}'::jsonb,
  on_decision       TEXT
);

CREATE TABLE IF NOT EXISTS classification_labels (
  label             TEXT PRIMARY KEY,
  description       TEXT NOT NULL DEFAULT '',
  pack_id           TEXT REFERENCES policy_packs(pack_id),
  active            BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS policy_tests (
  test_id           TEXT PRIMARY KEY,
  policy_version_id TEXT NOT NULL REFERENCES policy_versions(policy_version_id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  fixture           JSONB NOT NULL,
  expect_decision   TEXT NOT NULL,
  expect_obligations JSONB NOT NULL DEFAULT '[]'::jsonb,
  required          BOOLEAN NOT NULL DEFAULT true,
  last_result       TEXT,
  last_run_at       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS policy_evaluations (
  evaluation_id     TEXT PRIMARY KEY,
  request_id        TEXT,
  phase             TEXT NOT NULL CHECK (phase IN ('input', 'output', 'simulate')),
  organization_id   TEXT,
  subject           JSONB NOT NULL DEFAULT '{}'::jsonb,
  resource          JSONB NOT NULL DEFAULT '{}'::jsonb,
  action            TEXT,
  context           JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_context        JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_in       JSONB NOT NULL DEFAULT '{}'::jsonb,
  decision          TEXT NOT NULL,
  reason            TEXT,
  applicable_policies JSONB NOT NULL DEFAULT '[]'::jsonb,
  obligations       JSONB NOT NULL DEFAULT '[]'::jsonb,
  explanation       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS policy_evaluations_request_idx
  ON policy_evaluations (request_id);

CREATE TABLE IF NOT EXISTS policy_conflicts (
  conflict_id       TEXT PRIMARY KEY,
  evaluation_id     TEXT NOT NULL REFERENCES policy_evaluations(evaluation_id) ON DELETE CASCADE,
  policy_a          TEXT NOT NULL,
  policy_b          TEXT NOT NULL,
  conflict_type     TEXT NOT NULL CHECK (conflict_type IN ('decision', 'obligation')),
  detail            JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolution        TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS policy_approvals (
  approval_id       TEXT PRIMARY KEY,
  policy_version_id TEXT NOT NULL REFERENCES policy_versions(policy_version_id) ON DELETE CASCADE,
  action            TEXT NOT NULL,
  actor             TEXT NOT NULL,
  comment           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
