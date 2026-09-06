-- Additive Decision↔binding columns for audit_events.
-- Historical rows remain NULL and verifiable under the legacy event_hash format.
-- docker compose exec -T postgres psql -U node2ai -d node2ai_gateway < db/migrate-audit-decision-binding.sql

ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS evaluation_id TEXT,
  ADD COLUMN IF NOT EXISTS decision_hash TEXT;

CREATE INDEX IF NOT EXISTS audit_events_evaluation_id_idx
  ON audit_events(evaluation_id)
  WHERE evaluation_id IS NOT NULL;
