-- Additive: durable EPA decision restrictions on policy evaluations
-- (authorized eligible_models snapshot). Does not alter machine decision.
-- Legacy rows remain NULL; do not invent eligibility from current registry.
ALTER TABLE policy_evaluations
  ADD COLUMN IF NOT EXISTS restrictions JSONB;
