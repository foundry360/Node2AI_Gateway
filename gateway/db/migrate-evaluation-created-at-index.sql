-- Console timeframe filter (Last 7/30/60/90 days) windows policy_evaluations by
-- created_at and orders by it. Existing volumes need this index; fresh Compose
-- volumes get it from schema-epa.sql.

CREATE INDEX IF NOT EXISTS policy_evaluations_created_at_idx
  ON policy_evaluations (created_at DESC);
