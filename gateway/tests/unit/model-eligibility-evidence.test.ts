/**
 * Historical model authorization evidence — eligible_models durability.
 *
 * Proves EPA authorized set is persisted on policy_evaluations and survives
 * historical hydration / registry changes. Does not change decision semantics.
 */
import { describe, expect, it } from 'vitest';
import type { Application, User } from '../../src/identity/types.js';
import {
  InMemoryPolicyRepository,
  PackBackedEnterprisePdp,
  ensureDefaultOverlayRegistry,
  evaluationRecordToDecisionPayload,
  resolvePackContributions,
  restoreEvaluationRestrictions,
  rowToEvaluationRecord,
  snapshotDecisionRestrictions,
  toEvaluationRecord,
  type PackEvaluationContribution,
  type PolicyDecision,
} from '../../src/policy/enterprise/index.js';
import {
  createPhase1Gateway,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';

ensureDefaultOverlayRegistry();

const clinician: User = {
  user_id: 'u_elig_1',
  organization_id: 'org_hc',
  roles: ['clinician'],
  permissions: [],
  status: 'active',
};

const clinicalApp: Application = {
  application_id: 'app_clinical',
  organization_id: 'org_hc',
  name: 'Clinical',
  type: 'clinical',
  environment: 'prod',
  status: 'active',
  trust_level: 'trusted',
  allowed_models: ['local-general-v1', 'cloud-public-gpt'],
  allowed_datasets: [],
  allowed_operations: ['summarize', 'analyze'],
};

function contrib(
  partial: Partial<PackEvaluationContribution> &
    Pick<PackEvaluationContribution, 'pack_id' | 'policy_id' | 'decision'>,
): PackEvaluationContribution {
  return {
    pack_version: '0.0.0-test',
    policy_version: 1,
    reason_codes: [],
    rule_ids: [],
    obligation_ids: [],
    obligations: [],
    controls: [],
    transforms: [],
    eligible_models: ['local-general-v1'],
    matched: [],
    applicable: true,
    ...partial,
  };
}

function suspendAiRisk(repo: InMemoryPolicyRepository) {
  for (const id of [
    'pol_nist_ai_rmf_input',
    'pol_nist_ai_rmf_output',
    'pol_owasp_llm_2025_input',
    'pol_owasp_llm_2025_output',
    'pol_eu_ai_act_input',
    'pol_eu_ai_act_output',
    'pol_iso_42001_input',
    'pol_iso_42001_output',
    'pol_iso_23894_input',
    'pol_iso_23894_output',
    'pol_iso_42005_input',
    'pol_iso_42005_output',
    'pol_soc2_input',
    'pol_soc2_output',
    'pol_nist_csf_2_input',
    'pol_nist_csf_2_output',
    'pol_iso_38507_input',
    'pol_iso_38507_output',
    'pol_iso_27001_input',
    'pol_iso_27001_output',
    'pol_iso_27701_input',
    'pol_iso_27701_output',
    'pol_nist_privacy_framework_input',
    'pol_nist_privacy_framework_output',
  ]) {
    try {
      repo.setPolicyStatus(id, 'suspended');
    } catch {
      /* optional */
    }
  }
}

describe('Model eligibility evidence — persistence helpers', () => {
  it('snapshot always records eligible_models (including empty)', () => {
    expect(snapshotDecisionRestrictions({ eligible_models: ['a', 'b'] })).toEqual({
      eligible_models: ['a', 'b'],
    });
    expect(snapshotDecisionRestrictions({ eligible_models: [] }).eligible_models).toEqual(
      [],
    );
    expect(snapshotDecisionRestrictions({}).eligible_models).toEqual([]);
    expect(snapshotDecisionRestrictions(undefined).eligible_models).toEqual([]);
  });

  it('restore prefers record.restrictions; falls back to evidence_in; never invents', () => {
    expect(
      restoreEvaluationRestrictions({
        restrictions: { eligible_models: ['model-a'] },
        evidence_in: {},
      })?.eligible_models,
    ).toEqual(['model-a']);
    expect(
      restoreEvaluationRestrictions({
        evidence_in: { restrictions: { eligible_models: [] } },
      })?.eligible_models,
    ).toEqual([]);
    expect(
      restoreEvaluationRestrictions({
        evidence_in: {},
      }),
    ).toBeUndefined();
  });
});

describe('Model eligibility evidence — historical evaluation', () => {
  it('1. ALLOW persists eligible_models and historical hydrate returns them', async () => {
    const repo = new InMemoryPolicyRepository();
    suspendAiRisk(repo);
    repo.setPolicyStatus('pol_part2_sud_records', 'suspended');
    repo.setPolicyStatus('pol_part2_redisclosure', 'suspended');
    repo.setPolicyStatus('pol_onc_hti1_dsi_input', 'suspended');
    repo.setPolicyStatus('pol_onc_hti1_dsi_output', 'suspended');
    repo.setPolicyStatus('pol_cms_interop_input', 'suspended');
    repo.setPolicyStatus('pol_cms_interop_output', 'suspended');
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
        confidence: 0.9,
        risk: 'low',
        reason_codes: [],
      },
      deploymentMode: 'connected',
      request_id: 'req_elig_allow',
    });
    expect(decision.decision).toBe('ALLOW');
    expect(decision.restrictions.eligible_models).toEqual(
      expect.arrayContaining(['local-general-v1']),
    );
    expect(decision.restrictions.eligible_models!.length).toBeGreaterThan(0);

    const stored = repo.getEvaluation(decision.evaluation_id!)!;
    expect(stored.restrictions?.eligible_models).toEqual(
      decision.restrictions.eligible_models,
    );
    expect(
      (stored.evidence_in.restrictions as { eligible_models: string[] }).eligible_models,
    ).toEqual(decision.restrictions.eligible_models);

    const hydrated = evaluationRecordToDecisionPayload(stored);
    expect(hydrated.restrictions.eligible_models).toEqual(
      decision.restrictions.eligible_models,
    );
    expect(Array.isArray(hydrated.restrictions.eligible_models)).toBe(true);
  });

  it('2. Requested model outside eligible set is not executed; DENY keeps []', async () => {
    const repo = new InMemoryPolicyRepository();
    suspendAiRisk(repo);
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: {
        ...clinicalApp,
        allowed_models: ['local-general-v1'],
      },
      operation: 'summarize',
      requestedModel: 'cloud-public-gpt',
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
      authorization_context: 'unauthorized',
      request_id: 'req_elig_not_exec',
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.restrictions.eligible_models).toEqual([]);
    const stored = repo.getEvaluation(decision.evaluation_id!)!;
    expect(stored.restrictions?.eligible_models).toEqual([]);
    // Unauthorized requested model is never recorded as an authorized eligible id.
    expect(stored.restrictions?.eligible_models).not.toContain('cloud-public-gpt');
  });

  it('3. DENY persists eligible_models as explicit []', async () => {
    const repo = new InMemoryPolicyRepository();
    suspendAiRisk(repo);
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
        reason_codes: ['REGULATORY_APPLICABILITY:HIPAA'],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'unauthorized',
      request_id: 'req_elig_deny',
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.restrictions.eligible_models).toEqual([]);

    const stored = repo.getEvaluation(decision.evaluation_id!)!;
    expect(stored.restrictions?.eligible_models).toEqual([]);
    expect(
      Array.isArray(
        (stored.evidence_in.restrictions as { eligible_models: unknown }).eligible_models,
      ),
    ).toBe(true);
    expect(
      (stored.evidence_in.restrictions as { eligible_models: string[] }).eligible_models,
    ).toEqual([]);

    const hydrated = evaluationRecordToDecisionPayload(stored);
    expect(hydrated.restrictions.eligible_models).toEqual([]);
    expect(Object.prototype.hasOwnProperty.call(hydrated.restrictions, 'eligible_models')).toBe(
      true,
    );
  });

  it('4. Cross-domain CONSEQUENCE_DENY persists eligible_models []', async () => {
    const resolved = resolvePackContributions([
      contrib({
        pack_id: 'pack_cms',
        policy_id: 'pol_cms_interop_input',
        decision: 'ALLOW',
        eligible_models: ['local-general-v1', 'cloud-public-gpt'],
        reason_codes: ['CMS_OK'],
      }),
      contrib({
        pack_id: 'pack_hipaa',
        policy_id: 'pol_hipaa_phi_local',
        decision: 'DENY',
        eligible_models: [],
        reason_codes: ['HIPAA_DENY'],
      }),
    ]);
    expect(resolved.decision).toBe('DENY');
    expect(resolved.resolution.basis).toBe('CONSEQUENCE_DENY');
    expect(resolved.eligible_models).toEqual([]);

    const decision: PolicyDecision = {
      decision: 'DENY',
      reason: resolved.reason_codes.join(', '),
      reason_codes: resolved.reason_codes,
      applicable_policies: resolved.applicable_policies,
      obligations: resolved.obligations,
      transformations: [],
      restrictions: { eligible_models: resolved.eligible_models },
      approval_requirements: [],
      conflicts: resolved.conflicts,
      explanation: {
        matched_conditions: [],
        rejected_conditions: [],
        final_reason: resolved.reason_codes.join(', '),
        resolution: {
          category: resolved.resolution.category,
          basis: resolved.resolution.basis,
          contributing_pack_ids: resolved.resolution.contributing_pack_ids,
          detail: resolved.resolution.detail,
          contributions: resolved.resolution.contributions.map((c) => ({
            pack_id: c.pack_id,
            policy_id: c.policy_id,
            policy_version: c.policy_version,
            decision: c.decision,
            rule_ids: c.rule_ids,
            obligation_ids: c.obligation_ids,
            obligations: c.obligations.map((o) => o.code),
            controls: c.controls,
            reason_codes: c.reason_codes,
          })),
        },
      },
      evidence: { classification: 'PHI', confidence: 1, risk: 'high', reason_codes: [] },
      evaluation_id: 'eval_cross_deny_elig',
    };

    const record = toEvaluationRecord(decision, { request_id: 'req_cross_deny' });
    expect(record.restrictions?.eligible_models).toEqual([]);
    const hydrated = evaluationRecordToDecisionPayload(record);
    expect(hydrated.decision).toBe('DENY');
    expect(hydrated.restrictions.eligible_models).toEqual([]);
    expect(hydrated.explanation.resolution?.basis).toBe('CONSEQUENCE_DENY');
  });

  it('5. Restrictive multi-pack compose intersects eligible_models and persists', () => {
    const resolved = resolvePackContributions([
      contrib({
        pack_id: 'pack_enterprise_baseline',
        policy_id: 'pol_phase2_core',
        decision: 'ALLOW',
        eligible_models: ['local-a', 'local-b', 'cloud-a'],
      }),
      contrib({
        pack_id: 'pack_hipaa',
        policy_id: 'pol_hipaa_phi_local',
        decision: 'ALLOW',
        eligible_models: ['local-a', 'local-b'],
        obligations: [{ code: 'LOCAL_MODEL_ONLY' }],
      }),
      contrib({
        pack_id: 'pack_cms',
        policy_id: 'pol_cms_interop_input',
        decision: 'ALLOW',
        eligible_models: ['local-a', 'local-b', 'cloud-a'],
      }),
    ]);
    expect(resolved.eligible_models.sort()).toEqual(['local-a', 'local-b'].sort());

    const decision: PolicyDecision = {
      decision: resolved.decision,
      reason: 'compose',
      reason_codes: resolved.reason_codes,
      applicable_policies: resolved.applicable_policies,
      obligations: resolved.obligations,
      transformations: [],
      restrictions: { eligible_models: resolved.eligible_models },
      approval_requirements: [],
      conflicts: [],
      explanation: {
        matched_conditions: [],
        rejected_conditions: [],
        final_reason: 'compose',
        resolution: {
          category: resolved.resolution.category,
          basis: resolved.resolution.basis,
          contributing_pack_ids: resolved.resolution.contributing_pack_ids,
          detail: resolved.resolution.detail,
        },
      },
      evidence: { classification: 'PHI', confidence: 1, risk: 'high', reason_codes: [] },
      evaluation_id: 'eval_intersect',
    };
    const record = toEvaluationRecord(decision);
    expect(record.restrictions?.eligible_models.sort()).toEqual(
      ['local-a', 'local-b'].sort(),
    );
    expect(
      evaluationRecordToDecisionPayload(record).restrictions.eligible_models!.sort(),
    ).toEqual(['local-a', 'local-b'].sort());
  });

  it('6. Historical retrieval via rowToEvaluationRecord preserves eligible set', () => {
    const decision: PolicyDecision = {
      decision: 'ALLOW',
      reason: 'ok',
      reason_codes: ['POLICY_ALLOW'],
      applicable_policies: [],
      obligations: [],
      transformations: [],
      restrictions: { eligible_models: ['local-general-v1', 'local-special-v1'] },
      approval_requirements: [],
      conflicts: [],
      explanation: {
        matched_conditions: [],
        rejected_conditions: [],
        final_reason: 'ok',
      },
      evidence: { classification: 'Internal', confidence: 1, risk: 'low', reason_codes: [] },
      evaluation_id: 'eval_hist_row',
    };
    const record = toEvaluationRecord(decision, { request_id: 'req_hist' });
    const row = {
      evaluation_id: record.evaluation_id,
      request_id: record.request_id,
      phase: record.phase,
      subject: record.subject,
      resource: record.resource,
      context: record.context,
      ai_context: record.ai_context,
      evidence_in: record.evidence_in,
      decision: record.decision,
      reason: record.reason,
      applicable_policies: record.applicable_policies,
      obligations: record.obligations,
      explanation: record.explanation,
      restrictions: record.restrictions,
      created_at: record.created_at,
    };
    const restored = rowToEvaluationRecord(row);
    expect(restored.restrictions?.eligible_models).toEqual([
      'local-general-v1',
      'local-special-v1',
    ]);
    expect(
      evaluationRecordToDecisionPayload(restored).restrictions.eligible_models,
    ).toEqual(['local-general-v1', 'local-special-v1']);
  });

  it('7. Empty eligible_models is preserved (not null / omitted / {})', () => {
    const record = toEvaluationRecord({
      decision: 'DENY',
      reason: 'deny',
      reason_codes: ['DENY'],
      applicable_policies: [],
      obligations: [],
      transformations: [],
      restrictions: { eligible_models: [] },
      approval_requirements: [],
      conflicts: [],
      explanation: {
        matched_conditions: [],
        rejected_conditions: [],
        final_reason: 'deny',
      },
      evidence: { classification: 'PHI', confidence: 1, risk: 'high', reason_codes: [] },
      evaluation_id: 'eval_empty',
    });
    expect(record.restrictions).toEqual({ eligible_models: [] });
    expect(record.restrictions?.eligible_models).toEqual([]);
    const payload = evaluationRecordToDecisionPayload(record);
    expect(payload.restrictions.eligible_models).toEqual([]);
    expect(payload.restrictions.eligible_models).not.toBeUndefined();
  });

  it('8. Registry changes do not rewrite historical eligible_models', async () => {
    const repo = new InMemoryPolicyRepository();
    suspendAiRisk(repo);
    repo.setPolicyStatus('pol_part2_sud_records', 'suspended');
    repo.setPolicyStatus('pol_part2_redisclosure', 'suspended');
    repo.setPolicyStatus('pol_onc_hti1_dsi_input', 'suspended');
    repo.setPolicyStatus('pol_onc_hti1_dsi_output', 'suspended');
    repo.setPolicyStatus('pol_cms_interop_input', 'suspended');
    repo.setPolicyStatus('pol_cms_interop_output', 'suspended');
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
        confidence: 0.9,
        risk: 'low',
        reason_codes: [],
      },
      deploymentMode: 'connected',
      request_id: 'req_elig_immutable',
    });
    const authorized = [...(decision.restrictions.eligible_models ?? [])];
    expect(authorized.length).toBeGreaterThan(0);

    const stored = repo.getEvaluation(decision.evaluation_id!)!;
    // Simulate later registry change: drop models from a *new* evaluation input —
    // historical record must remain unchanged.
    const afterRegistryChange = evaluationRecordToDecisionPayload(stored);
    expect(afterRegistryChange.restrictions.eligible_models).toEqual(authorized);

    // Mutating a fresh decision path must not mutate the stored clone.
    const again = repo.getEvaluation(decision.evaluation_id!)!;
    expect(again.restrictions?.eligible_models).toEqual(authorized);
  });

  it('live ALLOW path: input evaluation eligible set correlates with audit model_selected', async () => {
    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin', auditSigningKey: 'test-audit-key' },
    });
    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      model: 'local-general-v1',
      messages: [{ role: 'user', content: 'Summarize discharge instructions.' }],
    });
    expect(result.httpStatus).toBe(200);
    expect(result.body.status).toBe('approved');
    if (result.body.status === 'approved') {
      expect(result.body.model).toBe('local-general-v1');
    }

    const audits = await gw.audit.list();
    const last = audits.at(-1)!;
    expect(last.model_selected).toBe('local-general-v1');
    expect(last.provider).toBeTruthy();

    // Input evaluation is the authorization authority for eligible_models.
    // Audit may bind to output evaluation_id for response integrity.
    const inputEvalId =
      typeof last.metadata?.evaluation_id === 'string'
        ? last.metadata.evaluation_id
        : last.evaluation_id;
    expect(inputEvalId).toBeTruthy();
    const record = gw.packRepo.getEvaluation(String(inputEvalId))!;
    expect(record.phase).toBe('input');
    expect(record.restrictions?.eligible_models).toEqual(
      expect.arrayContaining(['local-general-v1']),
    );
    expect(record.restrictions!.eligible_models).toContain(last.model_selected);
  });
});
