-- Seed Enigma Enterprise AI Baseline + Response governance packs (EPA).
-- Rule bodies match DeterministicPolicyEngine semantics for M2 comparison.

INSERT INTO policy_packs (pack_id, name, domain, description, status)
VALUES
(
  'pack_enterprise_baseline',
  'Enterprise AI Baseline',
  'enterprise',
  'General enterprise AI governance: trust, operations, credentials, PHI/PII, air-gap.',
  'active'
),
(
  'pack_response_governance',
  'Response Governance',
  'enterprise',
  'Output path: block tools/credentials/PHI; redact PII; privileged detokenization.',
  'active'
)
ON CONFLICT (pack_id) DO NOTHING;

INSERT INTO classification_labels (label, description, pack_id, active) VALUES
  ('PUBLIC', 'Public', 'pack_enterprise_baseline', true),
  ('INTERNAL', 'Internal', 'pack_enterprise_baseline', true),
  ('CONFIDENTIAL', 'Confidential', 'pack_enterprise_baseline', true),
  ('RESTRICTED', 'Restricted', 'pack_enterprise_baseline', true),
  ('PII', 'Personally identifiable information', 'pack_enterprise_baseline', true),
  ('PHI', 'Protected health information', 'pack_enterprise_baseline', true),
  ('FINANCIAL', 'Financial data', 'pack_enterprise_baseline', true),
  ('LEGAL', 'Legal / privilege', 'pack_enterprise_baseline', true),
  ('CREDENTIAL', 'Secrets and credentials', 'pack_enterprise_baseline', true)
ON CONFLICT (label) DO NOTHING;

INSERT INTO epa_policies (policy_id, pack_id, organization_id, name, description, owner, domain, created_by)
VALUES
(
  'pol_phase2_core',
  'pack_enterprise_baseline',
  NULL,
  'Request governance',
  'Input governance baseline (migrated from DeterministicPolicyEngine).',
  'enigma',
  'enterprise',
  'seed'
),
(
  'pol_phase5_response',
  'pack_response_governance',
  NULL,
  'Response governance',
  'Output governance baseline (migrated from DeterministicPolicyEngine).',
  'enigma',
  'enterprise',
  'seed'
)
ON CONFLICT (policy_id) DO NOTHING;

-- rules JSON is loaded by the TypeScript pack seed for interpreter parity;
-- DB row stores a content hash + phase marker for administration.
INSERT INTO policy_versions (
  policy_version_id, policy_id, version, status, priority, scope_tier, phase,
  activated_at, activated_by, changelog, content_hash, rules, created_by
)
VALUES
(
  'pv_pol_phase2_core_v2',
  'pol_phase2_core',
  2,
  'active',
  100,
  'enterprise',
  'input',
  now(),
  'seed',
  'M2 seed from legacy engine v2',
  'sha256:baseline_input_v2',
  '[{"interpreter":"baseline_input_v2"}]'::jsonb,
  'seed'
),
(
  'pv_pol_phase5_response_v5',
  'pol_phase5_response',
  5,
  'active',
  100,
  'enterprise',
  'output',
  now(),
  'seed',
  'M2 seed from legacy engine v5',
  'sha256:baseline_output_v5',
  '[{"interpreter":"baseline_output_v5"}]'::jsonb,
  'seed'
)
ON CONFLICT (policy_id, version) DO NOTHING;

INSERT INTO policy_tests (test_id, policy_version_id, name, fixture, expect_decision, expect_obligations, required)
VALUES
(
  'TEST_001',
  'pv_pol_phase2_core_v2',
  'PHI + external model → DENY',
  '{"classification":"PHI","requested_model":"cloud-public-gpt","action":"SUMMARIZE"}'::jsonb,
  'DENY',
  '[]'::jsonb,
  true
),
(
  'TEST_002',
  'pv_pol_phase2_core_v2',
  'PHI + approved local model → ALLOW',
  '{"classification":"PHI","requested_model":"local-general-v1","application_type":"clinical","roles":["clinician"]}'::jsonb,
  'ALLOW',
  '["LOCAL_MODEL_ONLY"]'::jsonb,
  true
),
(
  'TEST_003',
  'pv_pol_phase2_core_v2',
  'PII + approved cloud → TOKENIZE',
  '{"classification":"PII","available_models":["local-general-v1","cloud-public-gpt"]}'::jsonb,
  'TOKENIZE',
  '["TOKENIZE_PII"]'::jsonb,
  true
),
(
  'TEST_004',
  'pv_pol_phase2_core_v2',
  'Credential + any model → DENY',
  '{"classification":"Credential"}'::jsonb,
  'DENY',
  '[]'::jsonb,
  true
),
(
  'TEST_005',
  'pv_pol_phase2_core_v2',
  'Agent write-back → REQUIRE_APPROVAL (framework placeholder maps to DENY/operation until EXECUTE pack)',
  '{"action":"WRITE","allowed_operations":["summarize"]}'::jsonb,
  'DENY',
  '[]'::jsonb,
  true
)
ON CONFLICT (test_id) DO NOTHING;
