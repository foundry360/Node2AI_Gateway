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

describe('Policy consequence resolution', () => {
  afterEach(() => {
    unregisterOverlayInterpreter(INT_A);
    unregisterOverlayInterpreter(INT_B_CTRL);
  });

  describe('classification matrix', () => {
    it('classifies DENY+DENY as agreement', () => {
      expect(classifyDecisionPair('DENY', 'DENY')).toBe('AGREEMENT');
      expect(classifyDecisionPair('BLOCK_OUTPUT', 'DENY')).toBe('AGREEMENT');
    });

    it('classifies ALLOW+DENY as RESTRICTIVE (consequence deny, not conflict)', () => {
      expect(classifyDecisionPair('ALLOW', 'DENY')).toBe('RESTRICTIVE');
      expect(classifyDecisionPair('DENY', 'ALLOW')).toBe('RESTRICTIVE');
    });

    it('classifies DENY+TOKENIZE/REDACT/REVIEW as RESTRICTIVE', () => {
      expect(classifyDecisionPair('DENY', 'TOKENIZE')).toBe('RESTRICTIVE');
      expect(classifyDecisionPair('DENY', 'REDACT')).toBe('RESTRICTIVE');
      expect(classifyDecisionPair('DENY', 'REVIEW')).toBe('RESTRICTIVE');
    });

    it('classifies ALLOW+TOKENIZE and ALLOW+REVIEW as RESTRICTIVE', () => {
      expect(classifyDecisionPair('ALLOW', 'TOKENIZE')).toBe('RESTRICTIVE');
      expect(classifyDecisionPair('ALLOW', 'REVIEW')).toBe('RESTRICTIVE');
      expect(classifyDecisionPair('TOKENIZE', 'REVIEW')).toBe('RESTRICTIVE');
    });

    it('classifies TOKENIZE+REDACT as agreement (same transform family)', () => {
      expect(classifyDecisionPair('TOKENIZE', 'REDACT')).toBe('AGREEMENT');
    });
  });

  describe('basic composition', () => {
    it('ALLOW + ALLOW → ALLOW; obligations union', () => {
      const resolved = resolvePackContributions([
        contrib({
          pack_id: PACK_A,
          policy_id: 'pol_a',
          decision: 'ALLOW',
          reason_codes: ['A_OK'],
          obligations: [{ code: 'LOG_GOVERNANCE_EVENT' }],
        }),
        contrib({
          pack_id: PACK_B,
          policy_id: 'pol_b',
          decision: 'ALLOW',
          reason_codes: ['B_OK'],
          obligations: [{ code: 'LOCAL_MODEL_ONLY' }],
        }),
      ]);
      expect(resolved.decision).toBe('ALLOW');
      expect(resolved.resolution.contributing_pack_ids).toEqual(
        expect.arrayContaining([PACK_A, PACK_B]),
      );
      expect(resolved.obligations.map((o) => o.code).sort()).toEqual(
        ['LOCAL_MODEL_ONLY', 'LOG_GOVERNANCE_EVENT'].sort(),
      );
    });

    it('DENY + DENY → DENY agreement', () => {
      const resolved = resolvePackContributions([
        contrib({ pack_id: PACK_A, policy_id: 'pol_a', decision: 'DENY', reason_codes: ['A_DENY'] }),
        contrib({ pack_id: PACK_B, policy_id: 'pol_b', decision: 'DENY', reason_codes: ['B_DENY'] }),
      ]);
      expect(resolved.decision).toBe('DENY');
      expect(resolved.resolution.category).toBe('AGREEMENT');
      expect(resolved.eligible_models).toEqual([]);
    });

    it('ALLOW + DENY → DENY (CONSEQUENCE_DENY); both contributions retained', () => {
      const resolved = resolvePackContributions([
        contrib({
          pack_id: PACK_A,
          policy_id: 'pol_a',
          decision: 'ALLOW',
          reason_codes: ['A_ALLOW'],
          obligations: [{ code: 'LOG_GOVERNANCE_EVENT' }],
        }),
        contrib({
          pack_id: PACK_B,
          policy_id: 'pol_b',
          decision: 'DENY',
          reason_codes: ['B_DENY'],
          obligations: [{ code: 'NO_EXTERNAL_TRANSMISSION' }],
        }),
      ]);
      expect(resolved.decision).toBe('DENY');
      expect(resolved.resolution.category).toBe('RESTRICTIVE');
      expect(resolved.resolution.basis).toBe('CONSEQUENCE_DENY');
      expect(resolved.reason_codes).toContain('RESOLUTION_CONSEQUENCE_DENY');
      expect(resolved.reason_codes).not.toContain('POLICY_CONFLICT_UNRESOLVED');
      expect(resolved.eligible_models).toEqual([]);
      expect(resolved.resolution.contributions).toHaveLength(2);
      expect(resolved.resolution.contributions.map((c) => c.decision).sort()).toEqual([
        'ALLOW',
        'DENY',
      ]);
      expect(resolved.obligations.map((o) => o.code)).toEqual(
        expect.arrayContaining(['LOG_GOVERNANCE_EVENT', 'NO_EXTERNAL_TRANSMISSION']),
      );
    });

    it('ALLOW + REVIEW → REVIEW', () => {
      const resolved = resolvePackContributions([
        contrib({ pack_id: PACK_A, policy_id: 'pol_a', decision: 'ALLOW' }),
        contrib({
          pack_id: PACK_B,
          policy_id: 'pol_b',
          decision: 'REVIEW',
          obligations: [{ code: 'REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION' }],
        }),
      ]);
      expect(resolved.decision).toBe('REVIEW');
      expect(resolved.resolution.basis).toBe('COMPOSE_RESTRICTIVE');
      expect(resolved.eligible_models).toEqual([]);
      expect(resolved.obligations.some((o) => o.code === 'REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION')).toBe(
        true,
      );
    });
  });

  describe('transform composition', () => {
    it('ALLOW + TOKENIZE → TOKENIZE; transforms union', () => {
      const resolved = resolvePackContributions([
        contrib({ pack_id: PACK_A, policy_id: 'pol_a', decision: 'ALLOW' }),
        contrib({
          pack_id: PACK_B,
          policy_id: 'pol_b',
          decision: 'TOKENIZE',
          transforms: [{ type: 'TOKENIZE', targets: ['mrn'] }],
          obligations: [{ code: 'TOKENIZE_PII' }],
        }),
      ]);
      expect(resolved.decision).toBe('TOKENIZE');
      expect(resolved.transforms).toEqual(
        expect.arrayContaining([{ type: 'TOKENIZE', targets: ['mrn'] }]),
      );
    });

    it('ALLOW + REDACT → REDACT', () => {
      const resolved = resolvePackContributions([
        contrib({ pack_id: PACK_A, policy_id: 'pol_a', decision: 'ALLOW' }),
        contrib({
          pack_id: PACK_B,
          policy_id: 'pol_b',
          decision: 'REDACT',
          transforms: [{ type: 'REDACT', targets: ['ssn'] }],
        }),
      ]);
      expect(resolved.decision).toBe('REDACT');
    });

    it('TOKENIZE + REDACT → union transforms; decision remains transform family', () => {
      const resolved = resolvePackContributions([
        contrib({
          pack_id: PACK_A,
          policy_id: 'pol_a',
          decision: 'TOKENIZE',
          transforms: [{ type: 'TOKENIZE', targets: ['mrn'] }],
        }),
        contrib({
          pack_id: PACK_B,
          policy_id: 'pol_b',
          decision: 'REDACT',
          transforms: [{ type: 'REDACT', targets: ['ssn'] }],
        }),
      ]);
      expect(['TOKENIZE', 'REDACT']).toContain(resolved.decision);
      expect(resolved.transforms).toEqual(
        expect.arrayContaining([
          { type: 'TOKENIZE', targets: ['mrn'] },
          { type: 'REDACT', targets: ['ssn'] },
        ]),
      );
    });

    it('TOKENIZE + DENY → DENY; transforms cleared; contributions retained', () => {
      const resolved = resolvePackContributions([
        contrib({
          pack_id: PACK_A,
          policy_id: 'pol_a',
          decision: 'TOKENIZE',
          transforms: [{ type: 'TOKENIZE', targets: ['mrn'] }],
        }),
        contrib({ pack_id: PACK_B, policy_id: 'pol_b', decision: 'DENY' }),
      ]);
      expect(resolved.decision).toBe('DENY');
      expect(resolved.resolution.basis).toBe('CONSEQUENCE_DENY');
      expect(resolved.transforms).toEqual([]);
      expect(resolved.resolution.contributions.map((c) => c.decision).sort()).toEqual([
        'DENY',
        'TOKENIZE',
      ]);
    });
  });

  describe('routing / model restriction', () => {
    it('ALLOW + LOCAL_MODEL_ONLY obligation unions; eligible models intersect when both non-empty', () => {
      const resolved = resolvePackContributions([
        contrib({
          pack_id: PACK_A,
          policy_id: 'pol_a',
          decision: 'ALLOW',
          eligible_models: ['local-general-v1', 'cloud-public-gpt'],
          obligations: [{ code: 'LOG_GOVERNANCE_EVENT' }],
        }),
        contrib({
          pack_id: PACK_B,
          policy_id: 'pol_b',
          decision: 'ALLOW',
          eligible_models: ['local-general-v1'],
          obligations: [{ code: 'LOCAL_MODEL_ONLY' }],
        }),
      ]);
      expect(resolved.decision).toBe('ALLOW');
      expect(resolved.eligible_models).toEqual(['local-general-v1']);
      expect(resolved.obligations.map((o) => o.code)).toContain('LOCAL_MODEL_ONLY');
    });

    it('ROUTE_LOCAL obligation + DENY → DENY (routing cannot override denial)', () => {
      const resolved = resolvePackContributions([
        contrib({
          pack_id: PACK_A,
          policy_id: 'pol_a',
          decision: 'ALLOW',
          obligations: [{ code: 'ROUTE_LOCAL' }],
          eligible_models: ['local-general-v1'],
        }),
        contrib({ pack_id: PACK_B, policy_id: 'pol_b', decision: 'DENY' }),
      ]);
      expect(resolved.decision).toBe('DENY');
      expect(resolved.eligible_models).toEqual([]);
    });
  });

  describe('approval composition', () => {
    it('ALLOW + REQUIRE_APPROVAL (via REVIEW) → REVIEW', () => {
      const resolved = resolvePackContributions([
        contrib({ pack_id: PACK_A, policy_id: 'pol_a', decision: 'ALLOW' }),
        contrib({
          pack_id: PACK_B,
          policy_id: 'pol_b',
          decision: 'REVIEW',
          obligations: [{ code: 'REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION' }],
        }),
      ]);
      expect(resolved.decision).toBe('REVIEW');
    });

    it('TOKENIZE + REQUIRE_APPROVAL (REVIEW) → REVIEW', () => {
      const resolved = resolvePackContributions([
        contrib({
          pack_id: PACK_A,
          policy_id: 'pol_a',
          decision: 'TOKENIZE',
          transforms: [{ type: 'TOKENIZE', targets: ['mrn'] }],
        }),
        contrib({
          pack_id: PACK_B,
          policy_id: 'pol_b',
          decision: 'REVIEW',
          obligations: [{ code: 'REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION' }],
        }),
      ]);
      expect(resolved.decision).toBe('REVIEW');
      expect(resolved.transforms.length).toBeGreaterThan(0);
    });

    it('DENY + REQUIRE_APPROVAL obligation → DENY; approval obligation stripped', () => {
      const resolved = resolvePackContributions([
        contrib({
          pack_id: PACK_A,
          policy_id: 'pol_a',
          decision: 'ALLOW',
          obligations: [{ code: 'REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION' }],
        }),
        contrib({ pack_id: PACK_B, policy_id: 'pol_b', decision: 'DENY' }),
      ]);
      expect(resolved.decision).toBe('DENY');
      expect(
        resolved.obligations.some((o) => o.code === 'REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION'),
      ).toBe(false);
    });

    it('DENY + REVIEW → DENY (approval cannot weaken denial)', () => {
      const resolved = resolvePackContributions([
        contrib({
          pack_id: PACK_A,
          policy_id: 'pol_a',
          decision: 'REVIEW',
          obligations: [{ code: 'REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION' }],
        }),
        contrib({ pack_id: PACK_B, policy_id: 'pol_b', decision: 'DENY' }),
      ]);
      expect(resolved.decision).toBe('DENY');
      expect(resolved.resolution.basis).toBe('CONSEQUENCE_DENY');
      expect(
        resolved.obligations.some((o) => o.code === 'REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION'),
      ).toBe(false);
    });
  });

  describe('applicability', () => {
    it('non-applicable contribution is ignored', () => {
      const resolved = resolvePackContributions([
        contrib({ pack_id: PACK_A, policy_id: 'pol_a', decision: 'DENY' }),
        contrib({
          pack_id: PACK_B,
          policy_id: 'pol_b',
          decision: 'ALLOW',
          applicable: false,
        }),
      ]);
      expect(resolved.decision).toBe('DENY');
      expect(resolved.resolution.basis).toBe('SINGLE_CONTRIBUTION');
      expect(resolved.resolution.contributing_pack_ids).toEqual([PACK_A]);
    });

    it('multiple non-applicable → baseline-only ALLOW path', () => {
      const resolved = resolvePackContributions([
        contrib({
          pack_id: PACK_A,
          policy_id: 'pol_a',
          decision: 'ALLOW',
          applicable: false,
        }),
        contrib({
          pack_id: PACK_B,
          policy_id: 'pol_b',
          decision: 'DENY',
          applicable: false,
        }),
      ]);
      expect(resolved.resolution.basis).toBe('BASELINE_ONLY');
      expect(resolved.decision).toBe('ALLOW');
    });
  });

  describe('evidence / precedence / authority', () => {
    it('Complementary controls merge without conflict', () => {
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
    });

    it('Declared precedence is not required for DENY+ALLOW; DENY still wins by consequence', () => {
      const resolved = resolvePackContributions([
        contrib({
          pack_id: PACK_A,
          policy_id: 'pol_a',
          decision: 'ALLOW',
          precedence: {
            priority: 999,
            basis: 'DECLARED_POLICY_PRECEDENCE',
            overrides_pack_ids: [PACK_B],
          },
        }),
        contrib({
          pack_id: PACK_B,
          policy_id: 'pol_b',
          decision: 'DENY',
        }),
      ]);
      // Permissive declared precedence must not weaken explicit DENY.
      expect(resolved.decision).toBe('DENY');
      expect(resolved.resolution.basis).toBe('CONSEQUENCE_DENY');
      expect(resolved.reason_codes).not.toContain('POLICY_CONFLICT_RESOLVED_BY_PRECEDENCE');
    });

    it('Authority tier does not override DENY consequence', () => {
      const highTierAllow = contrib({
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
      const resolved = resolvePackContributions([highTierAllow, denyLow]);
      expect(resolved.decision).toBe('DENY');
      expect(resolved.resolution.basis).toBe('CONSEQUENCE_DENY');
      expect(resolved.resolution.contributions).toHaveLength(2);
    });

    it('Multi-pack provenance retains both chains under DENY consequence', () => {
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

      const resolved = resolvePackContributions([
        contrib({
          pack_id: PACK_A,
          policy_id: 'pol_a',
          decision: 'ALLOW',
          provenance: appendRuleProvenance(
            undefined,
            { rule_id: 'MOCK-R-A', obligation_ids: ['OBL-A'], sources: ['src_a'] },
            graphA,
          ),
        }),
        contrib({
          pack_id: PACK_B,
          policy_id: 'pol_b',
          decision: 'DENY',
          provenance: appendRuleProvenance(
            undefined,
            { rule_id: 'MOCK-R-B', obligation_ids: ['OBL-B'], sources: ['src_b'] },
            graphB,
          ),
        }),
      ]);
      const rules = resolved.provenance?.matched_rules ?? [];
      expect(rules.some((r) => r.rule_id === 'MOCK-R-A')).toBe(true);
      expect(rules.some((r) => r.rule_id === 'MOCK-R-B')).toBe(true);
      expect(resolved.decision).toBe('DENY');
    });
  });

  it('HIPAA write REVIEW regression unchanged', async () => {
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
      authorization_context: 'authorized',
    });
    expect(deny.decision).toBe('REVIEW');
    expect(deny.reason_codes).toContain('HIPAA_PHI_WRITE_REQUIRES_APPROVAL');
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
  });
});
