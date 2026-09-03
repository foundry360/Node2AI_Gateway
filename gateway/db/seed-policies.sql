-- Seed versioned policies for admin CRUD (execution engine remains deterministic).

INSERT INTO policies (policy_id, organization_id, name, status, version, rules, created_by)
VALUES
(
  'pol_phase2_core',
  'org_demo',
  'Request governance',
  'active',
  2,
  '{
    "summary": "Application trust, operation allowlists, PHI local-only, PII tokenize, credential block.",
    "request": {
      "untrusted_app": "BLOCK",
      "credential": "BLOCK",
      "phi": "local_models_only",
      "pii": "TOKENIZE"
    }
  }'::jsonb,
  'seed'
),
(
  'pol_phase5_response',
  'org_demo',
  'Response governance',
  'active',
  5,
  '{
    "summary": "Block PHI/credentials/tool calls in outputs; redact PII; detokenize only when authorized.",
    "response": {
      "tool_or_action": "BLOCK",
      "credential": "BLOCK",
      "phi": "BLOCK",
      "pii": "REDACT",
      "detokenize": "authorized_only"
    }
  }'::jsonb,
  'seed'
);
