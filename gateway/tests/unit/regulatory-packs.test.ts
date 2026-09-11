import { describe, expect, it } from 'vitest';
import {
  InMemoryPolicyRepository,
  PackBackedEnterprisePdp,
  compileHipaaPack,
  applyHipaaClassificationProfile,
} from '../../src/policy/enterprise/index.js';
import type { Application, User } from '../../src/identity/types.js';

const clinician: User = {
  user_id: 'u1',
  organization_id: 'o1',
  roles: ['clinician'],
  permissions: [],
  status: 'active',
};

const clinicalApp: Application = {
  application_id: 'a1',
  organization_id: 'o1',
  name: 'App',
  type: 'clinical',
  environment: 'prod',
  status: 'active',
  trust_level: 'trusted',
  allowed_models: ['local-general-v1', 'cloud-public-gpt'],
  allowed_datasets: [],
  allowed_operations: ['summarize', 'write'],
};

describe('HIPAA pack v3 semantic refinement', () => {
  it('compiles pack v3 with suspended historical versions', () => {
    const compiled = compileHipaaPack();
    expect(compiled.pack_version).toBe('3.1.0');
    expect(compiled.classification_profile_id).toBe('hipaa_class_profile_v3');
    expect(compiled.policies.map((p) => p.interpreter)).toEqual(
      expect.arrayContaining(['hipaa_pack_v3', 'hipaa_pack_v3_output']),
    );
    expect(compiled.seed_versions.find((v) => v.policy_version_id === 'pv_pol_hipaa_v3')?.status).toBe(
      'active',
    );
    expect(compiled.seed_versions.find((v) => v.policy_version_id === 'pv_pol_hipaa_v2')?.status).toBe(
      'suspended',
    );
    expect(
      compiled.seed_versions.find((v) => v.policy_version_id === 'pv_pol_hipaa_phi_local_v1')?.status,
    ).toBe('suspended');
  });

  it('default snapshot activates hipaa_pack_v3', () => {
    const repo = new InMemoryPolicyRepository();
    const hipaa = repo.getPolicy('pol_hipaa_phi_local');
    expect(hipaa?.interpreter).toBe('hipaa_pack_v3');
    expect(hipaa?.version).toBe(3);
    expect(hipaa?.status).toBe('active');
    expect(repo.getPolicy('pol_hipaa_release')?.interpreter).toBe('hipaa_pack_v3_output');
    expect(repo.getPolicy('pol_hipaa_release')?.version).toBe(2);
  });

  it('1. MRN classified as PHI with HIPAA applicability', () => {
    const result = applyHipaaClassificationProfile({
      text: 'MRN: ABC12345',
      sensitivity: 'Internal',
      entityTypes: ['MRN'],
      reasonCodes: ['HEALTH_INFORMATION'],
    });
    expect(result.classification.sensitivity).toBe('PHI');
    expect(result.regulatory.applicability).toContain('HIPAA');
    expect(result.detection.entity_types).toContain('MRN');
  });

  it('2. Email alone classified as PII — not PHI, not HIPAA', () => {
    const result = applyHipaaClassificationProfile({
      text: 'Contact jane@example.com about the schedule',
      sensitivity: 'PII',
      entityTypes: ['EMAIL'],
      reasonCodes: ['EMAIL_PATTERN'],
    });
    expect(result.classification.sensitivity).toBe('PII');
    expect(result.regulatory.applicability).not.toContain('HIPAA');
    expect(result.reason_codes).toContain('ENIGMA_PII_WITHOUT_HEALTH_CONTEXT');
  });

  it('3. Email + patient context elevates to PHI', () => {
    const result = applyHipaaClassificationProfile({
      text: 'Patient email for clinical follow-up jane@example.com',
      sensitivity: 'PII',
      entityTypes: ['EMAIL'],
      applicationType: 'clinical',
      reasonCodes: ['EMAIL_PATTERN'],
    });
    expect(result.classification.sensitivity).toBe('PHI');
    expect(result.regulatory.applicability).toContain('HIPAA');
    expect(result.reason_codes).toContain('HIPAA_PROFILE_PII_ELEVATED_WITH_HEALTH_CONTEXT');
  });

  it('4. Credential is not elevated to PHI', () => {
    const result = applyHipaaClassificationProfile({
      text: 'patient clinical api_key=secret123456789012',
      sensitivity: 'Credential',
      entityTypes: ['API_KEY'],
      reasonCodes: ['CREDENTIAL_PATTERN'],
    });
    expect(result.classification.sensitivity).toBe('Credential');
    expect(result.regulatory.applicability).toEqual([]);
  });

  it('5. Health-sensitive does not automatically equal PHI', () => {
    const result = applyHipaaClassificationProfile({
      text: 'Discuss clinical guidelines for treatment protocols',
      sensitivity: 'Internal',
      entityTypes: [],
      reasonCodes: [],
    });
    expect(result.classification.sensitivity).toBe('Internal');
    expect(result.classification.health_sensitive).toBe(true);
    expect(result.regulatory.applicability).not.toContain('HIPAA');
    expect(result.reason_codes).toContain('ENIGMA_HEALTH_SENSITIVE_CONTEXT');
  });

  it('6-7. Local/private does not claim HIPAA approved; uses controls-satisfied', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1', 'cloud-public-gpt'],
      environment: 'prod',
      classification: {
        sensitivity: 'PHI',
        confidence: 0.99,
        risk: 'high',
        reason_codes: ['HEALTH_INFORMATION', 'REGULATORY_APPLICABILITY:HIPAA'],
      },
      deploymentMode: 'connected',
      purpose: 'utilization_management',
      authorization_context: 'authorized',
    });
    expect(decision.decision).toBe('ALLOW');
    expect(decision.reason_codes).toContain('HIPAA_PHI_PROCESSING_CONTROLS_SATISFIED');
    expect(decision.reason_codes.join(' ')).not.toMatch(/HIPAA_APPROVED|HIPAA_COMPLIANT/i);
    expect(decision.obligations.some((o) => o.code === 'LOCAL_MODEL_ONLY')).toBe(true);
  });

  it('8. PHI + unauthorized external → DENY', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'cloud-public-gpt',
      availableModels: ['local-general-v1', 'cloud-public-gpt'],
      environment: 'prod',
      classification: {
        sensitivity: 'PHI',
        confidence: 0.99,
        risk: 'high',
        reason_codes: ['HEALTH_INFORMATION', 'REGULATORY_APPLICABILITY:HIPAA'],
      },
      deploymentMode: 'connected',
      purpose: 'utilization_management',
      authorization_context: 'authorized',
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('PHI_PUBLIC_CLOUD_BLOCKED');
    expect(
      decision.explanation.matched_conditions.some((m) =>
        m.condition_key.includes('hipaa_pack_v3_reinforces_deny'),
      ),
    ).toBe(true);
  });

  it('9. PHI + local + controls satisfied → ALLOW_WITH_CONTROLS semantics', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'PHI',
        confidence: 0.99,
        risk: 'high',
        reason_codes: ['REGULATORY_APPLICABILITY:HIPAA'],
      },
      deploymentMode: 'connected',
      purpose: 'utilization_management',
      authorization_context: 'authorized',
    });
    expect(decision.decision).toBe('ALLOW');
    expect(decision.reason_codes).toContain('HIPAA_PHI_PROCESSING_CONTROLS_SATISFIED');
    expect(
      decision.explanation.matched_conditions.some((m) =>
        m.condition_key.includes('HIPAA-R-INPUT-CONTROLS-SATISFIED'),
      ),
    ).toBe(true);
  });

  it('10/18. Explicit unknown purpose → REVIEW (not silently approved)', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'PHI',
        confidence: 0.99,
        risk: 'high',
        reason_codes: ['REGULATORY_APPLICABILITY:HIPAA'],
      },
      deploymentMode: 'connected',
      purpose: 'unknown',
      authorization_context: 'authorized',
    });
    expect(decision.decision).toBe('REVIEW');
    expect(decision.reason_codes).toContain('HIPAA_PHI_INSUFFICIENT_EVIDENCE_FOR_PROCESSING');
  });

  it('11. TOKENIZE remains Enigma control reason code', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: { ...clinicalApp, trust_level: 'standard' },
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'PHI',
        confidence: 0.99,
        risk: 'high',
        reason_codes: ['REGULATORY_APPLICABILITY:HIPAA'],
        entities: [{ type: 'MRN', preview: 'AB…45', start: 0, end: 5, source: 'deterministic' }],
      },
      deploymentMode: 'connected',
      purpose: 'utilization_management',
      authorization_context: 'authorized',
    });
    expect(decision.decision).toBe('TOKENIZE');
    expect(decision.reason_codes).toContain('ENIGMA_TOKENIZE_SELECTED');
    expect(
      decision.explanation.matched_conditions.some((m) =>
        m.condition_key.includes('requirement_type:IMPLEMENTATION_OPTION'),
      ),
    ).toBe(true);
  });

  it('12-15. Enigma release authorizes detokenization; residual PHI blocked', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo, { allowDetokenization: true });

    const blocked = await pdp.evaluateLegacyResponse({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      model_id: 'local-general-v1',
      request_classification: {
        sensitivity: 'PHI',
        confidence: 0.99,
        risk: 'high',
        reason_codes: [],
      },
      inspection: {
        sensitivity: 'PHI',
        confidence: 0.99,
        risk: 'high',
        tool_or_action_detected: false,
        contains_tokens: false,
        entities: [],
        reason_codes: ['HEALTH_INFORMATION'],
        prohibited_markers: [],
      },
      input_was_tokenized: false,
      purpose: 'utilization_management',
      authorization_context: 'authorized',
    });
    expect(blocked.decision).toBe('BLOCK_OUTPUT');
    expect(blocked.reason_codes).toContain('HIPAA_PHI_OUTPUT_NOT_AUTHORIZED');

    const released = await pdp.evaluateLegacyResponse({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      model_id: 'local-general-v1',
      request_classification: {
        sensitivity: 'PHI',
        confidence: 0.99,
        risk: 'high',
        reason_codes: [],
      },
      inspection: {
        sensitivity: 'Internal',
        confidence: 0.9,
        risk: 'low',
        tool_or_action_detected: false,
        contains_tokens: true,
        entities: [],
        reason_codes: [],
        prohibited_markers: [],
      },
      input_was_tokenized: true,
      purpose: 'utilization_management',
      authorization_context: 'authorized',
    });
    expect(released.decision).not.toBe('BLOCK_OUTPUT');
    expect(released.reason_codes).toContain('ENIGMA_RELEASE_AUTHORIZED_DETOKENIZATION');
    expect(released.reason_codes.join(' ')).not.toMatch(/HIPAA_AUTHORIZED_DETOKENIZATION/);
    expect(released.obligations.some((o) => o.code === 'AUTHORIZE_DETOKENIZATION')).toBe(true);
  });

  it('17. Purpose is represented in evaluation matched evidence', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'PHI',
        confidence: 0.99,
        risk: 'high',
        reason_codes: ['REGULATORY_APPLICABILITY:HIPAA'],
      },
      deploymentMode: 'connected',
      purpose: 'utilization_management',
      authorization_context: 'authorized',
    });
    expect(
      decision.explanation.matched_conditions.some((m) =>
        m.condition_key.includes('purpose:utilization_management'),
      ),
    ).toBe(true);
  });

  it('22. Decision includes source provenance breadcrumbs', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'PHI',
        confidence: 0.99,
        risk: 'high',
        reason_codes: ['REGULATORY_APPLICABILITY:HIPAA'],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'authorized',
    });
    expect(
      decision.explanation.matched_conditions.some((m) => m.condition_key.startsWith('source:')),
    ).toBe(true);
    expect(
      decision.explanation.matched_conditions.some((m) =>
        m.condition_key.startsWith('requirement_type:'),
      ),
    ).toBe(true);
  });

  it('health-sensitive without PHI skips HIPAA pack', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1', 'cloud-public-gpt'],
      environment: 'prod',
      classification: {
        sensitivity: 'Internal',
        confidence: 0.7,
        risk: 'low',
        reason_codes: ['ENIGMA_HEALTH_SENSITIVE_CONTEXT'],
      },
      deploymentMode: 'connected',
    });
    expect(decision.decision).toBe('ALLOW');
    expect(
      decision.explanation.matched_conditions.some((m) =>
        m.condition_key.includes('hipaa_pack_v3_skip_health_sensitive_not_phi'),
      ),
    ).toBe(true);
  });

  it('write of PHI requires approval (not automatic DENY)', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'write',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'PHI',
        confidence: 0.99,
        risk: 'high',
        reason_codes: ['REGULATORY_APPLICABILITY:HIPAA'],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'authorized',
    });
    expect(decision.decision).toBe('REVIEW');
    expect(decision.reason_codes).toContain('HIPAA_PHI_WRITE_REQUIRES_APPROVAL');
  });
});

