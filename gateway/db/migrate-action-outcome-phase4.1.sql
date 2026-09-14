-- Phase 4.1: atomic claim hardening for action_outcomes
-- - deployment-scoped unique claim (deployment_id, execution_id)
-- - richer server-derived binding columns
-- - append-only protections (no UPDATE/DELETE/TRUNCATE)

ALTER TABLE action_outcomes
  ADD COLUMN IF NOT EXISTS deployment_id TEXT;

ALTER TABLE action_outcomes
  ADD COLUMN IF NOT EXISTS user_id TEXT;

ALTER TABLE action_outcomes
  ADD COLUMN IF NOT EXISTS operation TEXT;

ALTER TABLE action_outcomes
  ADD COLUMN IF NOT EXISTS purpose TEXT;

ALTER TABLE action_outcomes
  ADD COLUMN IF NOT EXISTS authorization_context TEXT;

ALTER TABLE action_outcomes
  ADD COLUMN IF NOT EXISTS action_field TEXT;

-- Backfill legacy rows (pre-4.1) so NOT NULL / PK migration can proceed.
UPDATE action_outcomes
SET deployment_id = 'legacy-unscoped'
WHERE deployment_id IS NULL OR deployment_id = '';

ALTER TABLE action_outcomes
  ALTER COLUMN deployment_id SET NOT NULL;

-- Replace single-column PK with deployment-scoped claim key.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'action_outcomes_pkey'
      AND conrelid = 'action_outcomes'::regclass
  ) THEN
    ALTER TABLE action_outcomes DROP CONSTRAINT action_outcomes_pkey;
  END IF;
END $$;

ALTER TABLE action_outcomes
  ADD CONSTRAINT action_outcomes_pkey PRIMARY KEY (deployment_id, execution_id);

CREATE INDEX IF NOT EXISTS action_outcomes_evaluation_dep_idx
  ON action_outcomes (deployment_id, evaluation_id);

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
