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
  'Enterprise AI request governance',
  'Checks that only trusted, active applications can call AI, limits them to allowed operations, and protects sensitive input.',
  'enigma',
  'enterprise',
  'seed'
),
(
  'pol_phase5_response',
  'pack_response_governance',
  NULL,
  'Enterprise AI response governance',
  'Reviews model responses before release: blocks PHI, credentials, and tool suggestions; redacts PII or financial content.',
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

-- M4+ regulatory packs (HIPAA pack + Part 2 + financial/legal frameworks)
INSERT INTO policy_packs (pack_id, name, domain, description, status)
VALUES
(
  'pack_hipaa',
  'HIPAA',
  'hipaa',
  'HIPAA AI/data governance pack v3.1 — health-information lifecycle (identify→controls→release). Not a compliance certification.',
  'active'
),
(
  'pack_42_cfr_part_2',
  '42 CFR Part 2',
  'healthcare',
  '42 CFR Part 2 pack v1.0 — SUD patient record confidentiality for AI/data governance. Architecture Pack #2. Not a compliance certification.',
  'active'
),
(
  'pack_nist_ai_rmf',
  'NIST AI RMF',
  'ai_risk',
  'NIST AI RMF pack v1.0 — focused GOVERN/MAP/MEASURE/MANAGE framework guidance as Enigma controls. Architecture Pack #3. Not certification or legal authority.',
  'active'
),
(
  'pack_owasp_llm_2025',
  'OWASP LLM Top 10 2025',
  'ai_risk',
  'OWASP Top 10 for LLM Applications 2025 pack v1.0 — security-control evidence gates as Enigma controls. Architecture Pack #4. Security guidance — not certification or legal authority.',
  'active'
),
(
  'pack_eu_ai_act',
  'EU AI Act',
  'ai_risk',
  'EU AI Act pack v1.0 — Regulation (EU) 2024/1689 prohibited / high-risk / Art. 50 / GPAI obligation gates. Architecture Pack #5. Legal authority — not a compliance certification.',
  'active'
),
(
  'pack_iso_42001',
  'ISO/IEC 42001',
  'ai_risk',
  'ISO/IEC 42001:2023 pack v1.0 — AI management-system evidence gates as Enigma controls. Architecture Pack #6. Standard — not certification or legal authority.',
  'active'
),
(
  'pack_iso_23894',
  'ISO/IEC 23894',
  'ai_risk',
  'ISO/IEC 23894:2023 pack v1.0 — AI risk-management evidence gates as Enigma controls. Architecture Pack #7. Standard — not certification, legal authority, or risk score.',
  'active'
),
(
  'pack_iso_42005',
  'ISO/IEC 42005',
  'ai_risk',
  'ISO/IEC 42005:2025 pack v1.0 — AI system impact-assessment evidence gates as Enigma controls. Architecture Pack #8. Standard — not certification, legal authority, impact score, or assessment workflow.',
  'active'
),
(
  'pack_financial',
  'Financial Services',
  'financial',
  'Financial data tokenize framework (activate overlay to enforce).',
  'draft'
),
(
  'pack_legal',
  'Legal',
  'legal',
  'Legal privilege — no external models framework (activate overlay to enforce).',
  'draft'
)
ON CONFLICT (pack_id) DO UPDATE SET
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO epa_policies (policy_id, pack_id, organization_id, name, description, owner, domain, created_by)
VALUES
(
  'pol_hipaa_phi_local',
  'pack_hipaa',
  NULL,
  'HIPAA health-information input governance',
  'HIPAA pack v2 input — obligations/controls for health-sensitive processing.',
  'enigma',
  'hipaa',
  'seed'
),
(
  'pol_hipaa_release',
  'pack_hipaa',
  NULL,
  'HIPAA output/release governance',
  'HIPAA pack v2 output — residual PHI block and authorized detokenization.',
  'enigma',
  'hipaa',
  'seed'
),
(
  'pol_part2_sud_records',
  'pack_42_cfr_part_2',
  NULL,
  'Part 2 SUD record input governance',
  '42 CFR Part 2 pack v1 input — consent gates for SUD patient records.',
  'enigma',
  'healthcare',
  'seed'
),
(
  'pol_part2_redisclosure',
  'pack_42_cfr_part_2',
  NULL,
  'Part 2 redisclosure / release governance',
  '42 CFR Part 2 pack v1 output — redisclosure notice and Enigma release.',
  'enigma',
  'healthcare',
  'seed'
),
(
  'pol_nist_ai_rmf_input',
  'pack_nist_ai_rmf',
  NULL,
  'NIST AI RMF input governance',
  'NIST AI RMF pack v1 input — GOVERN/MAP/MEASURE/MANAGE documentation gates as Enigma controls.',
  'enigma',
  'ai_risk',
  'seed'
),
(
  'pol_nist_ai_rmf_output',
  'pack_nist_ai_rmf',
  NULL,
  'NIST AI RMF output monitoring governance',
  'NIST AI RMF pack v1 output — complementary monitoring log control.',
  'enigma',
  'ai_risk',
  'seed'
),
(
  'pol_owasp_llm_2025_input',
  'pack_owasp_llm_2025',
  NULL,
  'OWASP LLM Top 10 2025 input governance',
  'OWASP LLM 2025 pack v1 input — security-control evidence gates as Enigma controls.',
  'enigma',
  'ai_risk',
  'seed'
),
(
  'pol_owasp_llm_2025_output',
  'pack_owasp_llm_2025',
  NULL,
  'OWASP LLM Top 10 2025 output governance',
  'OWASP LLM 2025 pack v1 output — complementary output handling log control.',
  'enigma',
  'ai_risk',
  'seed'
),
(
  'pol_eu_ai_act_input',
  'pack_eu_ai_act',
  NULL,
  'EU AI Act input governance',
  'EU AI Act pack v1 input — prohibited / high-risk / Art. 50 / GPAI regulatory obligation gates.',
  'enigma',
  'ai_risk',
  'seed'
),
(
  'pol_eu_ai_act_output',
  'pack_eu_ai_act',
  NULL,
  'EU AI Act output governance',
  'EU AI Act pack v1 output — complementary governance logging.',
  'enigma',
  'ai_risk',
  'seed'
),
(
  'pol_iso_42001_input',
  'pack_iso_42001',
  NULL,
  'ISO/IEC 42001 input governance',
  'ISO 42001 pack v1 input — AI management-system evidence gates as Enigma controls.',
  'enigma',
  'ai_risk',
  'seed'
),
(
  'pol_iso_42001_output',
  'pack_iso_42001',
  NULL,
  'ISO/IEC 42001 output governance',
  'ISO 42001 pack v1 output — complementary governance logging.',
  'enigma',
  'ai_risk',
  'seed'
),
(
  'pol_iso_23894_input',
  'pack_iso_23894',
  NULL,
  'ISO/IEC 23894 input governance',
  'ISO 23894 pack v1 input — AI risk-management evidence gates as Enigma controls.',
  'enigma',
  'ai_risk',
  'seed'
),
(
  'pol_iso_23894_output',
  'pack_iso_23894',
  NULL,
  'ISO/IEC 23894 output governance',
  'ISO 23894 pack v1 output — complementary governance logging.',
  'enigma',
  'ai_risk',
  'seed'
),
(
  'pol_iso_42005_input',
  'pack_iso_42005',
  NULL,
  'ISO/IEC 42005 input governance',
  'ISO 42005 pack v1 input — AI system impact-assessment evidence gates as Enigma controls.',
  'enigma',
  'ai_risk',
  'seed'
),
(
  'pol_iso_42005_output',
  'pack_iso_42005',
  NULL,
  'ISO/IEC 42005 output governance',
  'ISO 42005 pack v1 output — complementary governance logging.',
  'enigma',
  'ai_risk',
  'seed'
),
(
  'pol_financial_tokenize',
  'pack_financial',
  NULL,
  'Financial data input governance',
  'Protects financial data in AI requests; write, export, and sharing stay controlled unless human approval allows them.',
  'enigma',
  'financial',
  'seed'
),
(
  'pol_legal_no_external',
  'pack_legal',
  NULL,
  'Legal content input governance',
  'Keeps privileged legal content off external models and blocks export or sharing.',
  'enigma',
  'legal',
  'seed'
)
ON CONFLICT (policy_id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

INSERT INTO policy_versions (
  policy_version_id, policy_id, version, status, priority, scope_tier, phase,
  activated_at, activated_by, changelog, content_hash, rules, created_by
)
VALUES
(
  'pv_pol_hipaa_phi_local_v1',
  'pol_hipaa_phi_local',
  1,
  'suspended',
  200,
  'regulatory',
  'input',
  NULL,
  NULL,
  'M4 HIPAA overlay (immutable historical)',
  'sha256:hipaa_overlay_v1',
  '[{"interpreter":"hipaa_overlay_v1"}]'::jsonb,
  'seed'
),
(
  'pv_pol_hipaa_v2',
  'pol_hipaa_phi_local',
  2,
  'suspended',
  200,
  'regulatory',
  'input',
  NULL,
  NULL,
  'HIPAA pack v2 — health-information lifecycle governance (immutable historical; suspended on v3)',
  'sha256:hipaa_pack_v2',
  '[{"interpreter":"hipaa_pack_v2","classification_profile_id":"hipaa_class_profile_v2"}]'::jsonb,
  'seed'
),
(
  'pv_pol_hipaa_v3',
  'pol_hipaa_phi_local',
  3,
  'active',
  200,
  'regulatory',
  'input',
  now(),
  'seed',
  'HIPAA pack v3 — PHI vs health-sensitive; controls-satisfied; purpose context',
  'sha256:hipaa_pack_v3',
  '[{"interpreter":"hipaa_pack_v3","classification_profile_id":"hipaa_class_profile_v3"}]'::jsonb,
  'seed'
),
(
  'pv_pol_hipaa_release_v1',
  'pol_hipaa_release',
  1,
  'suspended',
  200,
  'regulatory',
  'output',
  NULL,
  NULL,
  'HIPAA pack v2 output/release governance (immutable historical)',
  'sha256:hipaa_pack_v2_output',
  '[{"interpreter":"hipaa_pack_v2_output"}]'::jsonb,
  'seed'
),
(
  'pv_pol_hipaa_release_v2',
  'pol_hipaa_release',
  2,
  'active',
  200,
  'regulatory',
  'output',
  now(),
  'seed',
  'HIPAA pack v3 output — Enigma release authorizes detokenization',
  'sha256:hipaa_pack_v3_output',
  '[{"interpreter":"hipaa_pack_v3_output"}]'::jsonb,
  'seed'
),
(
  'pv_pol_part2_sud_records_v1',
  'pol_part2_sud_records',
  1,
  'active',
  210,
  'regulatory',
  'input',
  now(),
  'seed',
  '42 CFR Part 2 pack v1.0 input — SUD confidentiality + consent gates',
  'sha256:part2_pack_v1',
  '[{"interpreter":"part2_pack_v1"}]'::jsonb,
  'seed'
),
(
  'pv_pol_part2_redisclosure_v1',
  'pol_part2_redisclosure',
  1,
  'active',
  210,
  'regulatory',
  'output',
  now(),
  'seed',
  '42 CFR Part 2 pack v1.0 output — redisclosure / Enigma release',
  'sha256:part2_pack_v1_output',
  '[{"interpreter":"part2_pack_v1_output"}]'::jsonb,
  'seed'
),
(
  'pv_pol_nist_ai_rmf_input_v1',
  'pol_nist_ai_rmf_input',
  1,
  'active',
  150,
  'framework',
  'input',
  now(),
  'seed',
  'NIST AI RMF pack v1.0 input — GOVERN/MAP/MEASURE/MANAGE Enigma controls',
  'sha256:nist_ai_rmf_pack_v1',
  '[{"interpreter":"nist_ai_rmf_pack_v1"}]'::jsonb,
  'seed'
),
(
  'pv_pol_nist_ai_rmf_output_v1',
  'pol_nist_ai_rmf_output',
  1,
  'active',
  150,
  'framework',
  'output',
  now(),
  'seed',
  'NIST AI RMF pack v1.0 output — complementary monitoring log',
  'sha256:nist_ai_rmf_pack_v1_output',
  '[{"interpreter":"nist_ai_rmf_pack_v1_output"}]'::jsonb,
  'seed'
),
(
  'pv_pol_owasp_llm_2025_input_v1',
  'pol_owasp_llm_2025_input',
  1,
  'active',
  140,
  'security_guidance',
  'input',
  now(),
  'seed',
  'OWASP LLM Top 10 2025 pack v1.0 input — security-control evidence gates',
  'sha256:owasp_llm_2025_pack_v1',
  '[{"interpreter":"owasp_llm_2025_pack_v1"}]'::jsonb,
  'seed'
),
(
  'pv_pol_owasp_llm_2025_output_v1',
  'pol_owasp_llm_2025_output',
  1,
  'active',
  140,
  'security_guidance',
  'output',
  now(),
  'seed',
  'OWASP LLM Top 10 2025 pack v1.0 output — complementary handling log',
  'sha256:owasp_llm_2025_pack_v1_output',
  '[{"interpreter":"owasp_llm_2025_pack_v1_output"}]'::jsonb,
  'seed'
),
(
  'pv_pol_eu_ai_act_input_v1',
  'pol_eu_ai_act_input',
  1,
  'active',
  160,
  'regulatory',
  'input',
  now(),
  'seed',
  'EU AI Act pack v1.0 input — Regulation (EU) 2024/1689 obligation gates',
  'sha256:eu_ai_act_pack_v1',
  '[{"interpreter":"eu_ai_act_pack_v1"}]'::jsonb,
  'seed'
),
(
  'pv_pol_eu_ai_act_output_v1',
  'pol_eu_ai_act_output',
  1,
  'active',
  160,
  'regulatory',
  'output',
  now(),
  'seed',
  'EU AI Act pack v1.0 output — complementary governance log',
  'sha256:eu_ai_act_pack_v1_output',
  '[{"interpreter":"eu_ai_act_pack_v1_output"}]'::jsonb,
  'seed'
),
(
  'pv_pol_iso_42001_input_v1',
  'pol_iso_42001_input',
  1,
  'active',
  130,
  'standard',
  'input',
  now(),
  'seed',
  'ISO/IEC 42001 pack v1.0 input — AI management-system evidence gates',
  'sha256:iso_42001_pack_v1',
  '[{"interpreter":"iso_42001_pack_v1"}]'::jsonb,
  'seed'
),
(
  'pv_pol_iso_42001_output_v1',
  'pol_iso_42001_output',
  1,
  'active',
  130,
  'standard',
  'output',
  now(),
  'seed',
  'ISO/IEC 42001 pack v1.0 output — complementary governance log',
  'sha256:iso_42001_pack_v1_output',
  '[{"interpreter":"iso_42001_pack_v1_output"}]'::jsonb,
  'seed'
),
(
  'pv_pol_iso_23894_input_v1',
  'pol_iso_23894_input',
  1,
  'active',
  125,
  'standard',
  'input',
  now(),
  'seed',
  'ISO/IEC 23894 pack v1.0 input — AI risk-management evidence gates',
  'sha256:iso_23894_pack_v1',
  '[{"interpreter":"iso_23894_pack_v1"}]'::jsonb,
  'seed'
),
(
  'pv_pol_iso_23894_output_v1',
  'pol_iso_23894_output',
  1,
  'active',
  125,
  'standard',
  'output',
  now(),
  'seed',
  'ISO/IEC 23894 pack v1.0 output — complementary governance log',
  'sha256:iso_23894_pack_v1_output',
  '[{"interpreter":"iso_23894_pack_v1_output"}]'::jsonb,
  'seed'
),
(
  'pv_pol_iso_42005_input_v1',
  'pol_iso_42005_input',
  1,
  'active',
  120,
  'standard',
  'input',
  now(),
  'seed',
  'ISO/IEC 42005 pack v1.0 input — AI system impact-assessment evidence gates',
  'sha256:iso_42005_pack_v1',
  '[{"interpreter":"iso_42005_pack_v1"}]'::jsonb,
  'seed'
),
(
  'pv_pol_iso_42005_output_v1',
  'pol_iso_42005_output',
  1,
  'active',
  120,
  'standard',
  'output',
  now(),
  'seed',
  'ISO/IEC 42005 pack v1.0 output — complementary governance log',
  'sha256:iso_42005_pack_v1_output',
  '[{"interpreter":"iso_42005_pack_v1_output"}]'::jsonb,
  'seed'
),
(
  'pv_pol_financial_tokenize_v1',
  'pol_financial_tokenize',
  1,
  'suspended',
  200,
  'regulatory',
  'input',
  NULL,
  NULL,
  'M4 financial framework',
  'sha256:financial_overlay_v1',
  '[{"interpreter":"financial_overlay_v1"}]'::jsonb,
  'seed'
),
(
  'pv_pol_legal_no_external_v1',
  'pol_legal_no_external',
  1,
  'suspended',
  200,
  'regulatory',
  'input',
  NULL,
  NULL,
  'M4 legal framework',
  'sha256:legal_overlay_v1',
  '[{"interpreter":"legal_overlay_v1"}]'::jsonb,
  'seed'
)
ON CONFLICT (policy_id, version) DO UPDATE SET
  status = EXCLUDED.status,
  changelog = EXCLUDED.changelog,
  content_hash = EXCLUDED.content_hash,
  rules = EXCLUDED.rules,
  activated_at = EXCLUDED.activated_at,
  activated_by = EXCLUDED.activated_by;
