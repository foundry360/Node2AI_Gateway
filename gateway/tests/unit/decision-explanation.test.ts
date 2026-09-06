import { describe, expect, it } from 'vitest';
import {
  InMemoryPolicyRepository,
  PackBackedEnterprisePdp,
  buildOperatorDecisionExplanation,
  buildOperatorNarrative,
  classifyDecisionPair,
  resolvePackContributions,
  simulatePolicy,
  type PackEvaluationContribution,
  type PolicyDecision,
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

function contrib(
  partial: Partial<PackEvaluationContribution> &
    Pick<PackEvaluationContribution, 'pack_id' | 'policy_id' | 'decision'>,
): PackEvaluationContribution {
  return {
    pack_version: '1.0.0',
    pack_name: partial.pack_name ?? partial.pack_id,
    policy_name: partial.policy_name ?? partial.policy_id,
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

describe('Multi-pack decision explanation — invariants', () => {
  it('Invariant 1: DENY+DENY stays AGREEMENT even when obligations differ', () => {
    const resolved = resolvePackContributions([
      contrib({
        pack_id: 'pack_a',
        policy_id: 'pol_a',
        decision: 'DENY',
        obligations: [{ code: 'LOG_GOVERNANCE_EVENT' }],
      }),
      contrib({
        pack_id: 'pack_b',
        policy_id: 'pol_b',
        decision: 'DENY',
        obligations: [{ code: 'NO_EXTERNAL_TRANSMISSION' }, { code: 'LOCAL_MODEL_ONLY' }],
      }),
    ]);
    expect(classifyDecisionPair('DENY', 'DENY')).toBe('AGREEMENT');
    expect(resolved.resolution.category).toBe('AGREEMENT');
    expect(resolved.decision).toBe('DENY');
  });

  it('Invariant 2–3: ALLOW + ALLOW with distinct controls → COMPLEMENTARY merge', () => {
    const resolved = resolvePackContributions([
      contrib({
        pack_id: 'pack_a',
        policy_id: 'pol_a',
        decision: 'ALLOW',
        obligations: [{ code: 'LOCAL_MODEL_ONLY' }],
        controls: [{ control_id: 'ctrl_a' }],
      }),
      contrib({
        pack_id: 'pack_b',
        policy_id: 'pol_b',
        decision: 'ALLOW',
        obligations: [{ code: 'LOG_GOVERNANCE_EVENT' }],
        controls: [{ control_id: 'ctrl_b' }],
      }),
    ]);
    expect(resolved.resolution.category).toBe('COMPLEMENTARY');
    expect(resolved.decision).toBe('ALLOW');
    expect(resolved.obligations.map((o) => o.code).sort()).toEqual(
      ['LOCAL_MODEL_ONLY', 'LOG_GOVERNANCE_EVENT'].sort(),
    );
  });

  it('Invariant 4–5: unresolved conflict → REVIEW; no invented precedence', () => {
    const resolved = resolvePackContributions([
      contrib({ pack_id: 'pack_a', policy_id: 'pol_a', decision: 'ALLOW' }),
      contrib({ pack_id: 'pack_b', policy_id: 'pol_b', decision: 'DENY' }),
    ]);
    expect(resolved.decision).toBe('REVIEW');
    expect(resolved.reason_codes).toContain('POLICY_CONFLICT_UNRESOLVED');
    expect(resolved.resolution.category).toBe('UNRESOLVED');
    expect(resolved.resolution.basis).toBe('UNRESOLVED_NO_PRECEDENCE');
  });

  it('Invariant 6: multi-pack provenance preserved in operator explanation', async () => {
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
        reason_codes: ['REGULATORY_APPLICABILITY:HIPAA', 'REGULATORY_APPLICABILITY:PART2'],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
    });
    expect(decision.explanation.operator).toBeDefined();
    expect(decision.explanation.resolution?.category).toBe('AGREEMENT');
    const rules = decision.explanation.provenance?.matched_rules ?? [];
    expect(rules.some((r) => r.rule_id.startsWith('HIPAA-R-'))).toBe(true);
    expect(rules.some((r) => r.rule_id.startsWith('PART2-R-'))).toBe(true);
    const op = buildOperatorDecisionExplanation(decision);
    expect(op.contributions.length).toBeGreaterThanOrEqual(2);
    expect(op.narrative.toLowerCase()).toContain('agreed');
    expect(op.narrative).not.toMatch(/HIPAA permits/i);
  });

  it('Invariant 7: operator narrative is pack-agnostic (no hard-coded regulatory prose)', () => {
    const narrative = buildOperatorNarrative(
      'REVIEW',
      {
        category: 'UNRESOLVED',
        basis: 'UNRESOLVED_NO_PRECEDENCE',
        contributing_pack_ids: ['pack_a', 'pack_b'],
        detail: 'conflict',
        contributions: [],
      },
      [
        {
          pack_id: 'pack_a',
          pack_name: 'Authority A',
          policy_id: 'pol_a',
          policy_version: 1,
          decision: 'ALLOW',
          rule_ids: [],
          obligation_ids: [],
          obligations: [],
          controls: [],
          reason_codes: [],
          has_provenance: false,
          matched_rules: [],
        },
        {
          pack_id: 'pack_b',
          pack_name: 'Authority B',
          policy_id: 'pol_b',
          policy_version: 1,
          decision: 'DENY',
          rule_ids: [],
          obligation_ids: [],
          obligations: [],
          controls: [],
          reason_codes: [],
          has_provenance: false,
          matched_rules: [],
        },
      ],
    );
    expect(narrative).toContain('Authority A evaluated to ALLOW');
    expect(narrative).toContain('Authority B evaluated to DENY');
    expect(narrative).toContain('fails safely to REVIEW');
    expect(narrative).not.toMatch(/HIPAA|Part 2|42 CFR/i);
  });
});

describe('Multi-pack decision explanation — simulate scenarios A–E', () => {
  it('A AGREEMENT via simulatePolicy fixture', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await simulatePolicy(pdp, {
      classification: 'PHI',
      action: 'write',
      requested_model: 'local-general-v1',
      regulatory_applicability: ['HIPAA', 'PART2'],
      purpose: 'treatment',
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.explanation.resolution?.category).toBe('AGREEMENT');
    expect(decision.explanation.operator?.resolution_label).toMatch(/Agreement/i);
    expect(decision.explanation.operator?.contributions.length).toBeGreaterThanOrEqual(2);
  });

  it('B COMPLEMENTARY via simulatePolicy fixture', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await simulatePolicy(pdp, {
      classification: 'PHI',
      action: 'summarize',
      requested_model: 'local-general-v1',
      regulatory_applicability: ['HIPAA', 'PART2'],
      purpose: 'treatment',
      authorization_context: 'part2_consent',
    });
    expect(decision.decision).toBe('ALLOW');
    expect(decision.explanation.resolution?.category).toBe('COMPLEMENTARY');
    expect(decision.explanation.operator?.narrative.toLowerCase()).toContain('compatible');
  });

  it('C RESTRICTIVE via simulatePolicy fixture', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await simulatePolicy(pdp, {
      classification: 'PHI',
      action: 'summarize',
      requested_model: 'local-general-v1',
      regulatory_applicability: ['HIPAA', 'PART2'],
      purpose: 'treatment',
      authorization_context: 'unknown',
    });
    expect(decision.decision).toBe('REVIEW');
    expect(decision.explanation.resolution?.category).toBe('RESTRICTIVE');
  });

  it('D UNRESOLVED conflict via simulatePolicy fixture', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await simulatePolicy(pdp, {
      classification: 'PHI',
      action: 'summarize',
      requested_model: 'local-general-v1',
      regulatory_applicability: ['HIPAA', 'PART2'],
      purpose: 'treatment',
    });
    expect(decision.decision).toBe('REVIEW');
    expect(decision.explanation.resolution?.category).toBe('UNRESOLVED');
    expect(decision.reason_codes).toContain('POLICY_CONFLICT_UNRESOLVED');
    expect(decision.explanation.operator?.basis_label.toLowerCase()).toContain('precedence');
  });

  it('E declared precedence surfaces CONFLICT + DECLARED_POLICY_PRECEDENCE in operator view', () => {
    const resolved = resolvePackContributions([
      contrib({
        pack_id: 'pack_a',
        pack_name: 'Pack A',
        policy_id: 'pol_a',
        decision: 'ALLOW',
      }),
      contrib({
        pack_id: 'pack_b',
        pack_name: 'Pack B',
        policy_id: 'pol_b',
        decision: 'DENY',
        precedence: {
          priority: 200,
          basis: 'DECLARED_POLICY_PRECEDENCE',
          overrides_pack_ids: ['pack_a'],
        },
      }),
    ]);
    expect(resolved.decision).toBe('DENY');
    expect(resolved.resolution.category).toBe('CONFLICT');
    expect(resolved.resolution.basis).toBe('DECLARED_POLICY_PRECEDENCE');

    const decision: PolicyDecision = {
      decision: resolved.decision,
      reason: resolved.reason_codes.join(', '),
      reason_codes: resolved.reason_codes,
      applicable_policies: resolved.applicable_policies,
      obligations: resolved.obligations,
      transformations: resolved.transforms,
      restrictions: {},
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
            pack_name: c.pack_name,
            pack_version: c.pack_version,
            policy_id: c.policy_id,
            policy_name: c.policy_name,
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
      evidence: { classification: 'Internal', confidence: 1, risk: 'low', reason_codes: [] },
      evaluation_id: 'eval_test',
    };
    const op = buildOperatorDecisionExplanation(decision);
    expect(op.resolution_category).toBe('CONFLICT');
    expect(op.resolution_basis).toBe('DECLARED_POLICY_PRECEDENCE');
    expect(op.narrative.toLowerCase()).toContain('declared policy precedence');
  });

  it('enriched contributions include pack_name and obligations for UI', async () => {
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
        reason_codes: ['REGULATORY_APPLICABILITY:HIPAA', 'REGULATORY_APPLICABILITY:PART2'],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
    });
    const contribs = decision.explanation.resolution?.contributions ?? [];
    expect(contribs.length).toBeGreaterThanOrEqual(2);
    expect(contribs.every((c) => c.pack_name)).toBe(true);
    expect(contribs.some((c) => (c.obligations?.length ?? 0) > 0 || c.obligation_ids.length > 0)).toBe(
      true,
    );
  });

  it('operator labels machine decision — not human final decision', async () => {
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
        reason_codes: [
          'REGULATORY_APPLICABILITY:HIPAA',
          'REGULATORY_APPLICABILITY:PART2',
        ],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
    });
    const op = buildOperatorDecisionExplanation(decision);
    expect(op.final_decision).toBe(decision.decision);
    expect(op.flow).toContain('MACHINE_DECISION');
    expect(op.flow).not.toContain('FINAL_DECISION');
    expect(op.narrative).toMatch(/Machine decision:/);
    expect(op.narrative).not.toMatch(/Final decision:/);
  });
});
