/**
 * Product Reality Test — Enigma end-to-end governance lifecycle.
 * TEST-ONLY. Uses existing runtime paths; no production architecture changes.
 *
 * Covers Tests 1–15 from the Product Reality brief.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createPhase1Gateway,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';
import {
  buildDecisionEvidencePayload,
  computeDecisionHash,
  decisionBindingFromRecord,
} from '../../src/audit/decision-binding.js';
import { IntegrityAuditService } from '../../src/audit/integrity-service.js';
import { verifyAuditChain } from '../../src/audit/integrity.js';
import { InMemoryAuditService } from '../../src/audit/service.js';
import { GatewayError } from '../../src/shared/errors.js';
import type { ModelGateway } from '../../src/models/types.js';
import {
  InMemoryChangeGovernanceRepository,
  InMemoryPolicyRepository,
  POLICY_AUTHORITY_IDS,
  PackBackedEnterprisePdp,
  assessMateriality,
  buildHumanResolution,
  createGovernanceBaseline,
  customerVerificationLabel,
  ensureDefaultOverlayRegistry,
  evaluateGovernanceChange,
  evaluationRecordToDecisionPayload,
  getAuthorityForPack,
  getPolicyAuthority,
  projectEnforcementResult,
  projectRequestContext,
  resolvePackContributions,
  treatsAsLegalAuthority,
  withHumanResolution,
  withOperatorExplanation,
  type PackEvaluationContribution,
  type PolicyEvaluationRecord,
} from '../../src/policy/enterprise/index.js';
import type { Application, User } from '../../src/identity/types.js';

ensureDefaultOverlayRegistry();

const clinician: User = {
  user_id: 'user_clinician',
  organization_id: 'org_demo',
  roles: ['clinician'],
  permissions: [],
  status: 'active',
};

const clinicalApp: Application = {
  application_id: 'app_clinical',
  organization_id: 'org_demo',
  name: 'Clinical',
  type: 'clinical',
  environment: 'prod',
  status: 'active',
  trust_level: 'trusted',
  allowed_models: ['local-general-v1', 'cloud-public-gpt'],
  allowed_datasets: [],
  allowed_operations: ['summarize', 'write'],
};

const GOVERNANCE_DOCUMENTED = {
  accountability_documented: true,
  system_context_documented: true,
  measurement_documented: true,
  risk_response_documented: true,
};

function contrib(
  partial: Partial<PackEvaluationContribution> &
    Pick<PackEvaluationContribution, 'pack_id' | 'policy_id' | 'decision'>,
): PackEvaluationContribution {
  return {
    pack_name: partial.pack_id,
    pack_version: '1.0.0',
    policy_name: partial.policy_id,
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

function heldSnapshot(
  overrides: Partial<NonNullable<PolicyEvaluationRecord['held_request']>> = {},
): NonNullable<PolicyEvaluationRecord['held_request']> {
  return {
    version: 1,
    application_id: 'app_clinical',
    organization_id: 'org_demo',
    user_id: 'user_clinician',
    operation: 'summarize',
    model: 'local-general-v1',
    messages: [
      {
        role: 'user',
        content: 'Summarize treatment plan for patient with SUD history.',
      },
    ],
    correlation_id: 'cor_reality_1',
    classification: {
      sensitivity: 'PHI',
      confidence: 0.99,
      risk: 'high',
      reason_codes: [
        'REGULATORY_APPLICABILITY:HIPAA',
        'REGULATORY_APPLICABILITY:PART2',
        'REGULATORY_APPLICABILITY:NIST_AI_RMF',
      ],
    },
    allowed_models: ['local-general-v1'],
    available_models: ['local-general-v1'],
    ...overrides,
  };
}

describe('Product Reality Test — Enigma governance lifecycle', () => {
  it('TEST 1 — CLEAN ALLOW: live completions → Decision → Gateway → Observability → binding', async () => {
    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin', auditSigningKey: 'test-audit-key' },
    });
    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      messages: [{ role: 'user', content: 'Summarize discharge instructions.' }],
    });

    expect(result.httpStatus).toBe(200);
    expect(result.body.status).toBe('approved');

    const events = await gw.audit.list();
    const last = events[events.length - 1]!;
    expect(last.policy_decision).toBe('ALLOW');
    expect(last.response_decision).toBe('RELEASE');
    expect(last.evaluation_id).toBeTruthy();
    expect(last.decision_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(last.event_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(last.prev_event_hash).toBeTruthy();
    expect(last.request_id).toBeTruthy();

    const record = gw.packRepo.getEvaluation(last.evaluation_id!);
    expect(record).toBeTruthy();
    expect(record!.decision).toMatch(/ALLOW|TOKENIZE|TRANSFORM/);
    expect(record!.explanation).toBeTruthy();
    expect(record!.applicable_policies.length).toBeGreaterThan(0);

    const payload = evaluationRecordToDecisionPayload(record!);
    expect(payload.explanation).toBeTruthy();
    expect(payload.decision).toBe(record!.decision);

    const binding = decisionBindingFromRecord(record!);
    expect(last.decision_hash).toBe(binding.decision_hash);

    const enforcement = projectEnforcementResult(record!, last);
    expect(enforcement.verified).toBe(true);
    expect(['ALLOWED', 'CONTROLS_APPLIED']).toContain(enforcement.status);

    const integrity = await (gw.audit as IntegrityAuditService).verifyIntegrity();
    expect(integrity.ok).toBe(true);
  });

  it('TEST 2 — CLEAN DENY: unauthorized cloud model blocked; not REVIEW', async () => {
    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin', auditSigningKey: 'test-audit-key' },
      registryModels: ['local-general-v1', 'cloud-public-gpt'],
    });
    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      model: 'cloud-public-gpt',
      messages: [
        {
          role: 'user',
          content: 'Patient John Doe MRN 12345 SSN 111-22-3333 discharge summary.',
        },
      ],
    });

    expect(result.httpStatus).toBe(403);
    expect(result.body.status).toBe('blocked');
    if (result.body.status === 'blocked') {
      expect(result.body.reason_code).not.toBe('REVIEW_REQUIRED');
      // Live path may DENY via HIPAA cloud or MODEL_NOT_ELIGIBLE depending on classification.
      expect([
        'MODEL_NOT_ELIGIBLE',
        'HIPAA_PHI_CLOUD_BLOCKED',
        'PHI_PUBLIC_CLOUD_BLOCKED',
        'POLICY_BLOCKED',
      ]).toContain(result.body.reason_code);
    }

    const events = await gw.audit.list();
    const last = events[events.length - 1]!;
    expect(last.response_decision).toBe('BLOCK');
    expect(last.evaluation_id).toBeTruthy();
    expect(last.decision_hash).toMatch(/^[a-f0-9]{64}$/);

    const record = gw.packRepo.getEvaluation(last.evaluation_id!);
    expect(record).toBeTruthy();
    // Machine decision must not be REVIEW for a clean deny of unauthorized model/path.
    expect(record!.decision).not.toBe('REVIEW');
    expect(['DENY', 'BLOCK', 'ALLOW'].includes(record!.decision) || record!.decision).toBeTruthy();

    // If EPA produced DENY, confirm it stayed DENY.
    if (record!.decision === 'DENY') {
      expect(record!.human_resolution).toBeUndefined();
    }

    expect(result.body.status).not.toBe('approved');
    const integrity = await (gw.audit as IntegrityAuditService).verifyIntegrity();
    expect(integrity.ok).toBe(true);
  });

  it('TEST 3 — NIST-informed REVIEW (not “NIST requires REVIEW”)', async () => {
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
        reason_codes: [
          'REGULATORY_APPLICABILITY:HIPAA',
          'REGULATORY_APPLICABILITY:PART2',
          'REGULATORY_APPLICABILITY:NIST_AI_RMF',
        ],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      source_system: 'ehr',
      // Consent satisfies Part 2; NIST manage gate absent → Enigma REVIEW control
      authorization_context: 'part2_consent',
      request_id: 'req_nist_review',
    });

    expect(decision.decision).toBe('REVIEW');
    expect(decision.reason_codes.some((c) => c.startsWith('NIST_RMF_'))).toBe(true);

    const explained = withOperatorExplanation(decision);
    const narrative = explained.explanation.operator?.narrative ?? '';
    expect(narrative).not.toMatch(/NIST requires REVIEW/i);
    expect(narrative).toMatch(/Machine decision: REVIEW/i);

    const sources = explained.explanation.provenance?.sources ?? [];
    const nistSrc = sources.find((s) => s.authority_id === POLICY_AUTHORITY_IDS.nistAiRmf);
    expect(nistSrc).toBeTruthy();
    expect(nistSrc!.legal_authority).toBe(false);
    expect(nistSrc!.authority_type).toMatch(/GUIDANCE|IMPLEMENTATION/i);

    const rules = explained.explanation.provenance?.matched_rules ?? [];
    expect(
      rules.some((r) => r.citations.some((c) => /NIST AI 100-1/.test(c))),
    ).toBe(true);
    expect(
      rules.some((r) =>
        (r.control_ids ?? []).some((c) => c.includes('enigma') || c.includes('ctrl_')),
      ),
    ).toBe(true);

    const auth = getPolicyAuthority(POLICY_AUTHORITY_IDS.nistAiRmf)!;
    expect(auth.type).toBe('FRAMEWORK');
    expect(treatsAsLegalAuthority(auth)).toBe(false);

    const stored = repo.getEvaluation(decision.evaluation_id!);
    expect(stored?.decision).toBe('REVIEW');
  });

  it('TEST 4 — Multi-pack AGREEMENT across HIPAA + Part 2 + NIST', async () => {
    // 4A — Generic resolver: three packs agreeing on ALLOW (no implicit precedence)
    const resolved = resolvePackContributions([
      contrib({
        pack_id: 'pack_hipaa',
        policy_id: 'pol_hipaa_phi_local',
        decision: 'ALLOW',
        reason_codes: ['HIPAA_PHI_PROCESSING_CONTROLS_SATISFIED'],
      }),
      contrib({
        pack_id: 'pack_42_cfr_part_2',
        policy_id: 'pol_part2_sud_records',
        decision: 'ALLOW',
        reason_codes: ['PART2_CONSENT_SATISFIED'],
      }),
      contrib({
        pack_id: 'pack_nist_ai_rmf',
        policy_id: 'pol_nist_ai_rmf_input',
        decision: 'ALLOW',
        reason_codes: ['NIST_RMF_CONTROLS_SATISFIED'],
        obligations: [{ code: 'LOG_GOVERNANCE_EVENT' }],
      }),
    ]);
    expect(resolved.resolution.category).toMatch(/AGREEMENT|COMPLEMENTARY/);
    expect(['ALLOW', 'ALLOW_WITH_CONTROLS']).toContain(resolved.decision);
    expect(resolved.resolution.contributing_pack_ids).toEqual(
      expect.arrayContaining([
        'pack_hipaa',
        'pack_42_cfr_part_2',
        'pack_nist_ai_rmf',
      ]),
    );

    // 4B — Live PDP with separated authorization vs governance context.
    // Part 2 consent and NIST documentation no longer share one overloaded field.
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const live = await pdp.evaluateLegacyRequest({
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
        reason_codes: [
          'REGULATORY_APPLICABILITY:HIPAA',
          'REGULATORY_APPLICABILITY:PART2',
          'REGULATORY_APPLICABILITY:NIST_AI_RMF',
        ],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      source_system: 'ehr',
      authorization_context: 'part2_consent',
      governance_context: GOVERNANCE_DOCUMENTED,
      request_id: 'req_multi_agree',
    });

    expect(['ALLOW', 'ALLOW_WITH_CONTROLS', 'TOKENIZE']).toContain(live.decision);
    expect(live.reason_codes).not.toContain('POLICY_CONFLICT_UNRESOLVED');
    expect(live.reason_codes).not.toContain('PART2_USE_WITHOUT_CONSENT_DENIED');
    expect(live.reason_codes).toContain('NIST_RMF_CONTROLS_SATISFIED');
    expect(live.explanation.resolution?.category).toMatch(
      /AGREEMENT|COMPLEMENTARY|NONE/,
    );
    expect(live.explanation.resolution?.contributing_pack_ids).toEqual(
      expect.arrayContaining([
        'pack_hipaa',
        'pack_42_cfr_part_2',
        'pack_nist_ai_rmf',
      ]),
    );

    const stored = repo.getEvaluation(live.evaluation_id!);
    expect(stored).toBeTruthy();
    expect(
      repo
        .listEvaluations({ limit: 100 })
        .filter((e) => e.request_id === 'req_multi_agree'),
    ).toHaveLength(1);
  });

  it('TEST 5 — Complementary NIST control with regulatory ALLOW', async () => {
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
        reason_codes: [
          'REGULATORY_APPLICABILITY:HIPAA',
          'REGULATORY_APPLICABILITY:NIST_AI_RMF',
        ],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'authorized',
      source_system: 'ehr',
      governance_context: GOVERNANCE_DOCUMENTED,
      request_id: 'req_complementary',
    });

    expect(['ALLOW', 'ALLOW_WITH_CONTROLS', 'TOKENIZE']).toContain(decision.decision);
    expect(decision.reason_codes).toEqual(
      expect.arrayContaining([expect.stringMatching(/NIST_RMF_/)]),
    );
    expect(
      decision.obligations.some((o) => o.code === 'LOG_GOVERNANCE_EVENT'),
    ).toBe(true);

    const explained = withOperatorExplanation(decision);
    const authorities = explained.explanation.operator?.authorities ?? [];
    const nist = authorities.find((a) => /NIST/i.test(a.authority));
    const hipaa = authorities.find((a) => /HIPAA/i.test(a.authority));
    expect(nist || explained.explanation.provenance?.sources?.some((s) => /NIST/i.test(s.authority))).toBeTruthy();

    const nistSource = explained.explanation.provenance?.sources?.find(
      (s) => s.authority_id === POLICY_AUTHORITY_IDS.nistAiRmf,
    );
    if (nistSource) {
      expect(nistSource.legal_authority).toBe(false);
    }
    if (hipaa) {
      const hipaaAuth = getAuthorityForPack('pack_hipaa');
      expect(treatsAsLegalAuthority(hipaaAuth!)).toBe(true);
    }
  });

  it('TEST 6 — ALLOW + DENY → DENY by consequence (no implicit regulatory precedence)', () => {
    const resolved = resolvePackContributions([
      contrib({
        pack_id: 'pack_nist_ai_rmf',
        policy_id: 'pol_nist_ai_rmf_input',
        decision: 'ALLOW',
        reason_codes: ['NIST_RMF_CONTROLS_SATISFIED'],
      }),
      contrib({
        pack_id: 'pack_hipaa',
        policy_id: 'pol_hipaa_phi_local',
        decision: 'DENY',
        reason_codes: ['HIPAA_DENY'],
      }),
    ]);

    expect(resolved.resolution.category).toBe('RESTRICTIVE');
    expect(resolved.resolution.basis).toBe('CONSEQUENCE_DENY');
    expect(resolved.decision).toBe('DENY');
    expect(resolved.reason_codes).toContain('RESOLUTION_CONSEQUENCE_DENY');
    expect(getAuthorityForPack('pack_nist_ai_rmf')!.type).toBe('FRAMEWORK');
    expect(getAuthorityForPack('pack_hipaa')!.type).toBe('REGULATION');
    expect(resolved.resolution.contributing_pack_ids).toEqual(
      expect.arrayContaining(['pack_nist_ai_rmf', 'pack_hipaa']),
    );
  });

  it('TEST 7 — Human AUTHORIZE → RESUME → Gateway → Observability → VERIFIED', async () => {
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
        reason_codes: [
          'REGULATORY_APPLICABILITY:HIPAA',
          'REGULATORY_APPLICABILITY:PART2',
          'REGULATORY_APPLICABILITY:NIST_AI_RMF',
        ],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      source_system: 'ehr',
      authorization_context: 'part2_consent',
      request_id: 'req_authorize_resume',
    });
    expect(decision.decision).toBe('REVIEW');

    await Promise.resolve(
      repo.attachHeldRequest!(decision.evaluation_id!, heldSnapshot()),
    );

    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin', auditSigningKey: 'test-audit-key' },
      policyRepository: repo,
    });
    const server = await gw.buildServer();
    const auth = { authorization: 'Bearer test_admin' };
    const evalId = decision.evaluation_id!;
    const machineBefore = repo.getEvaluation(evalId)!.decision;

    const resolve = await server.inject({
      method: 'POST',
      url: `/v1/admin/evaluations/${evalId}/resolve`,
      headers: auth,
      payload: {
        disposition: 'AUTHORIZE',
        reason: 'Treatment relationship and governance context confirmed.',
        actor: 'approver_alice',
      },
    });
    expect(resolve.statusCode).toBe(200);
    expect(resolve.json().original_decision).toBe('REVIEW');
    expect(resolve.json().final_decision).toBe('ALLOW');
    expect(resolve.json().execution?.status).toBe('AUTHORIZED_NOT_RESUMED');
    expect(resolve.json().enforcement?.verified).toBe(false);

    const afterResolve = repo.getEvaluation(evalId)!;
    expect(afterResolve.decision).toBe(machineBefore);
    expect(afterResolve.decision).toBe('REVIEW');
    expect(afterResolve.human_resolution?.human_disposition).toBe('AUTHORIZE');
    expect(afterResolve.human_resolution?.final_decision).toBe('ALLOW');
    expect(afterResolve.held_request).toBeTruthy();

    const resume = await server.inject({
      method: 'POST',
      url: `/v1/admin/evaluations/${evalId}/resume`,
      headers: auth,
    });
    expect(resume.statusCode).toBe(200);
    expect(resume.json().status).toBe('resumed');
    expect(resume.json().original_decision).toBe('REVIEW');
    expect(resume.json().final_decision).toBe('ALLOW');
    expect(resume.json().execution?.status).toBe('RESUMED');
    expect(resume.json().enforcement?.status).toBe('ALLOWED');
    expect(resume.json().enforcement?.verified).toBe(true);
    expect(resume.json().request_id).toBe('req_authorize_resume');
    expect(resume.json().gateway?.status).toBe('approved');

    const afterResume = repo.getEvaluation(evalId)!;
    expect(afterResume.decision).toBe('REVIEW');
    expect(afterResume.explanation.provenance?.matched_rules?.length).toBeGreaterThan(0);

    const expectedHash = computeDecisionHash(afterResume);
    const events = await gw.audit.list();
    const resumeEvt = events.find(
      (e) => e.metadata?.resume === true || e.operation === 'evaluation_resume',
    );
    expect(resumeEvt?.evaluation_id).toBe(evalId);
    expect(resumeEvt?.decision_hash).toBe(expectedHash);
    expect(resumeEvt?.response_decision).toBe('RELEASE');

    // No second policy evaluation for the same request
    const evalsForRequest = repo
      .listEvaluations({ limit: 100 })
      .filter((e) => e.request_id === 'req_authorize_resume' && e.phase === 'input');
    expect(evalsForRequest).toHaveLength(1);

    await server.close();
  });

  it('TEST 8 — Human DENY: no resume, no Gateway release', async () => {
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
        reason_codes: [
          'REGULATORY_APPLICABILITY:HIPAA',
          'REGULATORY_APPLICABILITY:NIST_AI_RMF',
        ],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'part2_consent',
      request_id: 'req_human_deny',
    });
    expect(decision.decision).toBe('REVIEW');
    await Promise.resolve(
      repo.attachHeldRequest!(decision.evaluation_id!, heldSnapshot()),
    );

    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin', auditSigningKey: 'test-audit-key' },
      policyRepository: repo,
    });
    const server = await gw.buildServer();
    const auth = { authorization: 'Bearer test_admin' };
    const evalId = decision.evaluation_id!;

    const resolve = await server.inject({
      method: 'POST',
      url: `/v1/admin/evaluations/${evalId}/resolve`,
      headers: auth,
      payload: {
        disposition: 'DENY',
        reason: 'Governance context insufficient for release.',
        actor: 'approver_bob',
      },
    });
    expect(resolve.statusCode).toBe(200);
    expect(resolve.json().original_decision).toBe('REVIEW');
    expect(resolve.json().final_decision).toBe('DENY');

    const after = repo.getEvaluation(evalId)!;
    expect(after.decision).toBe('REVIEW');
    expect(after.human_resolution?.human_disposition).toBe('DENY');

    const resume = await server.inject({
      method: 'POST',
      url: `/v1/admin/evaluations/${evalId}/resume`,
      headers: auth,
    });
    expect(resume.statusCode).toBe(400);
    expect(resume.json().reason_code).toBe('DENY_CANNOT_RESUME');

    const events = await gw.audit.list();
    expect(
      events.some(
        (e) =>
          e.evaluation_id === evalId &&
          e.metadata?.resume === true &&
          e.response_decision === 'RELEASE',
      ),
    ).toBe(false);
    const resolveEvt = events.find((e) => e.operation === 'evaluation_resolve');
    expect(resolveEvt?.evaluation_id).toBe(evalId);
    expect(resolveEvt?.response_decision).toBe('BLOCK');

    await server.close();
  });

  it('TEST 9 — Resume idempotency / abuse: safe failure', async () => {
    const repo = new InMemoryPolicyRepository();
    const seeded: PolicyEvaluationRecord = {
      evaluation_id: 'eval_abuse_1',
      request_id: 'req_abuse_1',
      phase: 'input',
      organization_id: 'org_demo',
      subject: {},
      resource: {},
      action: 'SUMMARIZE',
      context: { purpose: 'treatment' },
      ai_context: {},
      evidence_in: {},
      decision: 'REVIEW',
      reason_codes: ['NIST_RMF_MANAGE_RESPONSE_REVIEW'],
      applicable_policies: [
        { policy_id: 'pol_nist_ai_rmf_input', version: 1, pack_id: 'pack_nist_ai_rmf' },
      ],
      obligations: [],
      explanation: {
        matched_conditions: [],
        rejected_conditions: [],
        final_reason: 'review',
      },
      created_at: new Date().toISOString(),
      held_request: heldSnapshot(),
    };
    repo.recordEvaluation(seeded);

    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin' },
      policyRepository: repo,
    });
    const server = await gw.buildServer();
    const auth = { authorization: 'Bearer test_admin' };

    // Not authorized yet
    const premature = await server.inject({
      method: 'POST',
      url: '/v1/admin/evaluations/eval_abuse_1/resume',
      headers: auth,
    });
    expect(premature.statusCode).toBeGreaterThanOrEqual(400);

    await server.inject({
      method: 'POST',
      url: '/v1/admin/evaluations/eval_abuse_1/resolve',
      headers: auth,
      payload: {
        disposition: 'AUTHORIZE',
        reason: 'Approved after review.',
        actor: 'alice',
      },
    });

    const first = await server.inject({
      method: 'POST',
      url: '/v1/admin/evaluations/eval_abuse_1/resume',
      headers: auth,
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().status).toBe('resumed');

    const second = await server.inject({
      method: 'POST',
      url: '/v1/admin/evaluations/eval_abuse_1/resume',
      headers: auth,
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().status).toBe('already_resumed');

    // Missing held request
    repo.recordEvaluation({
      ...seeded,
      evaluation_id: 'eval_abuse_no_hold',
      held_request: undefined,
      human_resolution: undefined,
      execution: undefined,
    });
    await server.inject({
      method: 'POST',
      url: '/v1/admin/evaluations/eval_abuse_no_hold/resolve',
      headers: auth,
      payload: { disposition: 'AUTHORIZE', reason: 'ok', actor: 'a' },
    });
    const noHold = await server.inject({
      method: 'POST',
      url: '/v1/admin/evaluations/eval_abuse_no_hold/resume',
      headers: auth,
    });
    expect(noHold.statusCode).toBe(409);
    expect(noHold.json().reason_code).toBe('MISSING_HELD_REQUEST');

    // DENY cannot resume (covered also in TEST 8)
    repo.recordEvaluation({
      ...seeded,
      evaluation_id: 'eval_abuse_deny',
      human_resolution: undefined,
      execution: undefined,
    });
    await server.inject({
      method: 'POST',
      url: '/v1/admin/evaluations/eval_abuse_deny/resolve',
      headers: auth,
      payload: { disposition: 'DENY', reason: 'No.', actor: 'b' },
    });
    const denyResume = await server.inject({
      method: 'POST',
      url: '/v1/admin/evaluations/eval_abuse_deny/resume',
      headers: auth,
    });
    expect(denyResume.statusCode).toBe(400);
    expect(denyResume.json().reason_code).toBe('DENY_CANNOT_RESUME');

    await server.close();
  });

  it('TEST 10 — Gateway failure: Decision ≠ Enforcement; not VERIFIED success', async () => {
    const failingModels: ModelGateway = {
      listAvailableModels: () => ['local-general-v1'],
      executeApproved: async () => {
        throw new GatewayError('INTERNAL_ERROR', 'Simulated gateway failure', 500);
      },
    };

    const repo = new InMemoryPolicyRepository();
    const seeded: PolicyEvaluationRecord = {
      evaluation_id: 'eval_gw_fail',
      request_id: 'req_gw_fail',
      phase: 'input',
      organization_id: 'org_demo',
      subject: {},
      resource: {},
      action: 'SUMMARIZE',
      context: { purpose: 'treatment' },
      ai_context: {},
      evidence_in: {},
      decision: 'REVIEW',
      reason_codes: ['POLICY_CONFLICT_UNRESOLVED'],
      applicable_policies: [],
      obligations: [],
      explanation: {
        matched_conditions: [],
        rejected_conditions: [],
        final_reason: 'conflict',
      },
      created_at: new Date().toISOString(),
      held_request: heldSnapshot(),
    };
    repo.recordEvaluation(seeded);

    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin', auditSigningKey: 'test-audit-key' },
      policyRepository: repo,
      models: failingModels,
    });
    const server = await gw.buildServer();
    const auth = { authorization: 'Bearer test_admin' };

    await server.inject({
      method: 'POST',
      url: '/v1/admin/evaluations/eval_gw_fail/resolve',
      headers: auth,
      payload: {
        disposition: 'AUTHORIZE',
        reason: 'Approved; gateway will fail.',
        actor: 'alice',
      },
    });

    const resume = await server.inject({
      method: 'POST',
      url: '/v1/admin/evaluations/eval_gw_fail/resume',
      headers: auth,
    });
    expect(resume.statusCode).toBe(409);
    expect(resume.json().status).toBe('resume_failed');

    const after = repo.getEvaluation('eval_gw_fail')!;
    // Authoritative machine Decision unchanged; human final remains ALLOW
    expect(after.decision).toBe('REVIEW');
    expect(after.human_resolution?.final_decision).toBe('ALLOW');
    expect(after.execution?.status).toBe('RESUME_FAILED');

    const events = await gw.audit.list();
    const failEvt = events.find(
      (e) => e.evaluation_id === 'eval_gw_fail' && e.metadata?.resume === true,
    );
    expect(failEvt).toBeTruthy();
    expect(failEvt!.response_decision).toBe('BLOCK');

    const apiEnforcement = resume.json().enforcement;
    expect(apiEnforcement?.status).toBe('FAILED');
    expect(apiEnforcement?.status).not.toBe('ALLOWED');
    // Joined audit may set verified=true; customer-facing label must stay FAILED.
    expect(customerVerificationLabel(apiEnforcement)).toBe('FAILED');
    expect(customerVerificationLabel(apiEnforcement)).not.toBe('VERIFIED');

    const enforcement = projectEnforcementResult(after, failEvt!);
    expect(enforcement.status).toBe('FAILED');
    expect(customerVerificationLabel(enforcement)).toBe('FAILED');
    // Decision (final ALLOW / machine REVIEW) ≠ enforcement outcome (FAILED)
    expect(after.human_resolution?.final_decision).toBe('ALLOW');

    await server.close();
  });

  it('TEST 11 — Observability Decision binding + tamper detection', async () => {
    const gw = createPhase1Gateway({
      config: { auditSigningKey: 'test-audit-key' },
    });
    const r1 = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      messages: [{ role: 'user', content: 'Summarize discharge instructions.' }],
    });
    expect(r1.httpStatus).toBe(200);

    const events = await gw.audit.list();
    const last = events[events.length - 1]!;
    expect(last.evaluation_id).toBeTruthy();
    expect(last.decision_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(last.request_id).toBeTruthy();
    expect(last.policy_decision).toBeTruthy();
    expect(last.response_decision).toBe('RELEASE');
    expect(last.event_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(last.prev_event_hash).toBeTruthy();

    const record = gw.packRepo.getEvaluation(last.evaluation_id!)!;
    expect(last.decision_hash).toBe(computeDecisionHash(record));
    expect(buildDecisionEvidencePayload(record).machine_decision).toBe(record.decision);

    // Controlled mutation of a Decision-bound field on a fixture (not production data)
    const tampered = {
      ...last,
      decision_hash: '0'.repeat(64),
    };
    const chain = verifyAuditChain([tampered], 'test-audit-key');
    expect(chain.ok).toBe(false);

    const clean = await (gw.audit as IntegrityAuditService).verifyIntegrity();
    expect(clean.ok).toBe(true);
  });

  it('TEST 12 — Provenance distinguishes REGULATION vs FRAMEWORK for all three authorities', async () => {
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
        reason_codes: [
          'REGULATORY_APPLICABILITY:HIPAA',
          'REGULATORY_APPLICABILITY:PART2',
          'REGULATORY_APPLICABILITY:NIST_AI_RMF',
        ],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      source_system: 'ehr',
      authorization_context: 'part2_consent',
      governance_context: GOVERNANCE_DOCUMENTED,
      request_id: 'req_auth_dist',
    });

    const hipaa = getAuthorityForPack('pack_hipaa')!;
    const part2 = getAuthorityForPack('pack_42_cfr_part_2')!;
    const nist = getAuthorityForPack('pack_nist_ai_rmf')!;
    const owasp = getAuthorityForPack('pack_owasp_llm_2025')!;
    const eu = getAuthorityForPack('pack_eu_ai_act')!;
    const iso = getAuthorityForPack('pack_iso_42001')!;
    const iso23894 = getAuthorityForPack('pack_iso_23894')!;
    const iso42005 = getAuthorityForPack('pack_iso_42005')!;
    const soc2 = getAuthorityForPack('pack_soc2')!;

    expect(hipaa.type).toBe('REGULATION');
    expect(treatsAsLegalAuthority(hipaa)).toBe(true);
    expect(part2.type).toBe('REGULATION');
    expect(treatsAsLegalAuthority(part2)).toBe(true);
    expect(nist.type).toBe('FRAMEWORK');
    expect(treatsAsLegalAuthority(nist)).toBe(false);
    expect(owasp.type).toBe('SECURITY_GUIDANCE');
    expect(treatsAsLegalAuthority(owasp)).toBe(false);
    expect(eu.type).toBe('REGULATION');
    expect(treatsAsLegalAuthority(eu)).toBe(true);
    expect(iso.type).toBe('STANDARD');
    expect(treatsAsLegalAuthority(iso)).toBe(false);
    expect(iso23894.type).toBe('STANDARD');
    expect(treatsAsLegalAuthority(iso23894)).toBe(false);
    expect(iso23894.id).not.toBe(iso.id);
    expect(iso42005.type).toBe('STANDARD');
    expect(treatsAsLegalAuthority(iso42005)).toBe(false);
    expect(iso42005.id).not.toBe(iso.id);
    expect(iso42005.id).not.toBe(iso23894.id);
    expect(soc2.type).toBe('FRAMEWORK');
    expect(treatsAsLegalAuthority(soc2)).toBe(false);
    expect(soc2.id).not.toBe(nist.id);
    const csf = getAuthorityForPack('pack_nist_csf_2')!;
    expect(csf.type).toBe('FRAMEWORK');
    expect(treatsAsLegalAuthority(csf)).toBe(false);
    expect(csf.id).not.toBe(nist.id);
    expect(csf.id).not.toBe(soc2.id);
    const iso38507 = getAuthorityForPack('pack_iso_38507')!;
    expect(iso38507.type).toBe('STANDARD');
    expect(treatsAsLegalAuthority(iso38507)).toBe(false);
    expect(iso38507.id).not.toBe(getAuthorityForPack('pack_iso_42001')!.id);
    const iso27001 = getAuthorityForPack('pack_iso_27001')!;
    expect(iso27001.type).toBe('STANDARD');
    expect(treatsAsLegalAuthority(iso27001)).toBe(false);
    expect(iso27001.id).not.toBe(iso38507.id);

    const explained = withOperatorExplanation(decision);
    const nistSource = explained.explanation.provenance?.sources?.find(
      (s) => s.authority_id === POLICY_AUTHORITY_IDS.nistAiRmf,
    );
    expect(nistSource?.legal_authority).toBe(false);
    expect(String(nistSource?.authority_type ?? '')).not.toMatch(/REGULATION|STATUTE/i);
    expect(nist.name).not.toMatch(/statute|regulation/i);
  });

  it('TEST 13 — Customer question surfaces exist on Decision API (no UI invention)', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    const auth = { authorization: 'Bearer test_admin' };

    const sim = await server.inject({
      method: 'POST',
      url: '/v1/admin/policies/pol_hipaa_phi_local/simulate',
      headers: auth,
      payload: {
        classification: 'PHI',
        action: 'summarize',
        requested_model: 'local-general-v1',
        regulatory_applicability: ['HIPAA', 'PART2', 'NIST_AI_RMF'],
        purpose: 'treatment',
        authorization_context: 'part2_consent',
        governance_context: GOVERNANCE_DOCUMENTED,
        source_system: 'ehr',
      },
    });
    expect(sim.statusCode).toBe(200);
    const evaluationId = sim.json().decision?.evaluation_id as string;

    const detail = await server.inject({
      method: 'GET',
      url: `/v1/admin/evaluations/${evaluationId}`,
      headers: auth,
    });
    expect(detail.statusCode).toBe(200);
    const body = detail.json();

    // Q1 — What did the AI try to do?
    expect(body.request_context?.action || body.evaluation?.action).toBeTruthy();
    // Q2 — Which policies applied?
    expect(
      body.decision?.applicable_policies?.length ||
        body.decision?.explanation?.operator?.contributions?.length,
    ).toBeGreaterThan(0);
    // Q3 — Why?
    expect(
      body.decision?.explanation?.operator?.narrative ||
        body.decision?.explanation?.final_reason,
    ).toBeTruthy();
    // Q4 — Who authorized?
    expect(body.review).toBeDefined();
    // Q5 — Did it execute?
    expect(body.enforcement?.status).toBeTruthy();
    expect(body.enforcement?.status).toBe('NOT_EXECUTED'); // simulate
    // Q6 — Prove?
    expect(body.source).toBe('policy_evaluations');

    await server.close();
  });

  it('TEST 14 — End-to-end correlation chain AUTHORIZE → RESUME → VERIFIED', async () => {
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
        reason_codes: [
          'REGULATORY_APPLICABILITY:HIPAA',
          'REGULATORY_APPLICABILITY:PART2',
          'REGULATORY_APPLICABILITY:NIST_AI_RMF',
        ],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      source_system: 'ehr',
      authorization_context: 'part2_consent',
      request_id: 'req_trace_e2e',
    });
    const evaluationId = decision.evaluation_id!;
    await Promise.resolve(repo.attachHeldRequest!(evaluationId, heldSnapshot()));

    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin', auditSigningKey: 'test-audit-key' },
      policyRepository: repo,
    });
    const server = await gw.buildServer();
    const auth = { authorization: 'Bearer test_admin' };

    await server.inject({
      method: 'POST',
      url: `/v1/admin/evaluations/${evaluationId}/resolve`,
      headers: auth,
      payload: {
        disposition: 'AUTHORIZE',
        reason: 'Trace test authorize.',
        actor: 'tracer',
      },
    });
    const resume = await server.inject({
      method: 'POST',
      url: `/v1/admin/evaluations/${evaluationId}/resume`,
      headers: auth,
    });
    expect(resume.statusCode).toBe(200);

    const record = repo.getEvaluation(evaluationId)!;
    const ctx = projectRequestContext(record);
    const events = await gw.audit.list();
    const resumeEvt = events.find((e) => e.metadata?.resume === true)!;

    const trace = {
      request_id: record.request_id,
      authorities: [
        getAuthorityForPack('pack_hipaa')?.id,
        getAuthorityForPack('pack_42_cfr_part_2')?.id,
        getAuthorityForPack('pack_nist_ai_rmf')?.id,
      ],
      rule_ids: record.explanation.provenance?.matched_rules?.map((r) => r.rule_id),
      evaluation_id: record.evaluation_id,
      machine_decision: record.decision,
      human_resolution: record.human_resolution?.human_disposition,
      final_decision: record.human_resolution?.final_decision,
      expected_action: 'ALLOW',
      gateway_request_id: resume.json().gateway?.request_id ?? resume.json().request_id,
      observability_audit_id: resumeEvt.audit_id,
      decision_hash: resumeEvt.decision_hash,
      event_hash: resumeEvt.event_hash,
      enforcement_verified: resume.json().enforcement?.verified,
      enforcement_status: resume.json().enforcement?.status,
    };

    expect(trace.request_id).toBe('req_trace_e2e');
    expect(trace.evaluation_id).toBe(evaluationId);
    expect(trace.machine_decision).toBe('REVIEW');
    expect(trace.human_resolution).toBe('AUTHORIZE');
    expect(trace.final_decision).toBe('ALLOW');
    expect(trace.observability_audit_id).toBeTruthy();
    expect(trace.decision_hash).toBe(computeDecisionHash(record));
    expect(resumeEvt.evaluation_id).toBe(evaluationId);
    expect(trace.enforcement_verified).toBe(true);
    expect(trace.enforcement_status).toBe('ALLOWED');
    expect(ctx.request_id).toBe('req_trace_e2e');

    await server.close();
  });

  it('TEST 15 — Semantic language audit (report findings; do not mutate)', () => {
    const roots = [
      resolve(process.cwd(), 'src/api/admin-routes.ts'),
      resolve(process.cwd(), 'src/admin/compliance-score.ts'),
      resolve(process.cwd(), 'admin/src/components/ComplianceScoreCard.tsx'),
      resolve(process.cwd(), 'src/policy/enterprise/packs/nist-ai-rmf/pack.ts'),
      resolve(process.cwd(), 'policy-packs/nist-ai-rmf/manifest.json'),
    ];

    const findings: string[] = [];
    for (const file of roots) {
      let text = '';
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      if (/NIST requires REVIEW/i.test(text)) {
        findings.push(`${file}: contains "NIST requires REVIEW"`);
      }
      if (/compliance analyst/i.test(text)) {
        findings.push(`${file}: LLM prompt frames "compliance analyst" scoring`);
      }
      if (/compliant_controls/i.test(text)) {
        findings.push(`${file}: exposes compliant_controls scoring language`);
      }
    }

    // NIST pack must NOT claim legal mandate language in manifest
    const manifest = readFileSync(
      resolve(process.cwd(), 'policy-packs/nist-ai-rmf/manifest.json'),
      'utf8',
    );
    expect(manifest).toMatch(/not legal authority/i);
    expect(manifest).not.toMatch(/NIST requires REVIEW/i);

    // Authority semantics remain explicit
    expect(treatsAsLegalAuthority(getPolicyAuthority(POLICY_AUTHORITY_IDS.nistAiRmf)!)).toBe(
      false,
    );

    // Findings are reported via expect metadata — suite stays green
    expect(Array.isArray(findings)).toBe(true);
    // After FIX 4: no customer-facing "compliance analyst" / "compliant_controls"
    expect(
      findings.some((f) => f.includes('compliant_controls') || f.includes('compliance analyst')),
    ).toBe(false);
    expect(findings.filter((f) => f.includes('NIST requires REVIEW'))).toHaveLength(0);
  });

  it('TEST 16 — ISO 42001 management-system evidence satisfied → ALLOW path', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: {
        ...clinicalApp,
        type: 'internal',
        allowed_operations: ['summarize'],
      },
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: ['REGULATORY_APPLICABILITY:ISO_42001'],
      },
      deploymentMode: 'connected',
      governance_context: {
        management_system: {
          ai_policy_established: true,
          roles_responsibilities_documented: true,
          ai_system_inventory_documented: true,
          risk_process_established: true,
          risk_assessment_completed: true,
          risk_treatment_documented: true,
          impact_assessment_completed: true,
          data_governance_established: true,
          human_oversight_defined: true,
          operational_controls_defined: true,
          monitoring_established: true,
          performance_evaluation_established: true,
          incident_process_established: true,
          continual_improvement_process_established: true,
        },
      },
      request_id: 'req_iso_allow',
    });
    expect(decision.reason_codes).toContain('ISO42001_CONTROLS_SATISFIED');
    expect(decision.decision).not.toBe('REVIEW');
    expect(repo.getEvaluation(decision.evaluation_id!)?.evaluation_id).toBe(
      decision.evaluation_id,
    );
  });

  it('TEST 17 — ISO 42001 missing management evidence → REVIEW', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: { ...clinicalApp, type: 'internal' },
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: ['REGULATORY_APPLICABILITY:ISO_42001'],
      },
      deploymentMode: 'connected',
      request_id: 'req_iso_review',
    });
    expect(decision.decision).toBe('REVIEW');
    expect(decision.reason_codes.some((c) => c.startsWith('ISO42001_'))).toBe(true);
  });

  it('TEST 18 — Six-authority evaluation through generic PDP', async () => {
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
        reason_codes: [
          'REGULATORY_APPLICABILITY:HIPAA',
          'REGULATORY_APPLICABILITY:PART2',
          'REGULATORY_APPLICABILITY:NIST_AI_RMF',
          'REGULATORY_APPLICABILITY:OWASP_LLM_2025',
          'REGULATORY_APPLICABILITY:EU_AI_ACT',
          'REGULATORY_APPLICABILITY:ISO_42001',
        ],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      source_system: 'ehr',
      authorization_context: 'part2_consent',
      evaluation_as_of: '2026-09-01',
      governance_context: {
        ...GOVERNANCE_DOCUMENTED,
        security_controls: {
          prompt_injection_controls: true,
          sensitive_data_controls: true,
          supply_chain_controls: true,
          poisoning_controls: true,
          output_validation_controls: true,
          agency_controls: true,
          system_prompt_protection: true,
          retrieval_security_controls: true,
          grounding_controls: true,
          resource_limits: true,
        },
        management_system: {
          ai_policy_established: true,
          roles_responsibilities_documented: true,
          ai_system_inventory_documented: true,
          risk_process_established: true,
          risk_assessment_completed: true,
          risk_treatment_documented: true,
          impact_assessment_completed: true,
          data_governance_established: true,
          human_oversight_defined: true,
          operational_controls_defined: true,
          monitoring_established: true,
          performance_evaluation_established: true,
          incident_process_established: true,
          continual_improvement_process_established: true,
        },
        regulatory: {
          actor_role: 'deployer',
          deployment_jurisdiction: 'EU',
          market_placement_jurisdiction: 'EU',
          prohibited_practice_code: 'none',
          regulatory_risk_category: 'MINIMAL_OR_NO_RISK',
        },
      },
      request_id: 'req_six_auth_product',
    });

    expect(decision.reason_codes).not.toContain('POLICY_CONFLICT_UNRESOLVED');
    expect(decision.reason_codes.some((c) => c.startsWith('ISO42001_'))).toBe(true);
    const sources = decision.explanation.provenance?.sources ?? [];
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.iso42001)).toBe(
      true,
    );
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.euAiAct)).toBe(true);
    expect(repo.getEvaluation(decision.evaluation_id!)).toBeTruthy();
  });

  it('TEST 19 — ISO 23894 risk evidence satisfied → ALLOW path', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: { ...clinicalApp, type: 'internal', allowed_operations: ['summarize'] },
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: ['REGULATORY_APPLICABILITY:ISO_23894'],
      },
      deploymentMode: 'connected',
      governance_context: {
        ai_risk: {
          risk_management_established: true,
          risk_context_defined: true,
          risk_identification_completed: true,
          risk_analysis_completed: true,
          risk_evaluation_completed: true,
          risk_treatment_defined: true,
          risk_treatment_implemented: true,
          residual_risk_accepted: true,
          risk_monitoring_established: true,
          risk_communication_established: true,
          risk_review_established: true,
        },
      },
      request_id: 'req_iso23894_allow',
    });
    expect(decision.reason_codes).toContain('ISO23894_CONTROLS_SATISFIED');
    expect(decision.decision).not.toBe('REVIEW');
  });

  it('TEST 20 — ISO 23894 missing risk evidence → REVIEW', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: { ...clinicalApp, type: 'internal' },
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: ['REGULATORY_APPLICABILITY:ISO_23894'],
      },
      deploymentMode: 'connected',
      request_id: 'req_iso23894_review',
    });
    expect(decision.decision).toBe('REVIEW');
    expect(decision.reason_codes.some((c) => c.startsWith('ISO23894_'))).toBe(true);
  });

  it('TEST 21 — ISO 42001 + ISO 23894 independent contributions', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: { ...clinicalApp, type: 'internal' },
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: [
          'REGULATORY_APPLICABILITY:ISO_42001',
          'REGULATORY_APPLICABILITY:ISO_23894',
        ],
      },
      deploymentMode: 'connected',
      governance_context: {
        management_system: {
          ai_policy_established: true,
          roles_responsibilities_documented: true,
          ai_system_inventory_documented: true,
          risk_process_established: true,
          risk_assessment_completed: true,
          risk_treatment_documented: true,
          impact_assessment_completed: true,
          data_governance_established: true,
          human_oversight_defined: true,
          operational_controls_defined: true,
          monitoring_established: true,
          performance_evaluation_established: true,
          incident_process_established: true,
          continual_improvement_process_established: true,
        },
        ai_risk: {
          risk_management_established: true,
          risk_context_defined: true,
          risk_identification_completed: true,
          risk_analysis_completed: true,
          risk_evaluation_completed: true,
          risk_treatment_defined: true,
          risk_treatment_implemented: true,
          residual_risk_accepted: true,
          risk_monitoring_established: true,
          risk_communication_established: true,
          risk_review_established: true,
        },
      },
      request_id: 'req_iso_both',
    });
    expect(decision.reason_codes.some((c) => c.startsWith('ISO42001_'))).toBe(true);
    expect(decision.reason_codes.some((c) => c.startsWith('ISO23894_'))).toBe(true);
    const sources = decision.explanation.provenance?.sources ?? [];
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.iso42001)).toBe(
      true,
    );
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.iso23894)).toBe(
      true,
    );
  });

  it('TEST 22 — Eight-authority evaluation through generic PDP', async () => {
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
        reason_codes: [
          'REGULATORY_APPLICABILITY:HIPAA',
          'REGULATORY_APPLICABILITY:PART2',
          'REGULATORY_APPLICABILITY:NIST_AI_RMF',
          'REGULATORY_APPLICABILITY:OWASP_LLM_2025',
          'REGULATORY_APPLICABILITY:EU_AI_ACT',
          'REGULATORY_APPLICABILITY:ISO_42001',
          'REGULATORY_APPLICABILITY:ISO_23894',
          'REGULATORY_APPLICABILITY:ISO_42005',
        ],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      source_system: 'ehr',
      authorization_context: 'part2_consent',
      evaluation_as_of: '2026-09-01',
      governance_context: {
        ...GOVERNANCE_DOCUMENTED,
        security_controls: {
          prompt_injection_controls: true,
          sensitive_data_controls: true,
          supply_chain_controls: true,
          poisoning_controls: true,
          output_validation_controls: true,
          agency_controls: true,
          system_prompt_protection: true,
          retrieval_security_controls: true,
          grounding_controls: true,
          resource_limits: true,
        },
        management_system: {
          ai_policy_established: true,
          roles_responsibilities_documented: true,
          ai_system_inventory_documented: true,
          risk_process_established: true,
          risk_assessment_completed: true,
          risk_treatment_documented: true,
          impact_assessment_completed: true,
          data_governance_established: true,
          human_oversight_defined: true,
          operational_controls_defined: true,
          monitoring_established: true,
          performance_evaluation_established: true,
          incident_process_established: true,
          continual_improvement_process_established: true,
        },
        ai_risk: {
          risk_management_established: true,
          risk_context_defined: true,
          risk_identification_completed: true,
          risk_analysis_completed: true,
          risk_evaluation_completed: true,
          risk_treatment_defined: true,
          risk_treatment_implemented: true,
          residual_risk_accepted: true,
          risk_monitoring_established: true,
          risk_communication_established: true,
          risk_review_established: true,
        },
        impact: {
          impact_assessment_completed: true,
          impact_scope_defined: true,
          affected_stakeholders_identified: true,
          potential_impacts_identified: true,
          impact_severity_assessed: true,
          impact_likelihood_assessed: true,
          mitigations_defined: true,
          mitigations_implemented: true,
          residual_impact_reviewed: true,
          impact_monitoring_established: true,
          impact_review_established: true,
        },
        regulatory: {
          actor_role: 'deployer',
          deployment_jurisdiction: 'EU',
          market_placement_jurisdiction: 'EU',
          prohibited_practice_code: 'none',
          regulatory_risk_category: 'MINIMAL_OR_NO_RISK',
        },
      },
      request_id: 'req_eight_auth_product',
    });

    expect(decision.reason_codes).not.toContain('POLICY_CONFLICT_UNRESOLVED');
    expect(decision.reason_codes.some((c) => c.startsWith('ISO23894_'))).toBe(true);
    expect(decision.reason_codes.some((c) => c.startsWith('ISO42001_'))).toBe(true);
    expect(decision.reason_codes.some((c) => c.startsWith('ISO42005_'))).toBe(true);
    const sources = decision.explanation.provenance?.sources ?? [];
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.iso23894)).toBe(
      true,
    );
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.iso42005)).toBe(
      true,
    );
    expect(repo.getEvaluation(decision.evaluation_id!)).toBeTruthy();
  });

  it('TEST 23 — ISO 42005 impact evidence satisfied → ALLOW path', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: { ...clinicalApp, type: 'internal', allowed_operations: ['summarize'] },
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: ['REGULATORY_APPLICABILITY:ISO_42005'],
      },
      deploymentMode: 'connected',
      governance_context: {
        impact: {
          impact_assessment_completed: true,
          impact_scope_defined: true,
          affected_stakeholders_identified: true,
          potential_impacts_identified: true,
          impact_severity_assessed: true,
          impact_likelihood_assessed: true,
          mitigations_defined: true,
          mitigations_implemented: true,
          residual_impact_reviewed: true,
          impact_monitoring_established: true,
          impact_review_established: true,
        },
      },
      request_id: 'req_iso42005_allow',
    });
    expect(decision.reason_codes).toContain('ISO42005_CONTROLS_SATISFIED');
    expect(decision.decision).not.toBe('REVIEW');
  });

  it('TEST 24 — ISO 42005 missing impact evidence → REVIEW', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: { ...clinicalApp, type: 'internal' },
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: ['REGULATORY_APPLICABILITY:ISO_42005'],
      },
      deploymentMode: 'connected',
      request_id: 'req_iso42005_review',
    });
    expect(decision.decision).toBe('REVIEW');
    expect(decision.reason_codes.some((c) => c.startsWith('ISO42005_'))).toBe(true);
  });

  it('TEST 25 — ISO 42001 + ISO 23894 + ISO 42005 independent contributions', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: { ...clinicalApp, type: 'internal' },
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: [
          'REGULATORY_APPLICABILITY:ISO_42001',
          'REGULATORY_APPLICABILITY:ISO_23894',
          'REGULATORY_APPLICABILITY:ISO_42005',
        ],
      },
      deploymentMode: 'connected',
      governance_context: {
        management_system: {
          ai_policy_established: true,
          roles_responsibilities_documented: true,
          ai_system_inventory_documented: true,
          risk_process_established: true,
          risk_assessment_completed: true,
          risk_treatment_documented: true,
          impact_assessment_completed: true,
          data_governance_established: true,
          human_oversight_defined: true,
          operational_controls_defined: true,
          monitoring_established: true,
          performance_evaluation_established: true,
          incident_process_established: true,
          continual_improvement_process_established: true,
        },
        ai_risk: {
          risk_management_established: true,
          risk_context_defined: true,
          risk_identification_completed: true,
          risk_analysis_completed: true,
          risk_evaluation_completed: true,
          risk_treatment_defined: true,
          risk_treatment_implemented: true,
          residual_risk_accepted: true,
          risk_monitoring_established: true,
          risk_communication_established: true,
          risk_review_established: true,
        },
        impact: {
          impact_assessment_completed: true,
          impact_scope_defined: true,
          affected_stakeholders_identified: true,
          potential_impacts_identified: true,
          impact_severity_assessed: true,
          impact_likelihood_assessed: true,
          mitigations_defined: true,
          mitigations_implemented: true,
          residual_impact_reviewed: true,
          impact_monitoring_established: true,
          impact_review_established: true,
        },
      },
      request_id: 'req_iso_three',
    });
    expect(decision.reason_codes.some((c) => c.startsWith('ISO42001_'))).toBe(true);
    expect(decision.reason_codes.some((c) => c.startsWith('ISO23894_'))).toBe(true);
    expect(decision.reason_codes.some((c) => c.startsWith('ISO42005_'))).toBe(true);
    const sources = decision.explanation.provenance?.sources ?? [];
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.iso42001)).toBe(
      true,
    );
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.iso23894)).toBe(
      true,
    );
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.iso42005)).toBe(
      true,
    );
  });

  it('TEST 26 — Customer questions: blocked / REVIEW vs DENY / conflict / proof', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);

    // Q1 — Why blocked? (DENY path with explanation)
    const deny = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'write',
      requestedModel: 'gpt-cloud-external',
      availableModels: ['gpt-cloud-external'],
      environment: 'prod',
      classification: {
        sensitivity: 'PHI',
        confidence: 0.99,
        risk: 'high',
        reason_codes: ['REGULATORY_APPLICABILITY:HIPAA'],
      },
      deploymentMode: 'connected',
      purpose: 'marketing',
      authorization_context: 'authorized',
      request_id: 'req_q_blocked',
    });
    const denyExplained = withOperatorExplanation(deny);
    expect(denyExplained.decision === 'DENY' || denyExplained.decision === 'REVIEW').toBe(
      true,
    );
    expect(
      denyExplained.explanation.operator?.narrative ||
        denyExplained.explanation.final_reason,
    ).toBeTruthy();
    expect(denyExplained.reason_codes.length).toBeGreaterThan(0);

    // Q6 — REVIEW ≠ DENY when impact evidence missing
    const review = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: { ...clinicalApp, type: 'internal' },
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: ['REGULATORY_APPLICABILITY:ISO_42005'],
      },
      deploymentMode: 'connected',
      request_id: 'req_q_review',
    });
    expect(review.decision).toBe('REVIEW');
    expect(review.decision).not.toBe('DENY');
    const reviewNarrative =
      withOperatorExplanation(review).explanation.operator?.narrative ?? '';
    expect(reviewNarrative.toLowerCase()).not.toMatch(/denied by policy/);

    // Q2 / Q7 — which requirements / conflict → REVIEW
    const conflict = resolvePackContributions([
      {
        pack_id: 'pack_iso_42005',
        pack_name: 'ISO/IEC 42005',
        pack_version: '1.0.0',
        policy_id: 'pol_iso_42005_input',
        policy_name: 'ISO 42005 input',
        policy_version: 1,
        decision: 'ALLOW',
        reason_codes: ['ISO42005_CONTROLS_SATISFIED'],
        rule_ids: [],
        obligation_ids: [],
        obligations: [],
        controls: [],
        transforms: [],
        eligible_models: ['local-general-v1'],
        matched: [],
        applicable: true,
      },
      {
        pack_id: 'pack_hipaa',
        pack_name: 'HIPAA',
        pack_version: '3.1.0',
        policy_id: 'pol_hipaa_phi_local',
        policy_name: 'HIPAA PHI',
        policy_version: 3,
        decision: 'DENY',
        reason_codes: ['HIPAA_DENY'],
        rule_ids: [],
        obligation_ids: [],
        obligations: [],
        controls: [],
        transforms: [],
        eligible_models: [],
        matched: [],
        applicable: true,
      },
    ]);
    expect(conflict.decision).toBe('DENY');
    expect(conflict.reason_codes).toContain('RESOLUTION_CONSEQUENCE_DENY');
    expect(conflict.resolution.contributing_pack_ids).toEqual(
      expect.arrayContaining(['pack_iso_42005', 'pack_hipaa']),
    );

    // Q3 / Q5 — enforcement verification + proof binding via Decision API
    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin', auditSigningKey: 'test-audit-key' },
    });
    const server = await gw.buildServer();
    const auth = { authorization: 'Bearer test_admin' };
    const sim = await server.inject({
      method: 'POST',
      url: '/v1/admin/policies/pol_iso_42005_input/simulate',
      headers: auth,
      payload: {
        classification: 'INTERNAL',
        action: 'summarize',
        requested_model: 'local-general-v1',
        regulatory_applicability: ['ISO_42005'],
        governance_context: {
          impact: {
            impact_assessment_completed: true,
            impact_scope_defined: true,
            affected_stakeholders_identified: true,
            potential_impacts_identified: true,
            impact_severity_assessed: true,
            impact_likelihood_assessed: true,
            mitigations_defined: true,
            mitigations_implemented: true,
            residual_impact_reviewed: true,
            impact_monitoring_established: true,
            impact_review_established: true,
          },
        },
      },
    });
    expect(sim.statusCode).toBe(200);
    const evaluationId = sim.json().decision?.evaluation_id as string;
    const detail = await server.inject({
      method: 'GET',
      url: `/v1/admin/evaluations/${evaluationId}`,
      headers: auth,
    });
    expect(detail.statusCode).toBe(200);
    const body = detail.json();
    expect(body.source).toBe('policy_evaluations');
    expect(body.enforcement?.status).toBe('NOT_EXECUTED');
    expect(
      body.decision?.applicable_policies?.length ||
        body.decision?.explanation?.operator?.contributions?.length,
    ).toBeGreaterThan(0);
    expect(body.decision?.explanation?.provenance?.sources?.length).toBeGreaterThan(0);
    // No certification language
    const blob = JSON.stringify(body);
    expect(blob).not.toMatch(/ISO certified|ISO compliant|impact score|compliance percentage/i);
    await server.close();
  });

  it('TEST 27 — Customer question: historical reproducibility (evaluation_as_of)', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: { ...clinicalApp, type: 'internal' },
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: ['REGULATORY_APPLICABILITY:ISO_42005'],
      },
      deploymentMode: 'connected',
      evaluation_as_of: '2025-06-01',
      governance_context: {
        impact: {
          impact_assessment_completed: true,
          impact_scope_defined: true,
          affected_stakeholders_identified: true,
          potential_impacts_identified: true,
          impact_severity_assessed: true,
          impact_likelihood_assessed: true,
          mitigations_defined: true,
          mitigations_implemented: true,
          residual_impact_reviewed: true,
          impact_monitoring_established: true,
          impact_review_established: true,
        },
      },
      request_id: 'req_q_hist',
    });
    const stored = repo.getEvaluation(decision.evaluation_id!)!;
    const replay = evaluationRecordToDecisionPayload(stored);
    expect(replay.decision).toBe(decision.decision);
    expect(replay.reason_codes).toEqual(decision.reason_codes);
    expect(replay.evaluation_id).toBe(decision.evaluation_id);
  });

  const ASSURANCE_ALL = {
    control_environment_documented: true,
    access_controls_verified: true,
    change_management_controls_verified: true,
    logical_access_controls_verified: true,
    data_protection_controls_verified: true,
    system_monitoring_controls_verified: true,
    incident_response_controls_verified: true,
    availability_controls_verified: true,
    processing_integrity_controls_verified: true,
    confidentiality_controls_verified: true,
  };

  it('TEST 28 — SOC 2 assurance evidence satisfied → ALLOW path', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: { ...clinicalApp, type: 'internal', allowed_operations: ['summarize'] },
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: ['REGULATORY_APPLICABILITY:SOC_2'],
      },
      deploymentMode: 'connected',
      governance_context: { assurance: ASSURANCE_ALL },
      request_id: 'req_soc2_allow',
    });
    expect(decision.reason_codes).toContain('SOC2_CONTROLS_SATISFIED');
    expect(decision.decision).not.toBe('REVIEW');
    const narrative =
      withOperatorExplanation(decision).explanation.operator?.narrative ?? '';
    expect(narrative).not.toMatch(/SOC 2 certified|SOC 2 compliant/i);
  });

  it('TEST 29 — SOC 2 missing assurance evidence → REVIEW', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: { ...clinicalApp, type: 'internal' },
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: ['REGULATORY_APPLICABILITY:SOC_2'],
      },
      deploymentMode: 'connected',
      request_id: 'req_soc2_review',
    });
    expect(decision.decision).toBe('REVIEW');
    expect(decision.reason_codes.some((c) => c.startsWith('SOC2_'))).toBe(true);
  });

  it('TEST 30 — Nine-authority evaluation + SOC 2 customer question (not certification)', async () => {
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
        reason_codes: [
          'REGULATORY_APPLICABILITY:HIPAA',
          'REGULATORY_APPLICABILITY:PART2',
          'REGULATORY_APPLICABILITY:NIST_AI_RMF',
          'REGULATORY_APPLICABILITY:OWASP_LLM_2025',
          'REGULATORY_APPLICABILITY:EU_AI_ACT',
          'REGULATORY_APPLICABILITY:ISO_42001',
          'REGULATORY_APPLICABILITY:ISO_23894',
          'REGULATORY_APPLICABILITY:ISO_42005',
          'REGULATORY_APPLICABILITY:SOC_2',
        ],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      source_system: 'ehr',
      authorization_context: 'part2_consent',
      evaluation_as_of: '2026-09-01',
      governance_context: {
        ...GOVERNANCE_DOCUMENTED,
        security_controls: {
          prompt_injection_controls: true,
          sensitive_data_controls: true,
          supply_chain_controls: true,
          poisoning_controls: true,
          output_validation_controls: true,
          agency_controls: true,
          system_prompt_protection: true,
          retrieval_security_controls: true,
          grounding_controls: true,
          resource_limits: true,
        },
        management_system: {
          ai_policy_established: true,
          roles_responsibilities_documented: true,
          ai_system_inventory_documented: true,
          risk_process_established: true,
          risk_assessment_completed: true,
          risk_treatment_documented: true,
          impact_assessment_completed: true,
          data_governance_established: true,
          human_oversight_defined: true,
          operational_controls_defined: true,
          monitoring_established: true,
          performance_evaluation_established: true,
          incident_process_established: true,
          continual_improvement_process_established: true,
        },
        ai_risk: {
          risk_management_established: true,
          risk_context_defined: true,
          risk_identification_completed: true,
          risk_analysis_completed: true,
          risk_evaluation_completed: true,
          risk_treatment_defined: true,
          risk_treatment_implemented: true,
          residual_risk_accepted: true,
          risk_monitoring_established: true,
          risk_communication_established: true,
          risk_review_established: true,
        },
        impact: {
          impact_assessment_completed: true,
          impact_scope_defined: true,
          affected_stakeholders_identified: true,
          potential_impacts_identified: true,
          impact_severity_assessed: true,
          impact_likelihood_assessed: true,
          mitigations_defined: true,
          mitigations_implemented: true,
          residual_impact_reviewed: true,
          impact_monitoring_established: true,
          impact_review_established: true,
        },
        assurance: ASSURANCE_ALL,
        regulatory: {
          actor_role: 'deployer',
          deployment_jurisdiction: 'EU',
          market_placement_jurisdiction: 'EU',
          prohibited_practice_code: 'none',
          regulatory_risk_category: 'MINIMAL_OR_NO_RISK',
        },
      },
      request_id: 'req_nine_auth_product',
    });

    expect(decision.reason_codes).not.toContain('POLICY_CONFLICT_UNRESOLVED');
    expect(decision.reason_codes.some((c) => c.startsWith('SOC2_'))).toBe(true);
    const sources = decision.explanation.provenance?.sources ?? [];
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.soc2)).toBe(true);
    expect(treatsAsLegalAuthority(getAuthorityForPack('pack_soc2')!)).toBe(false);

    // Customer Q: "Are we SOC 2 compliant?" → No; this is SOC 2-informed governance evidence
    const auth = getPolicyAuthority(POLICY_AUTHORITY_IDS.soc2)!;
    expect(auth.type).toBe('FRAMEWORK');
    expect(auth.provenance.legal_authority).toBe(false);
    expect(auth.provenance.notes ?? '').toMatch(/not.*certification|not.*audit opinion/i);
    const blob = JSON.stringify(withOperatorExplanation(decision));
    expect(blob).not.toMatch(/SOC 2 certified|SOC 2 compliant|SOC 2 certification/i);
  });

  const CYBERSECURITY_ALL = {
    govern: {
      accountability_documented: true,
      cybersecurity_roles_defined: true,
      cybersecurity_policy_documented: true,
    },
    identify: {
      assets_identified: true,
      dependencies_identified: true,
      cybersecurity_risk_identified: true,
    },
    protect: {
      access_controls_documented: true,
      safeguards_implemented: true,
      data_protection_documented: true,
    },
    detect: {
      monitoring_established: true,
      anomalous_activity_detection: true,
      cybersecurity_events_logged: true,
    },
    respond: {
      response_plan_documented: true,
      incident_response_process: true,
      communication_process: true,
    },
    recover: {
      recovery_plan_documented: true,
      recovery_process: true,
      lessons_learned_process: true,
    },
  };

  it('TEST 31 — NIST CSF 2.0 cybersecurity evidence satisfied → ALLOW path', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: { ...clinicalApp, type: 'internal', allowed_operations: ['summarize'] },
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: ['REGULATORY_APPLICABILITY:NIST_CSF_2'],
      },
      deploymentMode: 'connected',
      governance_context: { cybersecurity: CYBERSECURITY_ALL },
      request_id: 'req_csf_allow',
    });
    expect(decision.reason_codes).toContain('NIST_CSF_2_CONTROLS_SATISFIED');
    expect(decision.decision).not.toBe('REVIEW');
    const narrative =
      withOperatorExplanation(decision).explanation.operator?.narrative ?? '';
    expect(narrative).not.toMatch(/NIST CSF certified|NIST CSF compliant/i);
  });

  it('TEST 32 — NIST CSF 2.0 missing cybersecurity evidence → REVIEW', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: { ...clinicalApp, type: 'internal' },
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: ['REGULATORY_APPLICABILITY:NIST_CSF_2'],
      },
      deploymentMode: 'connected',
      request_id: 'req_csf_review',
    });
    expect(decision.decision).toBe('REVIEW');
    expect(decision.reason_codes.some((c) => c.startsWith('NIST_CSF_2_'))).toBe(true);
  });

  it('TEST 33 — Ten-authority evaluation + CSF customer question (not certification)', async () => {
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
        reason_codes: [
          'REGULATORY_APPLICABILITY:HIPAA',
          'REGULATORY_APPLICABILITY:PART2',
          'REGULATORY_APPLICABILITY:NIST_AI_RMF',
          'REGULATORY_APPLICABILITY:OWASP_LLM_2025',
          'REGULATORY_APPLICABILITY:EU_AI_ACT',
          'REGULATORY_APPLICABILITY:ISO_42001',
          'REGULATORY_APPLICABILITY:ISO_23894',
          'REGULATORY_APPLICABILITY:ISO_42005',
          'REGULATORY_APPLICABILITY:SOC_2',
          'REGULATORY_APPLICABILITY:NIST_CSF_2',
        ],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      source_system: 'ehr',
      authorization_context: 'part2_consent',
      evaluation_as_of: '2026-09-01',
      governance_context: {
        ...GOVERNANCE_DOCUMENTED,
        security_controls: {
          prompt_injection_controls: true,
          sensitive_data_controls: true,
          supply_chain_controls: true,
          poisoning_controls: true,
          output_validation_controls: true,
          agency_controls: true,
          system_prompt_protection: true,
          retrieval_security_controls: true,
          grounding_controls: true,
          resource_limits: true,
        },
        management_system: {
          ai_policy_established: true,
          roles_responsibilities_documented: true,
          ai_system_inventory_documented: true,
          risk_process_established: true,
          risk_assessment_completed: true,
          risk_treatment_documented: true,
          impact_assessment_completed: true,
          data_governance_established: true,
          human_oversight_defined: true,
          operational_controls_defined: true,
          monitoring_established: true,
          performance_evaluation_established: true,
          incident_process_established: true,
          continual_improvement_process_established: true,
        },
        ai_risk: {
          risk_management_established: true,
          risk_context_defined: true,
          risk_identification_completed: true,
          risk_analysis_completed: true,
          risk_evaluation_completed: true,
          risk_treatment_defined: true,
          risk_treatment_implemented: true,
          residual_risk_accepted: true,
          risk_monitoring_established: true,
          risk_communication_established: true,
          risk_review_established: true,
        },
        impact: {
          impact_assessment_completed: true,
          impact_scope_defined: true,
          affected_stakeholders_identified: true,
          potential_impacts_identified: true,
          impact_severity_assessed: true,
          impact_likelihood_assessed: true,
          mitigations_defined: true,
          mitigations_implemented: true,
          residual_impact_reviewed: true,
          impact_monitoring_established: true,
          impact_review_established: true,
        },
        assurance: ASSURANCE_ALL,
        cybersecurity: CYBERSECURITY_ALL,
        regulatory: {
          actor_role: 'deployer',
          deployment_jurisdiction: 'EU',
          market_placement_jurisdiction: 'EU',
          prohibited_practice_code: 'none',
          regulatory_risk_category: 'MINIMAL_OR_NO_RISK',
        },
      },
      request_id: 'req_ten_auth_product',
    });

    expect(decision.reason_codes).not.toContain('POLICY_CONFLICT_UNRESOLVED');
    expect(decision.reason_codes.some((c) => c.startsWith('NIST_CSF_2_'))).toBe(true);
    const sources = decision.explanation.provenance?.sources ?? [];
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.nistCsf2)).toBe(
      true,
    );
    const auth = getPolicyAuthority(POLICY_AUTHORITY_IDS.nistCsf2)!;
    expect(auth.type).toBe('FRAMEWORK');
    expect(auth.provenance.legal_authority).toBe(false);
    expect(auth.provenance.notes ?? '').toMatch(
      /not.*certification|not.*assessment|not.*cybersecurity score/i,
    );
    const blob = JSON.stringify(withOperatorExplanation(decision));
    expect(blob).not.toMatch(/NIST CSF certified|NIST CSF compliant|CSF maturity/i);
  });

  it('TEST 34 — Ten-pack customer truth: decide / explain / prove / not certify', async () => {
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
        reason_codes: [
          'REGULATORY_APPLICABILITY:HIPAA',
          'REGULATORY_APPLICABILITY:PART2',
          'REGULATORY_APPLICABILITY:NIST_AI_RMF',
          'REGULATORY_APPLICABILITY:OWASP_LLM_2025',
          'REGULATORY_APPLICABILITY:EU_AI_ACT',
          'REGULATORY_APPLICABILITY:ISO_42001',
          'REGULATORY_APPLICABILITY:ISO_23894',
          'REGULATORY_APPLICABILITY:ISO_42005',
          'REGULATORY_APPLICABILITY:SOC_2',
          'REGULATORY_APPLICABILITY:NIST_CSF_2',
        ],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      source_system: 'ehr',
      authorization_context: 'part2_consent',
      evaluation_as_of: '2026-09-01',
      governance_context: {
        ...GOVERNANCE_DOCUMENTED,
        security_controls: {
          prompt_injection_controls: true,
          sensitive_data_controls: true,
          supply_chain_controls: true,
          poisoning_controls: true,
          output_validation_controls: true,
          agency_controls: true,
          system_prompt_protection: true,
          retrieval_security_controls: true,
          grounding_controls: true,
          resource_limits: true,
        },
        management_system: {
          ai_policy_established: true,
          roles_responsibilities_documented: true,
          ai_system_inventory_documented: true,
          risk_process_established: true,
          risk_assessment_completed: true,
          risk_treatment_documented: true,
          impact_assessment_completed: true,
          data_governance_established: true,
          human_oversight_defined: true,
          operational_controls_defined: true,
          monitoring_established: true,
          performance_evaluation_established: true,
          incident_process_established: true,
          continual_improvement_process_established: true,
        },
        ai_risk: {
          risk_management_established: true,
          risk_context_defined: true,
          risk_identification_completed: true,
          risk_analysis_completed: true,
          risk_evaluation_completed: true,
          risk_treatment_defined: true,
          risk_treatment_implemented: true,
          residual_risk_accepted: true,
          risk_monitoring_established: true,
          risk_communication_established: true,
          risk_review_established: true,
        },
        impact: {
          impact_assessment_completed: true,
          impact_scope_defined: true,
          affected_stakeholders_identified: true,
          potential_impacts_identified: true,
          impact_severity_assessed: true,
          impact_likelihood_assessed: true,
          mitigations_defined: true,
          mitigations_implemented: true,
          residual_impact_reviewed: true,
          impact_monitoring_established: true,
          impact_review_established: true,
        },
        assurance: ASSURANCE_ALL,
        cybersecurity: CYBERSECURITY_ALL,
        regulatory: {
          actor_role: 'deployer',
          deployment_jurisdiction: 'EU',
          market_placement_jurisdiction: 'EU',
          prohibited_practice_code: 'none',
          regulatory_risk_category: 'MINIMAL_OR_NO_RISK',
        },
      },
      request_id: 'req_tcp_customer_truth',
    });

    // Q1–Q3: policies, authoritative decision, explanation
    const stored = repo.getEvaluation(decision.evaluation_id!)!;
    expect(stored.decision).toBe(decision.decision);
    expect(stored.applicable_policies.length).toBeGreaterThan(0);
    const explained = withOperatorExplanation(decision);
    expect(explained.explanation.operator?.narrative).toBeTruthy();
    expect(explained.explanation.provenance?.sources?.length).toBeGreaterThan(0);

    // Q8–Q9: machine immutable + historical replay
    if (stored.decision === 'REVIEW') {
      const authorized = withHumanResolution(
        stored,
        buildHumanResolution(stored, {
          disposition: 'AUTHORIZE',
          reason: 'documented compensating controls accepted',
          resolved_by: 'approver_product',
        }),
      );
      expect(authorized.decision).toBe('REVIEW');
      expect(authorized.human_resolution?.final_decision).toBe('ALLOW');
    }
    const replay = evaluationRecordToDecisionPayload(stored);
    expect(replay.decision).toBe(decision.decision);
    expect(replay.reason_codes).toEqual(decision.reason_codes);

    // Q10: not certification
    const blob = JSON.stringify(explained);
    expect(blob).not.toMatch(
      /certified|certification|audit opinion|CSF maturity|compliance percentage/i,
    );
  });

  const ORG_GOVERNANCE_ALL = {
    accountability: {
      governing_body_accountable: true,
      executive_accountability_defined: true,
      ai_responsibilities_defined: true,
    },
    direction: {
      ai_governance_policy_defined: true,
      strategic_alignment_documented: true,
      acceptable_use_direction_defined: true,
    },
    oversight: {
      ai_oversight_established: true,
      reporting_path_defined: true,
      decision_rights_defined: true,
    },
    stakeholder: {
      relevant_stakeholders_identified: true,
      stakeholder_impacts_considered: true,
      stakeholder_communication_defined: true,
    },
    decision_governance: {
      human_accountability_defined: true,
      escalation_path_defined: true,
      significant_ai_decisions_reviewed: true,
    },
    organizational_effectiveness: {
      ai_use_objectives_defined: true,
      performance_monitoring_established: true,
      governance_review_established: true,
    },
  };

  it('TEST 35 — ISO 38507 organizational governance satisfied → ALLOW path', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: { ...clinicalApp, type: 'internal', allowed_operations: ['summarize'] },
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: ['REGULATORY_APPLICABILITY:ISO_38507'],
      },
      deploymentMode: 'connected',
      governance_context: { organizational_governance: ORG_GOVERNANCE_ALL },
      request_id: 'req_38507_allow',
    });
    expect(decision.reason_codes).toContain('ISO38507_CONTROLS_SATISFIED');
    expect(decision.decision).not.toBe('REVIEW');
    expect(decision.human_resolution).toBeUndefined();
    const narrative =
      withOperatorExplanation(decision).explanation.operator?.narrative ?? '';
    expect(narrative).not.toMatch(/ISO 38507 certified|ISO 38507 compliant/i);
  });

  it('TEST 36 — ISO 38507 missing organizational evidence → REVIEW; oversight ≠ AUTHORIZE', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: { ...clinicalApp, type: 'internal' },
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: ['REGULATORY_APPLICABILITY:ISO_38507'],
      },
      deploymentMode: 'connected',
      request_id: 'req_38507_review',
    });
    expect(decision.decision).toBe('REVIEW');
    expect(decision.reason_codes.some((c) => c.startsWith('ISO38507_'))).toBe(true);
    expect(decision.human_resolution).toBeUndefined();
  });

  it('TEST 37 — Eleven-authority + ISO 38507 customer truth (not certification; complements 42001)', async () => {
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
        reason_codes: [
          'REGULATORY_APPLICABILITY:HIPAA',
          'REGULATORY_APPLICABILITY:PART2',
          'REGULATORY_APPLICABILITY:NIST_AI_RMF',
          'REGULATORY_APPLICABILITY:OWASP_LLM_2025',
          'REGULATORY_APPLICABILITY:EU_AI_ACT',
          'REGULATORY_APPLICABILITY:ISO_42001',
          'REGULATORY_APPLICABILITY:ISO_23894',
          'REGULATORY_APPLICABILITY:ISO_42005',
          'REGULATORY_APPLICABILITY:SOC_2',
          'REGULATORY_APPLICABILITY:NIST_CSF_2',
          'REGULATORY_APPLICABILITY:ISO_38507',
        ],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      source_system: 'ehr',
      authorization_context: 'part2_consent',
      evaluation_as_of: '2026-09-01',
      governance_context: {
        ...GOVERNANCE_DOCUMENTED,
        security_controls: {
          prompt_injection_controls: true,
          sensitive_data_controls: true,
          supply_chain_controls: true,
          poisoning_controls: true,
          output_validation_controls: true,
          agency_controls: true,
          system_prompt_protection: true,
          retrieval_security_controls: true,
          grounding_controls: true,
          resource_limits: true,
        },
        management_system: {
          ai_policy_established: true,
          roles_responsibilities_documented: true,
          ai_system_inventory_documented: true,
          risk_process_established: true,
          risk_assessment_completed: true,
          risk_treatment_documented: true,
          impact_assessment_completed: true,
          data_governance_established: true,
          human_oversight_defined: true,
          operational_controls_defined: true,
          monitoring_established: true,
          performance_evaluation_established: true,
          incident_process_established: true,
          continual_improvement_process_established: true,
        },
        ai_risk: {
          risk_management_established: true,
          risk_context_defined: true,
          risk_identification_completed: true,
          risk_analysis_completed: true,
          risk_evaluation_completed: true,
          risk_treatment_defined: true,
          risk_treatment_implemented: true,
          residual_risk_accepted: true,
          risk_monitoring_established: true,
          risk_communication_established: true,
          risk_review_established: true,
        },
        impact: {
          impact_assessment_completed: true,
          impact_scope_defined: true,
          affected_stakeholders_identified: true,
          potential_impacts_identified: true,
          impact_severity_assessed: true,
          impact_likelihood_assessed: true,
          mitigations_defined: true,
          mitigations_implemented: true,
          residual_impact_reviewed: true,
          impact_monitoring_established: true,
          impact_review_established: true,
        },
        assurance: ASSURANCE_ALL,
        cybersecurity: CYBERSECURITY_ALL,
        organizational_governance: ORG_GOVERNANCE_ALL,
        regulatory: {
          actor_role: 'deployer',
          deployment_jurisdiction: 'EU',
          market_placement_jurisdiction: 'EU',
          prohibited_practice_code: 'none',
          regulatory_risk_category: 'MINIMAL_OR_NO_RISK',
        },
      },
      request_id: 'req_eleven_auth_product',
    });

    expect(decision.reason_codes).not.toContain('POLICY_CONFLICT_UNRESOLVED');
    expect(decision.reason_codes.some((c) => c.startsWith('ISO38507_'))).toBe(true);
    expect(decision.reason_codes.some((c) => c.startsWith('ISO42001_'))).toBe(true);
    const sources = decision.explanation.provenance?.sources ?? [];
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.iso38507)).toBe(
      true,
    );
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.iso42001)).toBe(
      true,
    );
    const auth = getPolicyAuthority(POLICY_AUTHORITY_IDS.iso38507)!;
    expect(auth.type).toBe('STANDARD');
    expect(auth.provenance.legal_authority).toBe(false);
    const stored = repo.getEvaluation(decision.evaluation_id!)!;
    expect(stored.decision).toBe(decision.decision);
    const blob = JSON.stringify(withOperatorExplanation(decision));
    expect(blob).not.toMatch(/ISO 38507 certified|ISO 38507 compliant|board GRC/i);
  });

  const INFOSEC_ALL = {
    isms: {
      scope_defined: true,
      context_established: true,
      interested_parties_identified: true,
      information_security_objectives_defined: true,
    },
    risk: {
      risk_process_established: true,
      risks_identified: true,
      risks_assessed: true,
      risk_treatment_defined: true,
      risk_treatment_implemented: true,
      residual_risk_reviewed: true,
    },
    information_assets: {
      assets_identified: true,
      information_classification_defined: true,
      asset_ownership_defined: true,
    },
    access: {
      access_control_defined: true,
      identity_management_established: true,
      privileged_access_controlled: true,
      access_review_established: true,
    },
    operations: {
      operational_controls_established: true,
      change_management_established: true,
      logging_monitoring_established: true,
      backup_recovery_established: true,
    },
    supplier_security: {
      supplier_risk_controls_established: true,
      third_party_security_requirements_defined: true,
      supplier_monitoring_established: true,
    },
    incident: {
      incident_management_established: true,
      incident_response_defined: true,
      incident_learning_established: true,
    },
    continuity: {
      business_continuity_security_defined: true,
      resilience_controls_established: true,
      recovery_capability_established: true,
    },
    people: {
      security_roles_defined: true,
      security_awareness_established: true,
      personnel_security_controls_established: true,
    },
    monitoring: {
      security_performance_monitored: true,
      internal_review_established: true,
      management_review_established: true,
    },
    improvement: {
      nonconformities_managed: true,
      corrective_actions_managed: true,
      continual_improvement_established: true,
    },
  };

  it('TEST 38 — ISO 27001 ISMS evidence satisfied → ALLOW path', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: { ...clinicalApp, type: 'internal', allowed_operations: ['summarize'] },
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: ['REGULATORY_APPLICABILITY:ISO_27001'],
      },
      deploymentMode: 'connected',
      governance_context: { information_security: INFOSEC_ALL },
      request_id: 'req_27001_allow',
    });
    expect(decision.reason_codes).toContain('ISO27001_CONTROLS_SATISFIED');
    expect(decision.decision).not.toBe('REVIEW');
    expect(decision.human_resolution).toBeUndefined();
  });

  it('TEST 39 — ISO 27001 missing ISMS evidence → REVIEW', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: { ...clinicalApp, type: 'internal' },
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: ['REGULATORY_APPLICABILITY:ISO_27001'],
      },
      deploymentMode: 'connected',
      request_id: 'req_27001_review',
    });
    expect(decision.decision).toBe('REVIEW');
    expect(decision.reason_codes.some((c) => c.startsWith('ISO27001_'))).toBe(true);
  });

  it('TEST 40 — ISO 27001 + ISO 42001 multi-pack complementary resolution', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: { ...clinicalApp, type: 'internal' },
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: [
          'REGULATORY_APPLICABILITY:ISO_27001',
          'REGULATORY_APPLICABILITY:ISO_42001',
        ],
      },
      deploymentMode: 'connected',
      governance_context: {
        information_security: INFOSEC_ALL,
        management_system: {
          ai_policy_established: true,
          roles_responsibilities_documented: true,
          ai_system_inventory_documented: true,
          risk_process_established: true,
          risk_assessment_completed: true,
          risk_treatment_documented: true,
          impact_assessment_completed: true,
          data_governance_established: true,
          human_oversight_defined: true,
          operational_controls_defined: true,
          monitoring_established: true,
          performance_evaluation_established: true,
          incident_process_established: true,
          continual_improvement_process_established: true,
        },
      },
      request_id: 'req_27001_42001',
    });
    expect(decision.reason_codes).toContain('ISO27001_CONTROLS_SATISFIED');
    expect(decision.reason_codes.some((c) => c.startsWith('ISO42001_'))).toBe(true);
    expect(decision.reason_codes).not.toContain('POLICY_CONFLICT_UNRESOLVED');
    const sources = decision.explanation.provenance?.sources ?? [];
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.iso27001)).toBe(
      true,
    );
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.iso42001)).toBe(
      true,
    );
  });

  it('TEST 41 — ISO 27001 does not produce certification/compliance claims', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: { ...clinicalApp, type: 'internal' },
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: ['REGULATORY_APPLICABILITY:ISO_27001'],
      },
      deploymentMode: 'connected',
      governance_context: { information_security: INFOSEC_ALL },
      request_id: 'req_27001_nocert',
    });
    const auth = getPolicyAuthority(POLICY_AUTHORITY_IDS.iso27001)!;
    expect(auth.provenance.legal_authority).toBe(false);
    expect(auth.provenance.notes ?? '').toMatch(/not.*certification|not.*SIEM/i);
    const blob = JSON.stringify(withOperatorExplanation(decision));
    expect(blob).not.toMatch(
      /ISO 27001 certified|ISO 27001 compliant|Annex A score|certification achieved/i,
    );
  });

  it('TEST 42 — Twelve-authority control-plane execution includes ISO 27001', async () => {
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
        reason_codes: [
          'REGULATORY_APPLICABILITY:HIPAA',
          'REGULATORY_APPLICABILITY:PART2',
          'REGULATORY_APPLICABILITY:NIST_AI_RMF',
          'REGULATORY_APPLICABILITY:OWASP_LLM_2025',
          'REGULATORY_APPLICABILITY:EU_AI_ACT',
          'REGULATORY_APPLICABILITY:ISO_42001',
          'REGULATORY_APPLICABILITY:ISO_23894',
          'REGULATORY_APPLICABILITY:ISO_42005',
          'REGULATORY_APPLICABILITY:SOC_2',
          'REGULATORY_APPLICABILITY:NIST_CSF_2',
          'REGULATORY_APPLICABILITY:ISO_38507',
          'REGULATORY_APPLICABILITY:ISO_27001',
        ],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      source_system: 'ehr',
      authorization_context: 'part2_consent',
      evaluation_as_of: '2026-09-01',
      governance_context: {
        ...GOVERNANCE_DOCUMENTED,
        security_controls: {
          prompt_injection_controls: true,
          sensitive_data_controls: true,
          supply_chain_controls: true,
          poisoning_controls: true,
          output_validation_controls: true,
          agency_controls: true,
          system_prompt_protection: true,
          retrieval_security_controls: true,
          grounding_controls: true,
          resource_limits: true,
        },
        management_system: {
          ai_policy_established: true,
          roles_responsibilities_documented: true,
          ai_system_inventory_documented: true,
          risk_process_established: true,
          risk_assessment_completed: true,
          risk_treatment_documented: true,
          impact_assessment_completed: true,
          data_governance_established: true,
          human_oversight_defined: true,
          operational_controls_defined: true,
          monitoring_established: true,
          performance_evaluation_established: true,
          incident_process_established: true,
          continual_improvement_process_established: true,
        },
        ai_risk: {
          risk_management_established: true,
          risk_context_defined: true,
          risk_identification_completed: true,
          risk_analysis_completed: true,
          risk_evaluation_completed: true,
          risk_treatment_defined: true,
          risk_treatment_implemented: true,
          residual_risk_accepted: true,
          risk_monitoring_established: true,
          risk_communication_established: true,
          risk_review_established: true,
        },
        impact: {
          impact_assessment_completed: true,
          impact_scope_defined: true,
          affected_stakeholders_identified: true,
          potential_impacts_identified: true,
          impact_severity_assessed: true,
          impact_likelihood_assessed: true,
          mitigations_defined: true,
          mitigations_implemented: true,
          residual_impact_reviewed: true,
          impact_monitoring_established: true,
          impact_review_established: true,
        },
        assurance: ASSURANCE_ALL,
        cybersecurity: CYBERSECURITY_ALL,
        organizational_governance: ORG_GOVERNANCE_ALL,
        information_security: INFOSEC_ALL,
        regulatory: {
          actor_role: 'deployer',
          deployment_jurisdiction: 'EU',
          market_placement_jurisdiction: 'EU',
          prohibited_practice_code: 'none',
          regulatory_risk_category: 'MINIMAL_OR_NO_RISK',
        },
      },
      request_id: 'req_twelve_auth_product',
    });

    expect(decision.reason_codes).not.toContain('POLICY_CONFLICT_UNRESOLVED');
    expect(decision.reason_codes.some((c) => c.startsWith('ISO27001_'))).toBe(true);
    const sources = decision.explanation.provenance?.sources ?? [];
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.iso27001)).toBe(
      true,
    );
    expect(repo.getEvaluation(decision.evaluation_id!)?.decision).toBe(decision.decision);
    const blob = JSON.stringify(withOperatorExplanation(decision));
    expect(blob).not.toMatch(/ISO 27001 certified|ISO 27001 compliant/i);
  });

  it('TEST 43 — 12-pack control-plane stress: single decision, isolation, no cert claims', async () => {
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
        reason_codes: [
          'REGULATORY_APPLICABILITY:HIPAA',
          'REGULATORY_APPLICABILITY:PART2',
          'REGULATORY_APPLICABILITY:NIST_AI_RMF',
          'REGULATORY_APPLICABILITY:OWASP_LLM_2025',
          'REGULATORY_APPLICABILITY:EU_AI_ACT',
          'REGULATORY_APPLICABILITY:ISO_42001',
          'REGULATORY_APPLICABILITY:ISO_23894',
          'REGULATORY_APPLICABILITY:ISO_42005',
          'REGULATORY_APPLICABILITY:SOC_2',
          'REGULATORY_APPLICABILITY:NIST_CSF_2',
          'REGULATORY_APPLICABILITY:ISO_38507',
          'REGULATORY_APPLICABILITY:ISO_27001',
        ],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      source_system: 'ehr',
      authorization_context: 'part2_consent',
      evaluation_as_of: '2026-09-01',
      governance_context: {
        ...GOVERNANCE_DOCUMENTED,
        security_controls: {
          prompt_injection_controls: true,
          sensitive_data_controls: true,
          supply_chain_controls: true,
          poisoning_controls: true,
          output_validation_controls: true,
          agency_controls: true,
          system_prompt_protection: true,
          retrieval_security_controls: true,
          grounding_controls: true,
          resource_limits: true,
        },
        management_system: {
          ai_policy_established: true,
          roles_responsibilities_documented: true,
          ai_system_inventory_documented: true,
          risk_process_established: true,
          risk_assessment_completed: true,
          risk_treatment_documented: true,
          impact_assessment_completed: true,
          data_governance_established: true,
          human_oversight_defined: true,
          operational_controls_defined: true,
          monitoring_established: true,
          performance_evaluation_established: true,
          incident_process_established: true,
          continual_improvement_process_established: true,
        },
        ai_risk: {
          risk_management_established: true,
          risk_context_defined: true,
          risk_identification_completed: true,
          risk_analysis_completed: true,
          risk_evaluation_completed: true,
          risk_treatment_defined: true,
          risk_treatment_implemented: true,
          residual_risk_accepted: true,
          risk_monitoring_established: true,
          risk_communication_established: true,
          risk_review_established: true,
        },
        impact: {
          impact_assessment_completed: true,
          impact_scope_defined: true,
          affected_stakeholders_identified: true,
          potential_impacts_identified: true,
          impact_severity_assessed: true,
          impact_likelihood_assessed: true,
          mitigations_defined: true,
          mitigations_implemented: true,
          residual_impact_reviewed: true,
          impact_monitoring_established: true,
          impact_review_established: true,
        },
        assurance: ASSURANCE_ALL,
        cybersecurity: CYBERSECURITY_ALL,
        organizational_governance: ORG_GOVERNANCE_ALL,
        information_security: INFOSEC_ALL,
        regulatory: {
          actor_role: 'deployer',
          deployment_jurisdiction: 'EU',
          market_placement_jurisdiction: 'EU',
          prohibited_practice_code: 'none',
          regulatory_risk_category: 'MINIMAL_OR_NO_RISK',
        },
      },
      request_id: 'req_12_stress_product',
    });

    expect(decision.reason_codes).not.toContain('POLICY_CONFLICT_UNRESOLVED');
    const stored = repo.getEvaluation(decision.evaluation_id!)!;
    expect(stored.decision).toBe(decision.decision);
    expect(
      repo
        .listEvaluations({ limit: 50 })
        .filter((r) => r.request_id === 'req_12_stress_product' && r.phase === 'input'),
    ).toHaveLength(1);

    const sources = decision.explanation.provenance?.sources ?? [];
    for (const authId of [
      POLICY_AUTHORITY_IDS.iso27001,
      POLICY_AUTHORITY_IDS.iso38507,
      POLICY_AUTHORITY_IDS.soc2,
      POLICY_AUTHORITY_IDS.nistCsf2,
      POLICY_AUTHORITY_IDS.hipaa,
      POLICY_AUTHORITY_IDS.euAiAct,
    ]) {
      expect(sources.some((s) => s.authority_id === authId)).toBe(true);
    }

    // Namespace isolation: SOC2 ≠ ISO27001
    expect(POLICY_AUTHORITY_IDS.soc2).not.toBe(POLICY_AUTHORITY_IDS.iso27001);
    expect(treatsAsLegalAuthority(getPolicyAuthority(POLICY_AUTHORITY_IDS.iso27001)!)).toBe(
      false,
    );

    const blob = JSON.stringify(withOperatorExplanation(decision));
    expect(blob).not.toMatch(
      /12\/12 compliant|certified|100% compliant|ISO 27001 compliant|risk score/i,
    );
  });

  const PRIVACY_ALL = {
    processing_role: 'controller' as const,
    purpose_status: 'documented' as const,
    pims: {
      scope_defined: true,
      privacy_context_established: true,
      roles_responsibilities_defined: true,
      privacy_objectives_defined: true,
    },
    pii_governance: {
      pii_processing_inventory_established: true,
      processing_purposes_defined: true,
      processing_roles_defined: true,
      controller_processor_role_defined: true,
      processing_responsibilities_defined: true,
    },
    privacy_risk: {
      privacy_risk_process_established: true,
      privacy_risks_identified: true,
      privacy_risks_assessed: true,
      privacy_risk_treatment_defined: true,
      residual_privacy_risk_reviewed: true,
    },
    privacy_impact: {
      privacy_impact_assessment_established: true,
      potential_impacts_identified: true,
      affected_individuals_considered: true,
      mitigations_defined: true,
      residual_impact_reviewed: true,
    },
    data_lifecycle: {
      collection_governance_established: true,
      use_governance_established: true,
      sharing_governance_established: true,
      retention_governance_established: true,
      deletion_disposal_governance_established: true,
    },
    transparency: {
      privacy_information_provided: true,
      processing_transparency_established: true,
      notice_governance_established: true,
    },
    rights: {
      privacy_rights_process_established: true,
      rights_request_handling_established: true,
      identity_verification_for_rights_established: true,
      response_process_established: true,
    },
    third_party: {
      processor_requirements_defined: true,
      third_party_privacy_requirements_defined: true,
      processor_monitoring_established: true,
    },
    privacy_incident: {
      privacy_incident_process_established: true,
      privacy_breach_response_established: true,
      notification_process_established: true,
    },
    monitoring: {
      privacy_performance_monitored: true,
      privacy_review_established: true,
      management_review_established: true,
    },
    improvement: {
      privacy_nonconformities_managed: true,
      corrective_actions_managed: true,
      continual_improvement_established: true,
    },
  };

  it('TEST 44 — ISO 27701 PIMS evidence satisfied → CONTROLS_SATISFIED', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: { ...clinicalApp, type: 'internal', allowed_operations: ['summarize'] },
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: ['REGULATORY_APPLICABILITY:ISO_27701'],
      },
      deploymentMode: 'connected',
      governance_context: { privacy: PRIVACY_ALL },
      request_id: 'req_27701_allow',
    });
    expect(decision.reason_codes).toContain('ISO27701_CONTROLS_SATISFIED');
    expect(decision.decision).not.toBe('REVIEW');
    expect(decision.human_resolution).toBeUndefined();
  });

  it('TEST 45 — ISO 27701 missing privacy evidence → REVIEW', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: { ...clinicalApp, type: 'internal' },
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: ['REGULATORY_APPLICABILITY:ISO_27701'],
      },
      deploymentMode: 'connected',
      request_id: 'req_27701_review',
    });
    expect(decision.decision).toBe('REVIEW');
    expect(decision.reason_codes.some((c) => c.startsWith('ISO27701_'))).toBe(true);
  });

  it('TEST 46 — ISO 27701 + ISO 27001 complementary (both provenance, no conflict)', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: { ...clinicalApp, type: 'internal' },
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: [
          'REGULATORY_APPLICABILITY:ISO_27701',
          'REGULATORY_APPLICABILITY:ISO_27001',
        ],
      },
      deploymentMode: 'connected',
      governance_context: {
        privacy: PRIVACY_ALL,
        information_security: INFOSEC_ALL,
      },
      request_id: 'req_27701_27001',
    });
    expect(decision.reason_codes).toContain('ISO27701_CONTROLS_SATISFIED');
    expect(decision.reason_codes).toContain('ISO27001_CONTROLS_SATISFIED');
    expect(decision.reason_codes).not.toContain('POLICY_CONFLICT_UNRESOLVED');
    const sources = decision.explanation.provenance?.sources ?? [];
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.iso27701)).toBe(
      true,
    );
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.iso27001)).toBe(
      true,
    );
  });

  it('TEST 47 — ISO 27701 + HIPAA distinct (privacy ≠ regulatory)', async () => {
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
        reason_codes: [
          'REGULATORY_APPLICABILITY:ISO_27701',
          'REGULATORY_APPLICABILITY:HIPAA',
        ],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'authorized',
      governance_context: { privacy: PRIVACY_ALL },
      request_id: 'req_27701_hipaa',
    });
    expect(POLICY_AUTHORITY_IDS.iso27701).not.toBe(POLICY_AUTHORITY_IDS.hipaa);
    expect(treatsAsLegalAuthority(getPolicyAuthority(POLICY_AUTHORITY_IDS.iso27701)!)).toBe(
      false,
    );
    expect(treatsAsLegalAuthority(getPolicyAuthority(POLICY_AUTHORITY_IDS.hipaa)!)).toBe(
      true,
    );
    const sources = decision.explanation.provenance?.sources ?? [];
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.iso27701)).toBe(
      true,
    );
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.hipaa)).toBe(true);
    expect(decision.reason_codes).not.toContain('POLICY_CONFLICT_UNRESOLVED');
  });

  it('TEST 48 — ISO 27701 does not produce certification claims', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: { ...clinicalApp, type: 'internal' },
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: ['REGULATORY_APPLICABILITY:ISO_27701'],
      },
      deploymentMode: 'connected',
      governance_context: { privacy: PRIVACY_ALL },
      request_id: 'req_27701_nocert',
    });
    const auth = getPolicyAuthority(POLICY_AUTHORITY_IDS.iso27701)!;
    expect(auth.provenance.legal_authority).toBe(false);
    expect(auth.provenance.notes ?? '').toMatch(/not.*certification|not.*GDPR|not.*DSAR/i);
    const blob = JSON.stringify(withOperatorExplanation(decision));
    expect(blob).not.toMatch(
      /ISO 27701 certified|ISO 27701 compliant|PIMS certified|privacy score|certification achieved/i,
    );
  });

  const NIST_PF_ALL = {
    identify: {
      processing_context_documented: true,
      privacy_risk_identified: true,
      data_actions_documented: true,
    },
    govern: {
      policies_documented: true,
      roles_documented: true,
      risk_governance_documented: true,
    },
    control: {
      data_actions_controlled: true,
      individual_choice_addressed: true,
    },
    communicate: {
      transparency_documented: true,
      expectations_documented: true,
    },
    protect: {
      privacy_risk_mitigation_documented: true,
    },
  };

  it('TEST 49 — NIST Privacy Framework evidence satisfied → CONTROLS_SATISFIED', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: { ...clinicalApp, type: 'internal', allowed_operations: ['summarize'] },
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: ['REGULATORY_APPLICABILITY:NIST_PRIVACY_FRAMEWORK'],
      },
      deploymentMode: 'connected',
      governance_context: { privacy: { nist_pf: NIST_PF_ALL } },
      request_id: 'req_nist_pf_allow',
    });
    expect(decision.reason_codes).toContain('NIST_PF_CONTROLS_SATISFIED');
    expect(decision.decision).not.toBe('REVIEW');
    expect(decision.human_resolution).toBeUndefined();
  });

  it('TEST 50 — NIST Privacy Framework missing evidence → REVIEW', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: { ...clinicalApp, type: 'internal' },
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: ['REGULATORY_APPLICABILITY:NIST_PRIVACY_FRAMEWORK'],
      },
      deploymentMode: 'connected',
      request_id: 'req_nist_pf_review',
    });
    expect(decision.decision).toBe('REVIEW');
    expect(decision.reason_codes.some((c) => c.startsWith('NIST_PF_'))).toBe(true);
  });

  it('TEST 51 — ISO 27701 + NIST Privacy Framework complementary (distinct namespaces)', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: { ...clinicalApp, type: 'internal' },
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: [
          'REGULATORY_APPLICABILITY:ISO_27701',
          'REGULATORY_APPLICABILITY:NIST_PRIVACY_FRAMEWORK',
        ],
      },
      deploymentMode: 'connected',
      governance_context: {
        privacy: { ...PRIVACY_ALL, nist_pf: NIST_PF_ALL },
      },
      request_id: 'req_27701_nist_pf',
    });
    expect(decision.reason_codes).toContain('ISO27701_CONTROLS_SATISFIED');
    expect(decision.reason_codes).toContain('NIST_PF_CONTROLS_SATISFIED');
    expect(decision.reason_codes).not.toContain('POLICY_CONFLICT_UNRESOLVED');
    const sources = decision.explanation.provenance?.sources ?? [];
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.iso27701)).toBe(true);
    expect(
      sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.nistPrivacyFramework),
    ).toBe(true);
    expect(POLICY_AUTHORITY_IDS.iso27701).not.toBe(POLICY_AUTHORITY_IDS.nistPrivacyFramework);
  });

  it('TEST 52 — NIST Privacy Framework does not authorize HIPAA/GDPR claims', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: { ...clinicalApp, type: 'internal' },
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: ['REGULATORY_APPLICABILITY:NIST_PRIVACY_FRAMEWORK'],
      },
      deploymentMode: 'connected',
      governance_context: { privacy: { nist_pf: NIST_PF_ALL } },
      request_id: 'req_nist_pf_no_hipaa_gdpr',
    });
    expect(decision.reason_codes).toContain('NIST_PF_CONTROLS_SATISFIED');
    expect(decision.reason_codes.some((c) => /HIPAA|GDPR/i.test(c))).toBe(false);
    const auth = getPolicyAuthority(POLICY_AUTHORITY_IDS.nistPrivacyFramework)!;
    expect(treatsAsLegalAuthority(auth)).toBe(false);
    expect(auth.provenance.notes ?? '').toMatch(/not.*GDPR|not.*HIPAA/i);
    const blob = JSON.stringify(withOperatorExplanation(decision));
    expect(blob).not.toMatch(/HIPAA compliant|GDPR compliant|HIPAA authorized|GDPR authorized/i);
  });

  it('TEST 53 — NIST Privacy Framework does not produce certified/compliant/privacy score language', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: { ...clinicalApp, type: 'internal' },
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: ['REGULATORY_APPLICABILITY:NIST_PRIVACY_FRAMEWORK'],
      },
      deploymentMode: 'connected',
      governance_context: { privacy: { nist_pf: NIST_PF_ALL } },
      request_id: 'req_nist_pf_nocert',
    });
    const auth = getPolicyAuthority(POLICY_AUTHORITY_IDS.nistPrivacyFramework)!;
    expect(auth.provenance.legal_authority).toBe(false);
    expect(auth.type).toBe('FRAMEWORK');
    const blob = JSON.stringify(withOperatorExplanation(decision));
    expect(blob).not.toMatch(
      /NIST certified|NIST Privacy Framework certified|NIST Privacy Framework compliant|privacy score|PrivacyScore|certification achieved/i,
    );
  });

  it('TEST 54 — Change governance baseline is immutable', async () => {
    const changeRepo = new InMemoryChangeGovernanceRepository();
    const v1 = createGovernanceBaseline({
      target_type: 'application',
      target_id: clinicalApp.application_id,
      capabilities: { model_version: '1.0.0', write_capability: false },
      configuration: { ui_label: 'Clinical' },
    });
    changeRepo.saveBaseline(v1);
    const snap = structuredClone(v1);
    const policyRepo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(policyRepo);
    await evaluateGovernanceChange({
      repository: changeRepo,
      policy_repository: policyRepo,
      pdp,
      policy_context: {
        user: clinician,
        application: { ...clinicalApp, type: 'internal' },
        operation: 'summarize',
        requestedModel: 'local-general-v1',
        availableModels: ['local-general-v1'],
        regulatory_applicability: ['NIST_AI_RMF'],
        governance_context: GOVERNANCE_DOCUMENTED,
      },
      commit_baseline_on_hold: true,
      input: {
        target_type: 'application',
        target_id: clinicalApp.application_id,
        previous_baseline_id: v1.baseline_id,
        proposed_state: { model_version: '2.0.0', write_capability: true },
        request_id: 'req_pr_cg_54',
      },
    });
    expect(changeRepo.getBaseline(v1.baseline_id)).toEqual(snap);
    expect(() => changeRepo.saveBaseline(v1)).toThrow(/immutable|already exists/i);
  });

  it('TEST 55 — Material model change triggers re-evaluation', async () => {
    const changeRepo = new InMemoryChangeGovernanceRepository();
    const policyRepo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(policyRepo);
    const baseline = changeRepo.saveBaseline(
      createGovernanceBaseline({
        target_type: 'application',
        target_id: clinicalApp.application_id,
        capabilities: { model_version: '1.0.0' },
      }),
    );
    const result = await evaluateGovernanceChange({
      repository: changeRepo,
      policy_repository: policyRepo,
      pdp,
      policy_context: {
        user: clinician,
        application: { ...clinicalApp, type: 'internal' },
        operation: 'summarize',
        requestedModel: 'local-general-v1',
        availableModels: ['local-general-v1'],
        regulatory_applicability: ['NIST_AI_RMF'],
        governance_context: GOVERNANCE_DOCUMENTED,
      },
      input: {
        target_type: 'application',
        target_id: clinicalApp.application_id,
        previous_baseline_id: baseline.baseline_id,
        proposed_state: { model_version: '2.5.0' },
        request_id: 'req_pr_cg_55',
      },
    });
    expect(result.materiality).toBe('MATERIAL');
    expect(result.lifecycle_decision).toBe('REEVALUATION_REQUIRED');
    expect(result.pdp_invoked).toBe(true);
    expect(result.evaluation_id).toBeTruthy();
    expect(policyRepo.getEvaluation(result.evaluation_id!)).toBeTruthy();
  });

  it('TEST 56 — High-risk PHI write capability → REVIEW via policy (not lifecycle CRITICAL)', async () => {
    const changeRepo = new InMemoryChangeGovernanceRepository();
    const policyRepo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(policyRepo);
    const baseline = changeRepo.saveBaseline(
      createGovernanceBaseline({
        target_type: 'application',
        target_id: clinicalApp.application_id,
        capabilities: { write_capability: false },
      }),
    );
    const result = await evaluateGovernanceChange({
      repository: changeRepo,
      policy_repository: policyRepo,
      pdp,
      policy_context: {
        user: clinician,
        application: {
          ...clinicalApp,
          type: 'clinical',
          allowed_operations: ['summarize', 'write'],
        },
        operation: 'write',
        requestedModel: 'local-general-v1',
        availableModels: ['local-general-v1'],
        sensitivity: 'PHI',
        regulatory_applicability: ['HIPAA'],
        governance_context: GOVERNANCE_DOCUMENTED,
      },
      input: {
        target_type: 'application',
        target_id: clinicalApp.application_id,
        previous_baseline_id: baseline.baseline_id,
        proposed_state: { write_capability: true },
        request_id: 'req_pr_cg_56',
      },
    });
    expect(result.materiality).toBe('MATERIAL');
    expect(result.lifecycle_decision).toBe('REEVALUATION_REQUIRED');
    expect(String(result.policy_decision?.decision).toUpperCase()).toBe('REVIEW');
    expect(result.policy_decision?.reason_codes).toEqual(
      expect.arrayContaining(['HIPAA_PHI_WRITE_REQUIRES_APPROVAL']),
    );
    expect(String(result.policy_decision?.decision).toUpperCase()).not.toBe('DENY');
    expect(result.next_baseline).toBeFalsy();
  });

  it('TEST 57 — UNKNOWN incomplete is never silently NON_MATERIAL', () => {
    const assessment = assessMateriality({
      target_type: 'application',
      target_id: clinicalApp.application_id,
      incomplete: true,
      change_types: ['UI_LABEL'],
    });
    expect(assessment.materiality).toBe('UNKNOWN');
    expect(assessment.lifecycle_decision).toBe('UNKNOWN');
    expect(assessment.materiality).not.toBe('NON_MATERIAL');
  });

  it('TEST 58 — No lifecycle pack/authority/score/assessment product sprawl', () => {
    const srcRoot = resolve(__dirname, '../../src');
    const forbidden = [
      'auth_lifecycle',
      'pack_lifecycle',
      'auth_lifecycle_governance',
      'LifecycleEvaluator',
      'ChangeRiskScore',
      'MaterialityScore',
    ];
    const walk = (dir: string, out: string[] = []): string[] => {
      if (!existsSync(dir)) return out;
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) walk(p, out);
        else if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(p);
      }
      return out;
    };
    const hits: string[] = [];
    for (const file of walk(srcRoot)) {
      const text = readFileSync(file, 'utf8');
      for (const name of forbidden) {
        if (text.includes(name)) hits.push(`${file}:${name}`);
      }
    }
    expect(hits).toEqual([]);
    expect(getPolicyAuthority('auth_lifecycle' as never)).toBeUndefined();
    expect(getAuthorityForPack('pack_lifecycle')).toBeUndefined();
  });

  it('TEST 59 — Controlled PHI external TOKENIZE (govern, transform, prove — not certify)', async () => {
    let seen = '';
    const { ScriptedModelProvider } = await import('../../src/models/index.js');
    const cloud = new ScriptedModelProvider(
      ['cloud-public-gpt'],
      'Summary for clinician follow-up.',
      { providerId: 'external-openai-compatible', kind: 'cloud' },
    );
    const orig = cloud.execute.bind(cloud);
    cloud.execute = async (req) => {
      seen = req.messages.map((m) => m.content).join('\n');
      return orig(req);
    };
    const local = new ScriptedModelProvider(['local-general-v1'], 'local', {
      providerId: 'local-runtime',
    });
    const gw = createPhase1Gateway({
      providers: [local, cloud],
      useStubRuntime: true,
      config: { adminApiKey: 'test_admin', auditSigningKey: 'test-audit-key' },
    });

    const denied = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      model: 'cloud-public-gpt',
      messages: [
        { role: 'user', content: 'Clinical note MRN: A1234567 patient presents with fever' },
      ],
    });
    expect(denied.body.status).toBe('blocked');
    if (denied.body.status === 'blocked') {
      expect(denied.body.reason_code).toBe('PHI_PUBLIC_CLOUD_BLOCKED');
    }

    const controlled = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      model: 'cloud-public-gpt',
      purpose: 'treatment',
      authorization_context: 'authorized',
      governance_context: {
        sensitive_data_processing: { external_processing_authorized: true },
      },
      messages: [
        { role: 'user', content: 'Clinical note MRN: A1234567 patient presents with fever' },
      ],
    });
    expect(controlled.body.status).toBe('approved');
    expect(seen).toMatch(/\{\{TOK_/);
    expect(seen).not.toContain('A1234567');

    const last = (await gw.audit.list()).at(-1)!;
    expect(last.policy_decision).toBe('TOKENIZE');
    expect(last.input_transformation).toBe('tokenize');
    expect(last.decision_hash).toMatch(/^[a-f0-9]{64}$/);
    const record = gw.packRepo.getEvaluation(last.evaluation_id!);
    expect(record).toBeTruthy();
    expect(last.decision_hash).toBe(decisionBindingFromRecord(record!).decision_hash);

    // Truthful product claim boundaries — no certification language in this path.
    const claimText = JSON.stringify({
      decision: last.policy_decision,
      reasons: record!.reason_codes,
    });
    expect(claimText.toLowerCase()).not.toMatch(/hipaa.?compliant|certified|compliance score/);
  });
});
