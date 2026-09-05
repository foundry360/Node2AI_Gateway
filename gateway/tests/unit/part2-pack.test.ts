import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  InMemoryPolicyRepository,
  PackBackedEnterprisePdp,
  PART2_PACK_META,
  PART2_PROVENANCE_GRAPH,
  applyPart2PackV1Input,
  applyRegulatoryOverlays,
  compilePart2Pack,
  ensureDefaultOverlayRegistry,
  listDomainPackIds,
  listRegisteredOverlayInterpreters,
  resolvePackContributions,
  type BaselineFacts,
  type InterpretedResult,
  type PackPolicyMeta,
} from '../../src/policy/enterprise/index.js';
import type { Application, User } from '../../src/identity/types.js';

ensureDefaultOverlayRegistry();

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

describe('42 CFR Part 2 — Pack #2 integrity', () => {
  it('loads, validates, and compiles Part 2 pack with provenance', () => {
    const compiled = compilePart2Pack();
    expect(compiled.pack_id).toBe('pack_42_cfr_part_2');
    expect(compiled.pack_version).toBe('1.0.0');
    expect(compiled.policies.map((p) => p.interpreter)).toEqual(
      expect.arrayContaining(['part2_pack_v1', 'part2_pack_v1_output']),
    );
    expect(compiled.rules.length).toBeGreaterThanOrEqual(5);
    expect(compiled.provenance.sources.src_42cfr2?.authority_tier).toBe(1);
    expect(compiled.provenance.sources.src_42cfr2?.legal_authority).toBe(true);
    expect(compiled.provenance.obligations['PART2-OBL-CONSENT']?.citations).toEqual(
      expect.arrayContaining(['42 CFR § 2.31', '42 CFR § 2.33']),
    );
    expect(compiled.provenance.obligations['PART2-OBL-CONFIDENTIALITY']?.citations).toContain(
      '42 CFR § 2.13',
    );
  });

  it('snapshot activates Part 2 policies and domain membership', () => {
    const repo = new InMemoryPolicyRepository();
    expect(repo.getPolicy('pol_part2_sud_records')?.interpreter).toBe('part2_pack_v1');
    expect(repo.getPolicy('pol_part2_sud_records')?.status).toBe('active');
    expect(repo.getPolicy('pol_part2_redisclosure')?.interpreter).toBe('part2_pack_v1_output');
    expect(listDomainPackIds('healthcare')).toEqual(
      expect.arrayContaining(['pack_hipaa', 'pack_42_cfr_part_2']),
    );
    expect(listRegisteredOverlayInterpreters()).toEqual(
      expect.arrayContaining(['part2_pack_v1', 'part2_pack_v1_output', 'hipaa_pack_v3']),
    );
    expect(PART2_PACK_META.pack_id).toBe('pack_42_cfr_part_2');
    expect(PART2_PROVENANCE_GRAPH.sources.src_42cfr2).toBeDefined();
  });
});

describe('42 CFR Part 2 — independent evaluation', () => {
  it('evaluates Part 2 without HIPAA and attaches exact citations', async () => {
    const repo = new InMemoryPolicyRepository();
    // Suspend HIPAA so only Part 2 regulatory overlay is active
    repo.setPolicyStatus('pol_hipaa_phi_local', 'suspended');
    repo.setPolicyStatus('pol_hipaa_release', 'suspended');
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'PART2',
        confidence: 0.99,
        risk: 'high',
        reason_codes: ['REGULATORY_APPLICABILITY:PART2'],
      },
      deploymentMode: 'connected',
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('PART2_USE_WITHOUT_CONSENT_DENIED');
    expect(decision.explanation.provenance).toBeDefined();
    const rule = decision.explanation.provenance!.matched_rules.find(
      (r) => r.rule_id === 'PART2-R-INPUT-USE-WITHOUT-CONSENT-DENY',
    );
    expect(rule).toBeDefined();
    expect(rule!.citations).toEqual(
      expect.arrayContaining(['42 CFR § 2.13', '42 CFR § 2.31', '42 CFR § 2.33']),
    );
    expect(rule!.source_ids).toContain('src_42cfr2');
    expect(decision.applicable_policies.some((p) => p.pack_id === 'pack_42_cfr_part_2')).toBe(
      true,
    );
    expect(decision.applicable_policies.every((p) => p.pack_id !== 'pack_hipaa')).toBe(true);
  });

  it('Part 2 consent path is deterministic ALLOW with controls', async () => {
    const repo = new InMemoryPolicyRepository();
    repo.setPolicyStatus('pol_hipaa_phi_local', 'suspended');
    repo.setPolicyStatus('pol_hipaa_release', 'suspended');
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'PART2',
        confidence: 0.99,
        risk: 'high',
        reason_codes: ['REGULATORY_APPLICABILITY:PART2'],
      },
      deploymentMode: 'connected',
      authorization_context: 'part2_consent',
    });
    expect(decision.decision).toBe('ALLOW');
    expect(decision.reason_codes).toContain('PART2_PROCESSING_CONTROLS_SATISFIED');
    expect(decision.obligations.some((o) => o.code === 'LOCAL_MODEL_ONLY')).toBe(true);
  });

  it('skips when Part 2 is not applicable', () => {
    const meta = compilePart2Pack().policies.find((p) => p.phase === 'input')!;
    const facts: BaselineFacts = {
      trust_level: 'trusted',
      application_status: 'active',
      application_type: 'clinical',
      allowed_operations: ['summarize'],
      allowed_models: ['local-general-v1'],
      operation: 'summarize',
      classification: 'PHI',
      deployment_mode: 'connected',
      roles: ['clinician'],
      available_models: ['local-general-v1'],
      regulatory_applicability: ['HIPAA'],
    };
    const out = applyPart2PackV1Input(baseAllow(), facts, meta);
    expect(out.matched).toContain('part2_pack_v1_skip_not_applicable');
    expect(out.decision).toBe('ALLOW');
  });
});

