-- Apply on existing appliance volumes (init scripts only run on first boot).
-- docker compose exec -T postgres psql -U node2ai -d node2ai_gateway < db/migrate-audit-integrity.sql

ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS response_hash TEXT,
  ADD COLUMN IF NOT EXISTS prev_event_hash TEXT,
  ADD COLUMN IF NOT EXISTS event_hash TEXT,
  ADD COLUMN IF NOT EXISTS integrity_signature TEXT;

CREATE OR REPLACE FUNCTION forbid_audit_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_events_no_update ON audit_events;
CREATE TRIGGER audit_events_no_update
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_mutation();
