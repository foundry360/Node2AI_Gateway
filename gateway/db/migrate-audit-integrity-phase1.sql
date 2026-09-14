-- Audit Integrity Phase 1: sequence, deployment binding, TRUNCATE guard, checkpoints

ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS deployment_id TEXT,
  ADD COLUMN IF NOT EXISTS sequence_number BIGINT,
  ADD COLUMN IF NOT EXISTS audit_canonical_version INTEGER,
  ADD COLUMN IF NOT EXISTS input_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS audit_events_deployment_sequence_uidx
  ON audit_events (deployment_id, sequence_number)
  WHERE sequence_number IS NOT NULL AND deployment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS audit_events_deployment_id_idx
  ON audit_events (deployment_id)
  WHERE deployment_id IS NOT NULL;

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

-- Strengthen append-only: UPDATE / DELETE / TRUNCATE
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
