import { afterEach, describe, expect, it } from 'vitest';
import {
  InMemoryPolicyRepository,
  PackBackedEnterprisePdp,
  appendRuleProvenance,
  applyRegulatoryOverlays,
  classifyDecisionPair,
  emptyProvenanceGraph,
  ensureDefaultOverlayRegistry,
  registerOverlayInterpreter,
  resolvePackContributions,
  unregisterOverlayInterpreter,
  type BaselineFacts,
  type InterpretedResult,
  type PackEvaluationContribution,
  type PackPolicyMeta,
} from '../../src/policy/enterprise/index.js';
import type { Application, User } from '../../src/identity/types.js';

ensureDefaultOverlayRegistry();

const PACK_A = 'pack_mock_res_a';
const PACK_B = 'pack_mock_res_b';
const INT_A = 'mock_res_allow_v1';
const INT_B_CTRL = 'mock_res_allow_ctrl_v1';

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
  allowed_models: ['local-general-v1'],
  allowed_datasets: [],
  allowed_operations: ['summarize', 'write'],
};

function baseAllow(): InterpretedResult {
  return {
    decision: 'ALLOW',
    reason_codes: ['BASELINE_ALLOW'],
    eligible_models: ['local-general-v1'],
    transforms: [],
    obligations: [],
    policy_id: 'pol_baseline_input',
    policy_version: 2,
    pack_id: 'pack_enterprise_baseline',
    matched: ['baseline'],
  };
}

function facts(): BaselineFacts {
  return {
    trust_level: 'trusted',
    application_status: 'active',
    application_type: 'clinical',
    allowed_operations: ['summarize'],
    allowed_models: ['local-general-v1'],
    operation: 'summarize',
    classification: 'Internal',
    deployment_mode: 'connected',
    roles: ['clinician'],
    available_models: ['local-general-v1'],
    regulatory_applicability: ['MOCK_RES'],
  };
}

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

