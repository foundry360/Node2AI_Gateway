import { describe, expect, it } from 'vitest';
import {
  InMemoryPolicyRepository,
  PackBackedEnterprisePdp,
  applyHipaaClassificationProfile,
  compileHipaaPack,
  HIPAA_PROVENANCE_GRAPH,
  resolveMatchedRuleProvenance,
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

describe('HIPAA v3.1 provenance & evidence hardening', () => {
  it('compiles provenance graph with obligations and sources', () => {
    const compiled = compileHipaaPack();
    expect(compiled.pack_version).toBe('3.1.0');
    expect(compiled.provenance.sources.src_45cfr164?.authority_tier).toBe(1);
    expect(compiled.provenance.sources.src_45cfr164?.legal_authority).toBe(true);
    expect(compiled.provenance.sources.src_nist_800_66_r2?.authority_tier).toBe(4);
    expect(compiled.provenance.sources.src_nist_800_66_r2?.legal_authority).toBe(false);
    expect(compiled.provenance.sources.src_nist_800_66_r2?.authority_type).toBe(
      'IMPLEMENTATION_GUIDANCE',
    );
    expect(compiled.provenance.obligations['HIPAA-OBL-TRANSMISSION']?.citations).toContain(
      '45 CFR 164.312(e)',
    );
    expect(compiled.provenance.obligations['HIPAA-OBL-PHI-PROTECTION']?.citations).toEqual(
      expect.arrayContaining(['45 CFR 164.306', '45 CFR 164.530']),
    );
  });

  it('1. CFR provenance on material DENY (write path)', async () => {
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
    const prov = decision.explanation.provenance;
    expect(prov).toBeDefined();
    const rule = prov!.matched_rules.find(
      (r) => r.rule_id === 'HIPAA-R-INPUT-WRITE-REQUIRE-APPROVAL',
    );
    expect(rule).toBeDefined();
    expect(rule!.obligation_ids).toEqual(
      expect.arrayContaining([
        'HIPAA-OBL-DISCLOSURE',
        'HIPAA-OBL-INTEGRITY',
        'HIPAA-OBL-AUTHORIZATION',
      ]),
    );
    expect(rule!.citations).toEqual(
      expect.arrayContaining(['45 CFR 164.502', '45 CFR 164.506', '45 CFR 164.312(c)']),
    );
    expect(rule!.source_ids).toContain('src_45cfr164');
    expect(rule!.authority_tier).toBe(1);
    expect(rule!.authority).toMatch(/45 CFR Part 164/);
  });

  it('2. Multiple citations preserved', async () => {
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
    const rule = decision.explanation.provenance?.matched_rules.find(
      (r) => r.rule_id === 'HIPAA-R-INPUT-CONTROLS-SATISFIED',
    );
    expect(rule).toBeDefined();
    expect(rule!.citations).toEqual(
      expect.arrayContaining(['45 CFR 164.306', '45 CFR 164.530', '45 CFR 164.312(b)']),
    );
    expect(rule!.citations.length).toBeGreaterThanOrEqual(2);
  });

  it('3. Classification heuristic separated from regulatory reference', () => {
    const result = applyHipaaClassificationProfile({
      text: 'Patient email for clinical follow-up jane@example.com',
      sensitivity: 'PII',
      entityTypes: ['EMAIL'],
      applicationType: 'clinical',
      reasonCodes: ['EMAIL_PATTERN'],
    });
    expect(result.classification.sensitivity).toBe('PHI');
    expect(result.classification_provenance.classification_basis?.type).toBe('ENIGMA_HEURISTIC');
    expect(result.classification_provenance.classification_basis?.rule_id).toBe(
      'elev.identifier_plus_health_context',
    );
    expect(result.classification_provenance.regulatory_reference?.citations).toContain(
      '45 CFR 160.103',
    );
    expect(result.classification_provenance.regulatory_reference?.source_ids).toContain(
      'src_45cfr160',
    );
    expect(result.classification_provenance.applicability?.basis).toBe('ENIGMA_OPERATIONAL');
  });

  it('4. NIST cannot become legal authority for a regulatory requirement', () => {
    const nist = HIPAA_PROVENANCE_GRAPH.sources.src_nist_800_66_r2;
    expect(nist.authority_tier).toBe(4);
    expect(nist.legal_authority).toBe(false);
    expect(nist.authority_type).toBe('IMPLEMENTATION_GUIDANCE');

    for (const obl of Object.values(HIPAA_PROVENANCE_GRAPH.obligations)) {
      if (obl.requirement_type === 'REGULATORY_REQUIREMENT') {
        expect(obl.source_ids).not.toContain('src_nist_800_66_r2');
        expect(obl.authority_tier).not.toBe(4);
      }
    }

    const resolved = resolveMatchedRuleProvenance(
      {
        rule_id: 'HIPAA-R-INPUT-EXTERNAL-DENY',
        obligation_ids: ['HIPAA-OBL-TRANSMISSION'],
        sources: ['src_45cfr164'],
      },
      HIPAA_PROVENANCE_GRAPH,
    );
    expect(resolved.authority_tier).toBe(1);
    expect(resolved.legal_authority).toBe(true);
    expect(resolved.source_ids).not.toContain('src_nist_800_66_r2');
  });

  it('5. Output release provenance chain', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo, { allowDetokenization: true });
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
    expect(released.reason_codes).toContain('ENIGMA_RELEASE_AUTHORIZED_DETOKENIZATION');
    const rule = released.explanation.provenance?.matched_rules.find(
      (r) => r.rule_id === 'HIPAA-R-OUT-RELEASE-EVAL',
    );
    expect(rule).toBeDefined();
    expect(rule!.obligation_ids).toEqual(
      expect.arrayContaining(['HIPAA-OBL-DISCLOSURE', 'HIPAA-OBL-ACCESS']),
    );
    expect(rule!.citations).toEqual(
      expect.arrayContaining(['45 CFR 164.502', '45 CFR 164.506', '45 CFR 164.312(a)']),
    );
    expect(rule!.source_ids).toContain('src_45cfr164');
    expect(rule!.authority_tier).toBe(1);
    expect(released.explanation.provenance?.controls?.some((c) => c.control_id)).toBe(true);
    expect(released.explanation.provenance?.enforcement?.actions).toContain(
      'AUTHORIZE_DETOKENIZATION',
    );
  });

  it('6. Stored evaluation contains exact citation information', async () => {
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
    const stored = repo.getEvaluation(decision.evaluation_id);
    expect(stored).toBeDefined();
    expect(stored!.explanation.provenance?.matched_rules[0]?.citations.length).toBeGreaterThan(0);
    expect(stored!.explanation.provenance?.matched_rules.some((r) =>
      r.citations.includes('45 CFR 164.312(c)'),
    )).toBe(true);
  });

  it('7. No behavioral regression — cloud PHI deny, local allow, skip, email elevation', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);

    const cloudDeny = await pdp.evaluateLegacyRequest({
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
    expect(cloudDeny.decision).toBe('DENY');

    const localAllow = await pdp.evaluateLegacyRequest({
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
        reason_codes: ['REGULATORY_APPLICABILITY:HIPAA'],
      },
      deploymentMode: 'connected',
      purpose: 'utilization_management',
      authorization_context: 'authorized',
    });
    expect(localAllow.decision).toBe('ALLOW');
    expect(localAllow.reason_codes).toContain('HIPAA_PHI_PROCESSING_CONTROLS_SATISFIED');

    const skip = await pdp.evaluateLegacyRequest({
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
    expect(skip.decision).toBe('ALLOW');
    expect(
      skip.explanation.matched_conditions.some((m) =>
        m.condition_key.includes('hipaa_pack_v3_skip_health_sensitive_not_phi'),
      ),
    ).toBe(true);

    const emailAlone = applyHipaaClassificationProfile({
      text: 'Contact jane@example.com about the schedule',
      sensitivity: 'PII',
      entityTypes: ['EMAIL'],
      reasonCodes: ['EMAIL_PATTERN'],
    });
    expect(emailAlone.classification.sensitivity).toBe('PII');
    expect(emailAlone.regulatory.applicability).not.toContain('HIPAA');

    const emailElevated = applyHipaaClassificationProfile({
      text: 'Patient email for clinical follow-up jane@example.com',
      sensitivity: 'PII',
      entityTypes: ['EMAIL'],
      reasonCodes: ['EMAIL_PATTERN'],
    });
    expect(emailElevated.classification.sensitivity).toBe('PHI');
  });

  it('controls remain Enigma implementation options on TOKENIZE path', async () => {
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
    const rule = decision.explanation.provenance?.matched_rules.find(
      (r) => r.rule_id === 'HIPAA-R-INPUT-TOKENIZE-OPTION',
    );
    expect(rule?.requirement_type).toBe('IMPLEMENTATION_OPTION');
    expect(decision.explanation.provenance?.controls?.every((c) =>
      c.control_type === 'ENIGMA_IMPLEMENTATION_OPTION',
    )).toBe(true);
  });
});
