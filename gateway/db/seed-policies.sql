-- Seed versioned policies for admin CRUD.
-- Enable/disable is enforced by PolicyEngine (status=disabled → POLICY_DISABLED).
-- Rule JSON is descriptive metadata in v1; execution logic remains in DeterministicPolicyEngine.

INSERT INTO policies (policy_id, organization_id, name, status, version, rules, created_by)
VALUES
(
  'pol_phase2_core',
  'org_demo',
  'Enterprise AI request governance',
  'active',
  2,
  '{
    "summary": "Checks that only trusted, active applications can call AI; protects credentials, PHI, PII, and financial input.",
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
  'Enterprise AI response governance',
  'active',
  5,
  '{
    "summary": "Reviews model responses before release; blocks PHI and credentials; redacts PII; detokenizes only when authorized.",
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