describe('Healthcare Policy Resolution v0.1', () => {
  afterEach(() => {
    unregisterOverlayInterpreter(INT_A);
    unregisterOverlayInterpreter(INT_B_CTRL);
  });

  it('classifies DENY+DENY as agreement and ALLOW+DENY as conflict', () => {
    expect(classifyDecisionPair('DENY', 'DENY')).toBe('AGREEMENT');
    expect(classifyDecisionPair('ALLOW', 'DENY')).toBe('CONFLICT');
    expect(classifyDecisionPair('ALLOW', 'TOKENIZE')).toBe('RESTRICTIVE');
  });

  it('1. Multiple applicable packs contribute to one evaluation', () => {
    const resolved = resolvePackContributions([
      contrib({
        pack_id: PACK_A,
        policy_id: 'pol_a',
        decision: 'ALLOW',
        reason_codes: ['A_OK'],
        obligations: [{ code: 'LOG_GOVERNANCE_EVENT' }],
        matched: ['pack_a'],
      }),
      contrib({
        pack_id: PACK_B,
        policy_id: 'pol_b',
        decision: 'ALLOW',
        reason_codes: ['B_OK'],
        obligations: [{ code: 'LOCAL_MODEL_ONLY' }],
        matched: ['pack_b'],
      }),
    ]);
    expect(resolved.resolution.contributing_pack_ids).toEqual(
      expect.arrayContaining([PACK_A, PACK_B]),
    );
    expect(resolved.applicable_policies).toHaveLength(2);
    expect(resolved.decision).toBe('ALLOW');
  });

  it('2. Complementary controls merge without conflict', () => {
    const resolved = resolvePackContributions([
      contrib({
        pack_id: PACK_A,
        policy_id: 'pol_a',
        decision: 'ALLOW',
        controls: [{ control_id: 'ctrl_x', control_type: 'ENIGMA_IMPLEMENTATION_OPTION' }],
        obligations: [{ code: 'TOKENIZE_PII' }],
      }),
      contrib({
        pack_id: PACK_B,
        policy_id: 'pol_b',
        decision: 'ALLOW',
        controls: [{ control_id: 'ctrl_y', control_type: 'ENIGMA_IMPLEMENTATION_OPTION' }],
        obligations: [{ code: 'APPROVED_MODEL_ONLY' }],
      }),
    ]);
    expect(resolved.resolution.category).toBe('COMPLEMENTARY');
    expect(resolved.decision).toBe('ALLOW');
    expect(resolved.obligations.map((o) => o.code).sort()).toEqual(
      ['APPROVED_MODEL_ONLY', 'TOKENIZE_PII'].sort(),
    );
    expect(resolved.conflicts.every((c) => c.resolution === 'compose')).toBe(true);
  });

  it('3. Agreement on DENY is not a conflict', () => {
    const resolved = resolvePackContributions([
      contrib({
        pack_id: PACK_A,
        policy_id: 'pol_a',
        decision: 'DENY',
        reason_codes: ['A_DENY'],
        rule_ids: ['MOCK-R-A'],
      }),
      contrib({
        pack_id: PACK_B,
        policy_id: 'pol_b',
        decision: 'DENY',
        reason_codes: ['B_DENY'],
        rule_ids: ['MOCK-R-B'],
      }),
    ]);
    expect(resolved.decision).toBe('DENY');
    expect(resolved.resolution.category).toBe('AGREEMENT');
    expect(resolved.conflicts).toHaveLength(0);
  });

  it('4. ALLOW vs DENY produces CONFLICT', () => {
    const resolved = resolvePackContributions([
      contrib({ pack_id: PACK_A, policy_id: 'pol_a', decision: 'ALLOW' }),
      contrib({ pack_id: PACK_B, policy_id: 'pol_b', decision: 'DENY' }),
    ]);
    expect(resolved.resolution.category).toBe('UNRESOLVED');
    expect(resolved.decision).toBe('REVIEW');
    expect(resolved.reason_codes).toContain('POLICY_CONFLICT_UNRESOLVED');
    expect(resolved.conflicts.some((c) => c.category === 'CONFLICT')).toBe(true);
  });

  it('5. Declared precedence resolves a conflict', () => {
    const resolved = resolvePackContributions([
      contrib({
        pack_id: PACK_A,
        policy_id: 'pol_a',
        decision: 'ALLOW',
        reason_codes: ['A_ALLOW'],
      }),
      contrib({
        pack_id: PACK_B,
        policy_id: 'pol_b',
        decision: 'DENY',
        reason_codes: ['B_DENY'],
        precedence: {
          priority: 200,
          basis: 'DECLARED_POLICY_PRECEDENCE',
          overrides_pack_ids: [PACK_A],
        },
      }),
    ]);
    expect(resolved.decision).toBe('DENY');
    expect(resolved.resolution.category).toBe('CONFLICT');
    expect(resolved.resolution.basis).toBe('DECLARED_POLICY_PRECEDENCE');
    expect(resolved.pack_id).toBe(PACK_B);
    expect(resolved.reason_codes).toContain('POLICY_CONFLICT_RESOLVED_BY_PRECEDENCE');
    expect(resolved.conflicts.some((c) => c.resolution === 'precedence')).toBe(true);
  });

  it('6. Unresolved conflict without precedence → REVIEW', () => {
    const resolved = resolvePackContributions([
      contrib({ pack_id: PACK_A, policy_id: 'pol_a', decision: 'ALLOW' }),
      contrib({
        pack_id: PACK_B,
        policy_id: 'pol_b',
        decision: 'DENY',
        precedence: { priority: 50, basis: 'PACK_PRIORITY' },
      }),
    ]);
    expect(resolved.decision).toBe('REVIEW');
    expect(resolved.resolution.category).toBe('UNRESOLVED');
  });

  it('7. Multi-pack provenance retains both chains', () => {
    const graphA = emptyProvenanceGraph();
    graphA.sources.src_a = {
      source_id: 'src_a',
      authority: 'Mock A',
      authority_tier: 2,
      authority_type: 'OFFICIAL_REGULATORY_GUIDANCE',
      legal_authority: false,
      citation: 'MOCK-A-1',
    };
    graphA.obligations['OBL-A'] = {
      obligation_id: 'OBL-A',
      citations: ['MOCK-A-1 §1'],
      source_ids: ['src_a'],
      authority_tier: 2,
    };
    const graphB = emptyProvenanceGraph();
    graphB.sources.src_b = {
      source_id: 'src_b',
      authority: 'Mock B',
      authority_tier: 2,
      authority_type: 'OFFICIAL_REGULATORY_GUIDANCE',
      legal_authority: false,
      citation: 'MOCK-B-1',
    };
    graphB.obligations['OBL-B'] = {
      obligation_id: 'OBL-B',
      citations: ['MOCK-B-1 §1'],
      source_ids: ['src_b'],
      authority_tier: 2,
    };

    const provA = appendRuleProvenance(
      undefined,
      { rule_id: 'MOCK-R-A', obligation_ids: ['OBL-A'], sources: ['src_a'] },
      graphA,
    );
    const provB = appendRuleProvenance(
      undefined,
      { rule_id: 'MOCK-R-B', obligation_ids: ['OBL-B'], sources: ['src_b'] },
      graphB,
    );

    const resolved = resolvePackContributions([
      contrib({
        pack_id: PACK_A,
        policy_id: 'pol_a',
        decision: 'ALLOW',
        provenance: provA,
        rule_ids: ['MOCK-R-A'],
        obligation_ids: ['OBL-A'],
      }),
      contrib({
        pack_id: PACK_B,
        policy_id: 'pol_b',
        decision: 'ALLOW',
        provenance: provB,
        rule_ids: ['MOCK-R-B'],
        obligation_ids: ['OBL-B'],
      }),
    ]);

    const rules = resolved.provenance?.matched_rules ?? [];
    expect(rules.some((r) => r.rule_id === 'MOCK-R-A')).toBe(true);
    expect(rules.some((r) => r.rule_id === 'MOCK-R-B')).toBe(true);
    expect(rules.find((r) => r.rule_id === 'MOCK-R-A')?.citations).toContain('MOCK-A-1 §1');
    expect(rules.find((r) => r.rule_id === 'MOCK-R-B')?.citations).toContain('MOCK-B-1 §1');
  });

  it('8. Authority tier does not automatically become precedence', () => {
    const highTier = contrib({
      pack_id: PACK_A,
      policy_id: 'pol_a',
      decision: 'ALLOW',
      provenance: {
        matched_rules: [
          {
            rule_id: 'R-A',
            obligation_ids: ['O-A'],
            citations: ['TIER1-CITE'],
            source_ids: ['src_tier1'],
            authority_tier: 1,
            legal_authority: true,
          },
        ],
        sources: [
          {
            source_id: 'src_tier1',
            authority: 'Tier-1 Authority',
            authority_tier: 1,
            authority_type: 'PRIMARY_REGULATORY',
            legal_authority: true,
          },
        ],
      },
    });
    const denyLow = contrib({
      pack_id: PACK_B,
      policy_id: 'pol_b',
      decision: 'DENY',
      provenance: {
        matched_rules: [
          {
            rule_id: 'R-B',
            obligation_ids: ['O-B'],
            citations: ['TIER4-CITE'],
            source_ids: ['src_tier4'],
            authority_tier: 4,
            legal_authority: false,
          },
        ],
      },
    });
    const resolved = resolvePackContributions([highTier, denyLow]);
    expect(resolved.decision).toBe('REVIEW');
    expect(resolved.resolution.basis).toBe('UNRESOLVED_NO_PRECEDENCE');
    expect(resolved.reason_codes).toContain('POLICY_CONFLICT_UNRESOLVED');
    // Tier-1 ALLOW did not auto-override DENY
    expect(resolved.resolution.category).toBe('UNRESOLVED');
  });

  it('9. HIPAA regression — write DENY + provenance unchanged', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const deny = await pdp.evaluateLegacyRequest({
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
    });
    expect(deny.decision).toBe('REVIEW');
    expect(deny.reason_codes).toContain('HIPAA_PHI_WRITE_REQUIRES_APPROVAL');
    expect(deny.explanation.provenance?.matched_rules[0]?.citations).toEqual(
      expect.arrayContaining(['45 CFR 164.312(c)']),
    );
  });

  it('registry path: complementary mock packs via applyRegulatoryOverlays', () => {
    registerOverlayInterpreter(INT_A, (current, _facts, meta) => {
      const graph = emptyProvenanceGraph();
      graph.sources.src_a = {
        source_id: 'src_a',
        authority: 'Mock A',
        authority_tier: 2,
        authority_type: 'OFFICIAL_REGULATORY_GUIDANCE',
        legal_authority: false,
      };
      graph.obligations['OBL-A'] = {
        obligation_id: 'OBL-A',
        citations: ['MOCK-A'],
        source_ids: ['src_a'],
      };
      return {
        ...current,
        decision: 'ALLOW',
        obligations: [...current.obligations, { code: 'TOKENIZE_PII' }],
        matched: [...current.matched, 'mock_a_applied', 'MOCK-R-A'],
        pack_id: meta.pack_id,
        policy_id: meta.policy_id,
        policy_version: meta.version,
        provenance: appendRuleProvenance(
          current.provenance,
          {
            rule_id: 'MOCK-R-A',
            obligation_ids: ['OBL-A'],
            sources: ['src_a'],
            control_ids: ['ctrl_x'],
          },
          graph,
          ['TOKENIZE_PII'],
        ),
      };
    });
    registerOverlayInterpreter(INT_B_CTRL, (current, _facts, meta) => ({
      ...current,
      decision: 'ALLOW',
      obligations: [...current.obligations, { code: 'APPROVED_MODEL_ONLY' }],
      matched: [...current.matched, 'mock_b_applied', 'MOCK-R-B'],
      pack_id: meta.pack_id,
      policy_id: meta.policy_id,
      policy_version: meta.version,
      provenance: {
        matched_rules: [
          ...(current.provenance?.matched_rules ?? []),
          {
            rule_id: 'MOCK-R-B',
            obligation_ids: ['OBL-B'],
            citations: ['MOCK-B'],
            source_ids: ['src_b'],
          },
        ],
        controls: [
          ...(current.provenance?.controls ?? []),
          { control_id: 'ctrl_y', control_type: 'ENIGMA_IMPLEMENTATION_OPTION' },
        ],
      },
    }));

    const overlays: PackPolicyMeta[] = [
      {
        policy_id: 'pol_mock_a',
        version: 1,
        pack_id: PACK_A,
        name: 'Mock A',
        phase: 'input',
        status: 'active',
        interpreter: INT_A,
      },
      {
        policy_id: 'pol_mock_b',
        version: 1,
        pack_id: PACK_B,
        name: 'Mock B',
        phase: 'input',
        status: 'active',
        interpreter: INT_B_CTRL,
      },
    ];

    const out = applyRegulatoryOverlays(baseAllow(), facts(), overlays);
    expect(out.decision).toBe('ALLOW');
    expect(out.obligations.map((o) => o.code)).toEqual(
      expect.arrayContaining(['TOKENIZE_PII', 'APPROVED_MODEL_ONLY']),
    );
    expect(out.resolution?.resolution.category).toBe('COMPLEMENTARY');
    expect(out.provenance?.matched_rules.some((r) => r.rule_id === 'MOCK-R-A')).toBe(true);
    expect(out.provenance?.matched_rules.some((r) => r.rule_id === 'MOCK-R-B')).toBe(true);
  });
});