describe('Enigma EPA M4 regulatory overlays', () => {
  it('includes HIPAA/Financial/Legal packs in default snapshot', () => {
    const repo = new InMemoryPolicyRepository();
    const snap = repo.getSnapshot();
    expect(snap.packs.map((p) => p.pack_id)).toEqual(
      expect.arrayContaining(['pack_hipaa', 'pack_financial', 'pack_legal']),
    );
  });

  it('HIPAA pack reinforces PHI local-only obligations', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1', 'cloud-public-gpt'],
      environment: 'prod',
      classification: {
        sensitivity: 'PHI',
        confidence: 0.99,
        risk: 'high',
        reason_codes: ['HEALTH'],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'authorized',
    });
    expect(decision.decision).toBe('ALLOW');
    expect(decision.obligations.some((o) => o.code === 'LOCAL_MODEL_ONLY')).toBe(true);
    expect(decision.obligations.some((o) => o.code === 'NO_EXTERNAL_TRANSMISSION')).toBe(true);
    expect(decision.explanation.matched_conditions.some((m) => m.condition_key.includes('hipaa'))).toBe(
      true,
    );
  });

  it('activating financial overlay tokenizes FINANCIAL classification', async () => {
    const repo = new InMemoryPolicyRepository();
    repo.setPolicyStatus('pol_financial_tokenize', 'active');
    repo.setPackStatus('pack_financial', 'active');
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'FINANCIAL',
        confidence: 0.95,
        risk: 'medium',
        reason_codes: [],
      },
      deploymentMode: 'connected',
    });
    expect(decision.decision).toBe('TOKENIZE');
    expect(decision.reason_codes).toContain('FINANCIAL_REQUIRES_TOKENIZE');
  });

  it('financial overlay blocks WRITE of FINANCIAL data', async () => {
    const repo = new InMemoryPolicyRepository();
    repo.setPolicyStatus('pol_financial_tokenize', 'active');
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: {
        ...clinicalApp,
        allowed_operations: ['summarize', 'write'],
      },
      operation: 'write',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'FINANCIAL',
        confidence: 0.95,
        risk: 'high',
        reason_codes: [],
      },
      deploymentMode: 'connected',
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('FINANCIAL_WRITE_REQUIRES_APPROVAL');
  });

  it('activating legal overlay blocks external models for LEGAL data', async () => {
    const repo = new InMemoryPolicyRepository();
    repo.setPolicyStatus('pol_legal_no_external', 'active');
    repo.setPackStatus('pack_legal', 'active');
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'cloud-public-gpt',
      availableModels: ['local-general-v1', 'cloud-public-gpt'],
      environment: 'prod',
      classification: {
        sensitivity: 'LEGAL',
        confidence: 0.95,
        risk: 'high',
        reason_codes: [],
      },
      deploymentMode: 'connected',
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('LEGAL_EXTERNAL_MODEL_BLOCKED');
  });
});
