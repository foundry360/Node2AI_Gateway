-- Additive: human resolution on policy evaluations (does not alter machine decision).
ALTER TABLE policy_evaluations
  ADD COLUMN IF NOT EXISTS human_resolution JSONB;