describe('42 CFR Part 2 — multi-pack with HIPAA', () => {
  it('A. AGREEMENT — both DENY on write without consent', async () => {
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
    expect(decision.decision).toBe('DENY');
    expect(decision.explanation.resolution?.category).toBe('AGREEMENT');
    expect(decision.explanation.resolution?.contributing_pack_ids).toEqual(
      expect.arrayContaining(['pack_hipaa', 'pack_42_cfr_part_2']),
    );
    expect(decision.explanation.resolution?.category).not.toBe('CONFLICT');
  });

  it('B. COMPLEMENTARY — both ALLOW_WITH_CONTROLS merge obligations', async () => {
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
        reason_codes: ['REGULATORY_APPLICABILITY:HIPAA', 'REGULATORY_APPLICABILITY:PART2'],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'part2_consent',
    });
    expect(decision.decision).toBe('ALLOW');
    expect(decision.explanation.resolution?.category).toBe('COMPLEMENTARY');
    expect(decision.explanation.resolution?.contributing_pack_ids).toEqual(
      expect.arrayContaining(['pack_hipaa', 'pack_42_cfr_part_2']),
    );
    expect(decision.reason_codes).toEqual(
      expect.arrayContaining([
        'HIPAA_PHI_PROCESSING_CONTROLS_SATISFIED',
        'PART2_PROCESSING_CONTROLS_SATISFIED',
      ]),
    );
    const codes = decision.obligations.map((o) => o.code);
    expect(codes).toContain('LOCAL_MODEL_ONLY');
    expect(codes).toContain('LOG_GOVERNANCE_EVENT');
  });

  it('C. RESTRICTIVE — HIPAA ALLOW vs Part 2 REVIEW (unknown consent)', async () => {
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
        reason_codes: ['REGULATORY_APPLICABILITY:HIPAA', 'REGULATORY_APPLICABILITY:PART2'],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'unknown',
    });
    expect(decision.decision).toBe('REVIEW');
    expect(decision.explanation.resolution?.category).toBe('RESTRICTIVE');
    expect(decision.reason_codes).toContain('PART2_CONSENT_EVIDENCE_INSUFFICIENT');
  });

  it('D/E. CONFLICT fixture without declared precedence → POLICY_CONFLICT_UNRESOLVED / REVIEW', async () => {
    // Architectural fixture: HIPAA permits local PHI processing; Part 2 denies use without
    // consent evidence. This exercises the generic resolver — not a claim that the statutes
    // are irreconcilable in all real-world contexts.
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
        reason_codes: ['REGULATORY_APPLICABILITY:HIPAA', 'REGULATORY_APPLICABILITY:PART2'],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      // No authorization_context → Part 2 consent absent → DENY; HIPAA still ALLOW
    });
    expect(decision.decision).toBe('REVIEW');
    expect(decision.reason_codes).toContain('POLICY_CONFLICT_UNRESOLVED');
    expect(decision.explanation.resolution?.category).toBe('UNRESOLVED');
    expect(decision.explanation.resolution?.basis).toBe('UNRESOLVED_NO_PRECEDENCE');
    expect(decision.explanation.resolution?.contributing_pack_ids).toEqual(
      expect.arrayContaining(['pack_hipaa', 'pack_42_cfr_part_2']),
    );
  });

  it('declared precedence resolves HIPAA vs Part 2 conflict without inventing universal override', () => {
    const hipaaMeta: PackPolicyMeta = {
      policy_id: 'pol_hipaa_phi_local',
      version: 3,
      pack_id: 'pack_hipaa',
      name: 'HIPAA',
      phase: 'input',
      status: 'active',
      interpreter: 'hipaa_pack_v3',
    };
    const part2Meta: PackPolicyMeta = {
      policy_id: 'pol_part2_sud_records',
      version: 1,
      pack_id: 'pack_42_cfr_part_2',
      name: 'Part 2',
      phase: 'input',
      status: 'active',
      interpreter: 'part2_pack_v1',
      precedence: {
        priority: 200,
        basis: 'DECLARED_POLICY_PRECEDENCE',
        overrides_pack_ids: ['pack_hipaa'],
      },
    };
    const facts: BaselineFacts = {
      trust_level: 'trusted',
      application_status: 'active',
      application_type: 'clinical',
      allowed_operations: ['summarize'],
      allowed_models: ['local-general-v1'],
      operation: 'summarize',
      classification: 'PHI',
      deployment_mode: 'connected',
      roles: ['clinician'],
      available_models: ['local-general-v1'],
      requested_model: 'local-general-v1',
      regulatory_applicability: ['HIPAA', 'PART2'],
      purpose: 'treatment',
    };
    const out = applyRegulatoryOverlays(baseAllow(), facts, [hipaaMeta, part2Meta]);
    expect(out.decision).toBe('DENY');
    expect(out.resolution?.resolution.basis).toBe('DECLARED_POLICY_PRECEDENCE');
    expect(out.resolution?.reason_codes).toContain('POLICY_CONFLICT_RESOLVED_BY_PRECEDENCE');
    expect(out.pack_id).toBe('pack_42_cfr_part_2');
  });

  it('multi-pack provenance preserves both HIPAA and Part 2 chains', async () => {
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
    const rules = decision.explanation.provenance?.matched_rules ?? [];
    expect(rules.some((r) => r.rule_id.startsWith('HIPAA-R-'))).toBe(true);
    expect(rules.some((r) => r.rule_id.startsWith('PART2-R-'))).toBe(true);
    const sources = decision.explanation.provenance?.sources?.map((s) => s.source_id) ?? [];
    expect(sources).toEqual(expect.arrayContaining(['src_45cfr164', 'src_42cfr2']));
    expect(decision.explanation.resolution?.contributing_pack_ids.length).toBeGreaterThanOrEqual(2);
  });
});

