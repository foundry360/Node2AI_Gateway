-- Audit Integrity Phase 2: external evidence anchors (append-only history)

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

-- One successful ANCHORED record per checkpoint (conflict detection at insert)
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
