-- Audit Integrity Phase 3A: durable external anchoring job queue
-- Operational state only — not authoritative evidence (see audit_evidence_anchors).

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

-- Jobs are mutable operational state; forbid DELETE/TRUNCATE of history rows.
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
