-- Minimal resume support: held request snapshot + execution state on evaluations.
ALTER TABLE policy_evaluations
  ADD COLUMN IF NOT EXISTS held_request JSONB;

ALTER TABLE policy_evaluations
  ADD COLUMN IF NOT EXISTS execution JSONB;
