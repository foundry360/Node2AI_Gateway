-- Phase 4: client-reported execution Outcome projection (idempotency index).
-- Cryptographic evidence remains in audit_events; this table never overwrites.

CREATE TABLE IF NOT EXISTS action_outcomes (
  execution_id    TEXT PRIMARY KEY,
  evaluation_id   TEXT NOT NULL,
  application_id  TEXT NOT NULL,
  outcome         TEXT NOT NULL,
  receipt_hash    TEXT NOT NULL,
  audit_event_id  TEXT NOT NULL,
  request_id      TEXT,
  reported_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  agent_id        TEXT,
  tool_id         TEXT,
  action_kind     TEXT,
  target_id       TEXT,
  CONSTRAINT action_outcomes_outcome_check CHECK (
    outcome IN (
      'EXECUTED',
      'EXECUTION_FAILED',
      'EXECUTION_TIMEOUT',
      'EXECUTION_UNKNOWN'
    )
  )
);

CREATE INDEX IF NOT EXISTS action_outcomes_evaluation_idx
  ON action_outcomes (evaluation_id);

CREATE INDEX IF NOT EXISTS action_outcomes_application_idx
  ON action_outcomes (application_id);
