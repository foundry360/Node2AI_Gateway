-- Phase 3B: contiguous checkpoint uniqueness (concurrency safety)

CREATE UNIQUE INDEX IF NOT EXISTS audit_checkpoints_deployment_sequence_end_uidx
  ON audit_checkpoints (deployment_id, sequence_end);

CREATE UNIQUE INDEX IF NOT EXISTS audit_checkpoints_deployment_sequence_start_uidx
  ON audit_checkpoints (deployment_id, sequence_start);