describe('42 CFR Part 2 — Gateway remains generic', () => {
  it('gateway/orchestrator and adapter contain no Part-2-specific branches', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const root = join(here, '../../src');
    const files = [
      join(root, 'api/orchestrator.ts'),
      join(root, 'policy/enterprise/adapter.ts'),
      join(root, 'policy/enterprise/overlay-registry.ts'),
      join(root, 'policy/enterprise/policy-resolution.ts'),
    ];
    const forbidden = /\b(Part2Pdp|Part2Gateway|Part2Conflict|if\s*\(.*Part\s*2|42_cfr_part_2\s*===|pack_42_cfr_part_2\s*===)/i;
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).not.toMatch(forbidden);
      expect(src, file).not.toMatch(/\bif\s*\([^)]*PART2/);
      expect(src, file).not.toMatch(/\bif\s*\([^)]*SUD/);
    }
  });

  it('combined decision is accepted as a generic PolicyDecision shape', async () => {
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
    });
    expect(['ALLOW', 'DENY', 'TOKENIZE', 'REDACT', 'BLOCK_OUTPUT', 'REVIEW']).toContain(
      decision.decision,
    );
    expect(decision.explanation).toBeDefined();
    expect(Array.isArray(decision.obligations)).toBe(true);
    // No pack-specific fields required by the gateway contract
    expect(decision).not.toHaveProperty('part2_decision');
    expect(decision).not.toHaveProperty('hipaa_decision');
  });
});

describe('42 CFR Part 2 — resolver fixture for unresolved taxonomy', () => {
  it('ALLOW vs DENY without precedence stays UNRESOLVED (no Part2>HIPAA invent)', () => {
    const resolved = resolvePackContributions([
      {
        pack_id: 'pack_hipaa',
        policy_id: 'pol_hipaa_phi_local',
        policy_version: 3,
        decision: 'ALLOW',
        reason_codes: ['HIPAA_ALLOW'],
        rule_ids: ['HIPAA-R-FIXTURE'],
        obligation_ids: [],
        obligations: [],
        controls: [],
        transforms: [],
        eligible_models: ['local-general-v1'],
        matched: [],
        applicable: true,
      },
      {
        pack_id: 'pack_42_cfr_part_2',
        policy_id: 'pol_part2_sud_records',
        policy_version: 1,
        decision: 'DENY',
        reason_codes: ['PART2_DENY'],
        rule_ids: ['PART2-R-FIXTURE'],
        obligation_ids: [],
        obligations: [],
        controls: [],
        transforms: [],
        eligible_models: [],
        matched: [],
        applicable: true,
      },
    ]);
    expect(resolved.decision).toBe('REVIEW');
    expect(resolved.resolution.category).toBe('UNRESOLVED');
    expect(resolved.reason_codes).toContain('POLICY_CONFLICT_UNRESOLVED');
  });
});
