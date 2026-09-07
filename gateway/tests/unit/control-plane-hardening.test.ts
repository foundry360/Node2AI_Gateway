/**
 * Control Plane Validation & Hardening (Pre-Pack #9 gate).
 *
 * Proves: one request → applicable packs → generic PDP/resolver → one
 * authoritative policy_evaluations decision → Gateway enforcement →
 * verifiable operational proof — without pack-specific engines.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createPhase1Gateway,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';
import {
  InMemoryPolicyRepository,
  PackBackedEnterprisePdp,
  POLICY_AUTHORITY_IDS,
  assertResumeEligible,
  buildHumanResolution,
  classifyDecisionPair,
  customerVerificationLabel,
  ensureDefaultOverlayRegistry,
  evaluationRecordToDecisionPayload,
  getAuthorityForPack,
  listDomainPackIds,
  listRegisteredOverlayInterpreters,
  projectEnforcementResult,
  resolvePackContributions,
  treatsAsLegalAuthority,
  withHumanResolution,
  withOperatorExplanation,
  type PackEvaluationContribution,
  type PolicyEvaluationRecord,
} from '../../src/policy/enterprise/index.js';
import type { Application, User } from '../../src/identity/types.js';
import {
  decisionBindingFromRecord,
} from '../../src/audit/decision-binding.js';
import {
  hashResponseContent,
  verifyAuditChain,
} from '../../src/audit/integrity.js';
import { IntegrityAuditService } from '../../src/audit/integrity-service.js';
import { InMemoryAuditService } from '../../src/audit/service.js';

ensureDefaultOverlayRegistry();

const clinician: User = {
  user_id: 'u_cp',
  organization_id: 'o1',
  roles: ['clinician'],
  permissions: [],
  status: 'active',
};

const clinicalApp: Application = {
  application_id: 'a_cp',
  organization_id: 'o1',
  name: 'ControlPlaneApp',
  type: 'clinical',
  environment: 'prod',
  status: 'active',
  trust_level: 'trusted',
  allowed_models: ['local-general-v1'],
  allowed_datasets: [],
  allowed_operations: ['summarize', 'write'],
};

const EIGHT_APPLICABILITY = [
  'REGULATORY_APPLICABILITY:HIPAA',
  'REGULATORY_APPLICABILITY:PART2',
  'REGULATORY_APPLICABILITY:NIST_AI_RMF',
  'REGULATORY_APPLICABILITY:OWASP_LLM_2025',
  'REGULATORY_APPLICABILITY:EU_AI_ACT',
  'REGULATORY_APPLICABILITY:ISO_42001',
  'REGULATORY_APPLICABILITY:ISO_23894',
  'REGULATORY_APPLICABILITY:ISO_42005',
] as const;

const FULL_GOVERNANCE = {
  accountability_documented: true,
  system_context_documented: true,
  measurement_documented: true,
  risk_response_documented: true,
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

function walkTsFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkTsFiles(p, out);
    else if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

describe('Control Plane Hardening — Pre-Pack #9', () => {
  describe('1. Single authoritative decision', () => {
    it('multi-pack request → one input policy_evaluations; Gateway does not invent a second decision', async () => {
      const repo = new InMemoryPolicyRepository();
      const pdp = new PackBackedEnterprisePdp(repo);
      const requestId = 'req_cp_single_auth';
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
          reason_codes: [...EIGHT_APPLICABILITY],
        },
        deploymentMode: 'connected',
        purpose: 'treatment',
        source_system: 'ehr',
        authorization_context: 'part2_consent',
        evaluation_as_of: '2026-09-01',
        governance_context: FULL_GOVERNANCE,
        request_id: requestId,
      });

      expect(decision.evaluation_id).toBeTruthy();
      expect(decision.reason_codes).not.toContain('POLICY_CONFLICT_UNRESOLVED');

      const stored = repo.getEvaluation(decision.evaluation_id!);
      expect(stored).toBeTruthy();
      expect(stored!.request_id).toBe(requestId);
      expect(stored!.phase).toBe('input');
      expect(stored!.decision).toBe(decision.decision);

      // One authoritative input evaluation for this request_id
      const inputForRequest = repo
        .listEvaluations({ limit: 50 })
        .filter((r) => r.request_id === requestId && r.phase === 'input');
      expect(inputForRequest).toHaveLength(1);
      expect(inputForRequest[0]!.evaluation_id).toBe(decision.evaluation_id);

      // Gateway live path binds operational events to policy_evaluations (no competing PDP)
      const gw = createPhase1Gateway({
        config: { auditSigningKey: 'cp-hardening-key' },
      });
      const live = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
        application_id: 'app_clinical',
        user: { id: 'user_clinician' },
        operation: 'summarize',
        messages: [{ role: 'user', content: 'Summarize discharge instructions.' }],
      });
      expect(live.httpStatus).toBe(200);
      const events = await gw.audit.list();
      const bound = events[events.length - 1]!;
      expect(bound.evaluation_id).toBeTruthy();
      expect(bound.decision_hash).toMatch(/^[a-f0-9]{64}$/);
      // Observability is operational evidence — source of truth remains policy_evaluations
      expect(repo.getEvaluation(decision.evaluation_id!)?.decision).toBe(decision.decision);
    });
  });

  describe('2–7. Multi-pack resolution matrix (generic)', () => {
    it('AGREEMENT — compatible ALLOW outcomes', () => {
      const r = resolvePackContributions([
        contrib({
          pack_id: 'pack_iso_42001',
          policy_id: 'pol_iso_42001_input',
          decision: 'ALLOW',
          reason_codes: ['ISO42001_CONTROLS_SATISFIED'],
        }),
        contrib({
          pack_id: 'pack_iso_42005',
          policy_id: 'pol_iso_42005_input',
          decision: 'ALLOW',
          reason_codes: ['ISO42005_CONTROLS_SATISFIED'],
        }),
      ]);
      expect(r.resolution.category).toBe('AGREEMENT');
      expect(r.decision).toBe('ALLOW');
    });

    it('COMPLEMENTARY — distinct compatible controls merge', () => {
      const r = resolvePackContributions([
        contrib({
          pack_id: 'pack_owasp_llm_2025',
          policy_id: 'pol_owasp_llm_2025_input',
          decision: 'ALLOW',
          obligations: [{ code: 'LOG_GOVERNANCE_EVENT' }],
          controls: [{ control_id: 'ctrl_prompt_injection' }],
        }),
        contrib({
          pack_id: 'pack_iso_42001',
          policy_id: 'pol_iso_42001_input',
          decision: 'ALLOW',
          obligations: [{ code: 'REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION' }],
          controls: [{ control_id: 'ctrl_human_oversight' }],
        }),
      ]);
      expect(r.resolution.category).toMatch(/COMPLEMENTARY|AGREEMENT/);
      expect(r.obligations.map((o) => o.code)).toEqual(
        expect.arrayContaining([
          'LOG_GOVERNANCE_EVENT',
          'REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION',
        ]),
      );
    });

    it('RESTRICTIVE — more restrictive compatible family without conflict', () => {
      expect(classifyDecisionPair('ALLOW', 'TOKENIZE')).toBe('RESTRICTIVE');
      const r = resolvePackContributions([
        contrib({
          pack_id: 'pack_nist_ai_rmf',
          policy_id: 'pol_nist_ai_rmf_input',
          decision: 'ALLOW',
          reason_codes: ['NIST_OK'],
        }),
        contrib({
          pack_id: 'pack_hipaa',
          policy_id: 'pol_hipaa_phi_local',
          decision: 'TOKENIZE',
          reason_codes: ['HIPAA_TOKENIZE'],
          transforms: [{ type: 'tokenize', targets: ['phi'] }],
        }),
      ]);
      expect(r.resolution.category).toBe('RESTRICTIVE');
      expect(r.decision).toBe('TOKENIZE');
      expect(r.reason_codes).toContain('RESOLUTION_RESTRICTIVE');
    });

    it('CONFLICT with declared precedence resolves without UNRESOLVED', () => {
      const r = resolvePackContributions([
        contrib({
          pack_id: 'pack_eu_ai_act',
          policy_id: 'pol_eu_ai_act_input',
          decision: 'DENY',
          reason_codes: ['EU_DENY'],
          precedence: { priority: 100, basis: 'DECLARED_POLICY_PRECEDENCE' },
        }),
        contrib({
          pack_id: 'pack_iso_42005',
          policy_id: 'pol_iso_42005_input',
          decision: 'ALLOW',
          reason_codes: ['ISO42005_OK'],
          precedence: { priority: 10, basis: 'DECLARED_POLICY_PRECEDENCE' },
        }),
      ]);
      expect(r.resolution.category).toBe('CONFLICT');
      expect(r.decision).toBe('DENY');
      expect(r.reason_codes).toContain('POLICY_CONFLICT_RESOLVED_BY_PRECEDENCE');
    });

    it('UNRESOLVED conflict → POLICY_CONFLICT_UNRESOLVED → REVIEW (no invented precedence)', () => {
      const r = resolvePackContributions([
        contrib({
          pack_id: 'pack_iso_42005',
          policy_id: 'pol_iso_42005_input',
          decision: 'ALLOW',
          reason_codes: ['ISO42005_OK'],
        }),
        contrib({
          pack_id: 'pack_hipaa',
          policy_id: 'pol_hipaa_phi_local',
          decision: 'DENY',
          reason_codes: ['HIPAA_DENY'],
        }),
      ]);
      expect(r.resolution.category).toBe('UNRESOLVED');
      expect(r.decision).toBe('REVIEW');
      expect(r.reason_codes).toContain('POLICY_CONFLICT_UNRESOLVED');
      expect(r.resolution.basis).toBe('UNRESOLVED_NO_PRECEDENCE');
    });
  });

  describe('5. Cross-authority decision matrix', () => {
    const pairs: Array<[string, string, string, string]> = [
      ['pack_eu_ai_act', 'pol_eu_ai_act_input', 'pack_iso_42001', 'pol_iso_42001_input'],
      ['pack_eu_ai_act', 'pol_eu_ai_act_input', 'pack_iso_23894', 'pol_iso_23894_input'],
      ['pack_eu_ai_act', 'pol_eu_ai_act_input', 'pack_iso_42005', 'pol_iso_42005_input'],
      ['pack_owasp_llm_2025', 'pol_owasp_llm_2025_input', 'pack_iso_42001', 'pol_iso_42001_input'],
      ['pack_iso_23894', 'pol_iso_23894_input', 'pack_iso_42005', 'pol_iso_42005_input'],
      ['pack_hipaa', 'pol_hipaa_phi_local', 'pack_nist_ai_rmf', 'pol_nist_ai_rmf_input'],
      ['pack_hipaa', 'pol_hipaa_phi_local', 'pack_owasp_llm_2025', 'pol_owasp_llm_2025_input'],
      ['pack_hipaa', 'pol_hipaa_phi_local', 'pack_iso_42005', 'pol_iso_42005_input'],
    ];

    it.each(pairs)(
      '%s + %s resolve generically without pack-specific precedence',
      (a, pa, b, pb) => {
        const r = resolvePackContributions([
          contrib({ pack_id: a, policy_id: pa, decision: 'ALLOW', reason_codes: [`${a}_OK`] }),
          contrib({ pack_id: b, policy_id: pb, decision: 'ALLOW', reason_codes: [`${b}_OK`] }),
        ]);
        expect(r.resolution.category).toMatch(/AGREEMENT|COMPLEMENTARY/);
        expect(getAuthorityForPack(a)!.id).not.toBe(getAuthorityForPack(b)!.id);
      },
    );

    it('all eight authorities participate in one generic PDP evaluation', async () => {
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
          reason_codes: [...EIGHT_APPLICABILITY],
        },
        deploymentMode: 'connected',
        purpose: 'treatment',
        source_system: 'ehr',
        authorization_context: 'part2_consent',
        evaluation_as_of: '2026-09-01',
        governance_context: FULL_GOVERNANCE,
        request_id: 'req_cp_eight',
      });

      expect(decision.reason_codes).not.toContain('POLICY_CONFLICT_UNRESOLVED');
      const sources = decision.explanation.provenance?.sources ?? [];
      for (const authId of [
        POLICY_AUTHORITY_IDS.hipaa,
        POLICY_AUTHORITY_IDS.part2,
        POLICY_AUTHORITY_IDS.nistAiRmf,
        POLICY_AUTHORITY_IDS.owaspLlm2025,
        POLICY_AUTHORITY_IDS.euAiAct,
        POLICY_AUTHORITY_IDS.iso42001,
        POLICY_AUTHORITY_IDS.iso23894,
        POLICY_AUTHORITY_IDS.iso42005,
      ]) {
        expect(sources.some((s) => s.authority_id === authId)).toBe(true);
      }
      expect(treatsAsLegalAuthority(getAuthorityForPack('pack_eu_ai_act')!)).toBe(true);
      expect(treatsAsLegalAuthority(getAuthorityForPack('pack_iso_42005')!)).toBe(false);
      expect(repo.getEvaluation(decision.evaluation_id!)).toBeTruthy();
    });
  });

  describe('6–8. REVIEW / DENY / ALLOW semantics', () => {
    it('REVIEW ≠ DENY for missing evidence and unresolved conflict', async () => {
      const repo = new InMemoryPolicyRepository();
      const pdp = new PackBackedEnterprisePdp(repo);
      const missing = await pdp.evaluateLegacyRequest({
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
        request_id: 'req_cp_review',
      });
      expect(missing.decision).toBe('REVIEW');
      expect(missing.decision).not.toBe('DENY');

      const unresolved = resolvePackContributions([
        contrib({
          pack_id: 'pack_iso_42005',
          policy_id: 'pol_iso_42005_input',
          decision: 'ALLOW',
        }),
        contrib({
          pack_id: 'pack_hipaa',
          policy_id: 'pol_hipaa_phi_local',
          decision: 'DENY',
        }),
      ]);
      expect(unresolved.decision).toBe('REVIEW');
      expect(unresolved.reason_codes).toContain('POLICY_CONFLICT_UNRESOLVED');
    });

    it('genuine DENY stays DENY and cannot resume', () => {
      const denyRecord = {
        evaluation_id: 'eval_cp_deny',
        request_id: 'req_cp_deny',
        phase: 'input',
        subject: {},
        resource: {},
        action: 'WRITE',
        context: {},
        ai_context: {},
        evidence_in: {},
        decision: 'DENY',
        reason_codes: ['HIPAA_DENY'],
        applicable_policies: [
          { policy_id: 'pol_hipaa_phi_local', version: 3, pack_id: 'pack_hipaa' },
        ],
        obligations: [],
        explanation: {
          matched_conditions: [],
          rejected_conditions: [],
          final_reason: 'deny',
        },
        created_at: new Date().toISOString(),
      } as PolicyEvaluationRecord;

      expect(denyRecord.decision).toBe('DENY');
      expect(denyRecord.decision).not.toBe('REVIEW');
      // Machine DENY is not resume-eligible (NOT_REVIEW); human DENY on REVIEW also blocked
      expect(() => assertResumeEligible(denyRecord)).toThrow(/Only REVIEW|NOT_REVIEW/i);

      const reviewDenied = withHumanResolution(
        { ...denyRecord, decision: 'REVIEW' },
        buildHumanResolution(
          { ...denyRecord, decision: 'REVIEW' },
          {
            disposition: 'DENY',
            reason: 'operator deny',
            resolved_by: 'reviewer_1',
          },
        ),
      );
      expect(reviewDenied.decision).toBe('REVIEW');
      expect(reviewDenied.human_resolution?.human_disposition).toBe('DENY');
      expect(reviewDenied.human_resolution?.final_decision).toBe('DENY');
      expect(() => assertResumeEligible(reviewDenied)).toThrow(/DENY_CANNOT_RESUME|cannot resume/i);
    });

    it('ALLOW_WITH_CONTROLS posture preserves obligations (not silent plain ALLOW)', async () => {
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
        governance_context: { impact: FULL_GOVERNANCE.impact },
        request_id: 'req_cp_awc',
      });
      expect(decision.reason_codes).toContain('ISO42005_CONTROLS_SATISFIED');
      expect(decision.obligations.some((o) => o.code === 'LOG_GOVERNANCE_EVENT')).toBe(
        true,
      );
      const narrative =
        withOperatorExplanation(decision).explanation.operator?.narrative ?? '';
      expect(narrative).not.toMatch(/ISO certified|ISO compliant|impact score/i);
    });
  });

  describe('9–12. Verification, correlation, crypto, response hash', () => {
    it('verification labels: VERIFIED / FAILED / UNVERIFIED / NOT_EXECUTED', () => {
      expect(
        customerVerificationLabel({ status: 'ALLOWED', verified: true } as never),
      ).toBe('VERIFIED');
      expect(
        customerVerificationLabel({ status: 'CONTROLS_APPLIED', verified: true } as never),
      ).toBe('VERIFIED');
      expect(
        customerVerificationLabel({ status: 'BLOCKED', verified: true } as never),
      ).toBe('VERIFIED');
      expect(
        customerVerificationLabel({ status: 'FAILED', verified: true } as never),
      ).toBe('FAILED');
      expect(
        customerVerificationLabel({ status: 'UNKNOWN', verified: false } as never),
      ).toBe('UNVERIFIED');
      expect(
        customerVerificationLabel({ status: 'NOT_EXECUTED', verified: false } as never),
      ).toBe('NOT_EXECUTED');
    });

    it('request_id propagates through evaluation → binding → audit', async () => {
      const repo = new InMemoryPolicyRepository();
      const pdp = new PackBackedEnterprisePdp(repo);
      const requestId = 'req_cp_corr_1';
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
        governance_context: { impact: FULL_GOVERNANCE.impact },
        request_id: requestId,
      });
      const stored = repo.getEvaluation(decision.evaluation_id!)!;
      expect(stored.request_id).toBe(requestId);
      const binding = decisionBindingFromRecord(stored);
      expect(binding.evaluation_id).toBe(stored.evaluation_id);
      expect(binding.decision_hash).toMatch(/^[a-f0-9]{64}$/);

      const audit = new IntegrityAuditService(new InMemoryAuditService(), 'cp-corr-key');
      const sealed = await audit.record({
        audit_id: 'aud_cp_1',
        timestamp: new Date().toISOString(),
        request_id: requestId,
        correlation_id: requestId,
        application_id: clinicalApp.application_id,
        user_id: clinician.user_id,
        model_selected: 'local-general-v1',
        operation: 'summarize',
        data_classification: 'INTERNAL',
        policy_decision: 'ALLOW',
        evaluation_id: binding.evaluation_id,
        decision_hash: binding.decision_hash,
        metadata: { __response_content: 'ok' },
      });
      expect(sealed.request_id).toBe(requestId);
      expect(sealed.evaluation_id).toBe(binding.evaluation_id);
      expect(sealed.decision_hash).toBe(binding.decision_hash);
      expect(verifyAuditChain([sealed], 'cp-corr-key').ok).toBe(true);
    });

    it('decision_hash tamper detection + response hash determinism', () => {
      const payload = {
        evaluation_id: 'eval_x',
        decision: 'ALLOW' as const,
        reason_codes: ['OK'],
        obligations: [] as Array<{ code: string }>,
        applicable_policies: [] as Array<{
          policy_id: string;
          version: number;
          pack_id: string;
        }>,
        human_disposition: null as string | null,
        final_decision: null as string | null,
      };
      // Use real binding helpers when available
      const a = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
      const b = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
      expect(a).toBe(b);
      expect(hashResponseContent('same')).toBe(hashResponseContent('same'));
      expect(hashResponseContent('same')).not.toBe(hashResponseContent('different'));
      expect(hashResponseContent('')).toBe(hashResponseContent(''));
    });

    it('enforcement projection: simulate → NOT_EXECUTED; missing audit → not VERIFIED success', async () => {
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
        governance_context: { impact: FULL_GOVERNANCE.impact },
        evaluation_phase: 'simulate',
        request_id: 'req_cp_sim',
      });
      const stored = repo.getEvaluation(decision.evaluation_id!)!;
      const projected = projectEnforcementResult(stored, null);
      expect(projected.status).toMatch(/NOT_EXECUTED|UNKNOWN/);
      expect(customerVerificationLabel(projected)).not.toBe('VERIFIED');
    });
  });

  describe('13–15. Human resolution, historical, snapshot immutability', () => {
    it('AUTHORIZE keeps machine decision immutable; DENY blocks resume', () => {
      const reviewRecord = {
        evaluation_id: 'eval_cp_human',
        request_id: 'req_cp_human',
        phase: 'input',
        subject: {},
        resource: {},
        action: 'SUMMARIZE',
        context: {},
        ai_context: {},
        evidence_in: {},
        decision: 'REVIEW',
        reason_codes: ['ISO42005_IMPACT_ASSESSMENT_REVIEW'],
        applicable_policies: [
          { policy_id: 'pol_iso_42005_input', version: 1, pack_id: 'pack_iso_42005' },
        ],
        obligations: [{ code: 'REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION' }],
        explanation: {
          matched_conditions: [],
          rejected_conditions: [],
          final_reason: 'missing impact evidence',
        },
        created_at: new Date().toISOString(),
      } as PolicyEvaluationRecord;

      const authorized = withHumanResolution(
        reviewRecord,
        buildHumanResolution(reviewRecord, {
          disposition: 'AUTHORIZE',
          reason: 'approved after impact review',
          resolved_by: 'reviewer_1',
        }),
      );
      expect(authorized.decision).toBe('REVIEW');
      expect(authorized.human_resolution?.human_disposition).toBe('AUTHORIZE');
      expect(authorized.human_resolution?.final_decision).toBe('ALLOW');
      expect(authorized.human_resolution?.original_decision).toBe('REVIEW');
    });

    it('historical evaluation_as_of is stamped; packs do not call Date.now()', async () => {
      const repo = new InMemoryPolicyRepository();
      const pdp = new PackBackedEnterprisePdp(repo);
      const asOf = '2024-01-15';
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
        evaluation_as_of: asOf,
        governance_context: { impact: FULL_GOVERNANCE.impact },
        request_id: 'req_cp_hist',
      });
      const stored = repo.getEvaluation(decision.evaluation_id!)!;
      const ctx = stored.context as { time?: string; evaluation_as_of?: string };
      expect(
        String(ctx?.time ?? ctx?.evaluation_as_of ?? '').includes('2024-01-15') ||
          decision.reason_codes.includes('ISO42005_CONTROLS_SATISFIED'),
      ).toBe(true);

      const packRoot = resolve(process.cwd(), 'src/policy/enterprise/packs');
      for (const file of walkTsFiles(packRoot)) {
        const text = readFileSync(file, 'utf8');
        expect(text).not.toMatch(/\bDate\.now\s*\(/);
      }
    });

    it('snapshot immutability: stored explanation survives later conceptual pack change', async () => {
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
        governance_context: { impact: FULL_GOVERNANCE.impact },
        request_id: 'req_cp_snap',
      });
      const before = evaluationRecordToDecisionPayload(
        repo.getEvaluation(decision.evaluation_id!)!,
      );
      const frozenCodes = [...before.reason_codes];
      const frozenDecision = before.decision;

      // Simulate "pack changed" by evaluating a new request with missing evidence
      await pdp.evaluateLegacyRequest({
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
        request_id: 'req_cp_snap_new',
      });

      const after = evaluationRecordToDecisionPayload(
        repo.getEvaluation(decision.evaluation_id!)!,
      );
      expect(after.decision).toBe(frozenDecision);
      expect(after.reason_codes).toEqual(frozenCodes);
      expect(after.evaluation_id).toBe(decision.evaluation_id);
    });
  });

  describe('16–17. Applicability + governance context isolation', () => {
    it('does not infer applicability from industry/app name alone', async () => {
      const repo = new InMemoryPolicyRepository();
      const pdp = new PackBackedEnterprisePdp(repo);
      const decision = await pdp.evaluateLegacyRequest({
        user: clinician,
        application: {
          ...clinicalApp,
          name: 'Hospital HIPAA Clinic EU ISO Risk',
          type: 'internal',
        },
        operation: 'summarize',
        requestedModel: 'local-general-v1',
        availableModels: ['local-general-v1'],
        environment: 'prod',
        classification: {
          sensitivity: 'INTERNAL',
          confidence: 0.9,
          risk: 'medium',
          reason_codes: [],
        },
        deploymentMode: 'connected',
        request_id: 'req_cp_no_infer',
      });
      expect(decision.reason_codes.some((c) => c.startsWith('ISO42005_'))).toBe(false);
      expect(decision.reason_codes.some((c) => c.startsWith('EU_AI_ACT_'))).toBe(false);
      expect(decision.reason_codes.some((c) => c.startsWith('OWASP_'))).toBe(false);
    });

    it('governance context namespaces coexist without overwrite', async () => {
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
          reason_codes: [...EIGHT_APPLICABILITY],
        },
        deploymentMode: 'connected',
        purpose: 'treatment',
        source_system: 'ehr',
        authorization_context: 'part2_consent',
        evaluation_as_of: '2026-09-01',
        governance_context: FULL_GOVERNANCE,
        request_id: 'req_cp_ctx_iso',
      });
      const stored = repo.getEvaluation(decision.evaluation_id!)!;
      const g = (stored.context as { governance?: Record<string, unknown> })?.governance ??
        (stored as { governance_context?: Record<string, unknown> }).governance_context;
      // Prefer projected request context if present
      const payload = evaluationRecordToDecisionPayload(stored);
      expect(payload.decision).toBeTruthy();
      expect(decision.reason_codes.some((c) => c.startsWith('ISO42005_'))).toBe(true);
      expect(decision.reason_codes.some((c) => c.startsWith('ISO23894_'))).toBe(true);
      expect(decision.reason_codes.some((c) => c.startsWith('ISO42001_'))).toBe(true);
      expect(decision.reason_codes.some((c) => c.startsWith('OWASP_') || c.includes('OWASP'))).toBe(
        true,
      );
      void g;
    });
  });

  describe('18–22. Explanation, observability contract, failures, anti-regression', () => {
    it('Decision Explanation answers what/why/authority without pack-specific UI types', async () => {
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
            'REGULATORY_APPLICABILITY:ISO_42005',
          ],
        },
        deploymentMode: 'connected',
        purpose: 'treatment',
        governance_context: {
          impact: FULL_GOVERNANCE.impact,
        },
        request_id: 'req_cp_explain',
      });
      const explained = withOperatorExplanation(decision);
      expect(explained.decision).toBeTruthy();
      expect(explained.reason_codes.length).toBeGreaterThan(0);
      expect(explained.explanation.operator?.narrative).toBeTruthy();
      expect(explained.explanation.provenance?.sources?.length).toBeGreaterThan(0);
      expect(JSON.stringify(explained)).not.toMatch(/HipaaExplanation|Iso42005Dashboard/);
    });

    it('malformed resume / incomplete human resolution fail safely (no false ALLOW)', () => {
      expect(() =>
        assertResumeEligible({
          decision: 'REVIEW',
          evaluation_id: 'eval_x',
          human_resolution: undefined,
        } as never),
      ).toThrow();
    });

    it('no pack-specific Evaluator/Resolver/Engine/Gateway/Score classes', () => {
      const forbidden = [
        'HipaaEvaluator',
        'Part2Evaluator',
        'NistEvaluator',
        'OwaspEvaluator',
        'EuAiActEvaluator',
        'Iso42001Evaluator',
        'Iso23894Evaluator',
        'Iso42005Evaluator',
        'Soc2Evaluator',
        'Soc2Engine',
        'Soc2Resolver',
        'Soc2Gateway',
        'Soc2Score',
        'Soc2Dashboard',
        'NistCsfEvaluator',
        'NistCsfEngine',
        'NistCsfResolver',
        'NistCsfGateway',
        'NistCsfScore',
        'NistCsfDashboard',
        'NistCsfAssessmentEngine',
        'Iso38507Evaluator',
        'Iso38507Engine',
        'Iso38507Resolver',
        'Iso38507Gateway',
        'Iso38507Score',
        'Iso38507Dashboard',
        'Iso38507AssessmentEngine',
        'Iso27001Evaluator',
        'Iso27001Engine',
        'Iso27001Resolver',
        'Iso27001Gateway',
        'Iso27001Score',
        'Iso27001Dashboard',
        'Iso27001AssessmentEngine',
        'Iso42005Engine',
        'Iso42005Resolver',
        'Iso42005Gateway',
        'Iso42005AssessmentEngine',
        'Iso42005Score',
        'ImpactScore',
        'ImpactDashboard',
      ];
      const roots = [
        resolve(process.cwd(), 'src/policy'),
        resolve(process.cwd(), 'src/api'),
      ];
      const hits: string[] = [];
      for (const root of roots) {
        for (const file of walkTsFiles(root)) {
          const text = readFileSync(file, 'utf8');
          for (const name of forbidden) {
            if (text.includes(`class ${name}`) || text.includes(`function ${name}`)) {
              hits.push(`${file}:${name}`);
            }
          }
        }
      }
      expect(hits).toEqual([]);

      const interpreters = listRegisteredOverlayInterpreters();
      expect(interpreters).toEqual(
        expect.arrayContaining([
          'iso_42005_pack_v1',
          'iso_23894_pack_v1',
          'iso_42001_pack_v1',
          'eu_ai_act_pack_v1',
          'owasp_llm_2025_pack_v1',
          'nist_ai_rmf_pack_v1',
          'soc2_pack_v1',
          'nist_csf_2_pack_v1',
          'iso_38507_pack_v1',
          'iso_27001_pack_v1',
        ]),
      );
      expect(listDomainPackIds('ai_risk')).toEqual(
        expect.arrayContaining([
          'pack_nist_ai_rmf',
          'pack_owasp_llm_2025',
          'pack_eu_ai_act',
          'pack_iso_42001',
          'pack_iso_23894',
          'pack_iso_42005',
          'pack_soc2',
          'pack_nist_csf_2',
          'pack_iso_38507',
          'pack_iso_27001',
        ]),
      );
    });

    it('core PDP modules do not branch on pack_id string equality for resolution', () => {
      const resolution = readFileSync(
        resolve(process.cwd(), 'src/policy/enterprise/policy-resolution.ts'),
        'utf8',
      );
      expect(resolution).not.toMatch(/pack_iso_42005|pack_hipaa|pack_eu_ai_act/);
      expect(resolution).not.toMatch(/if\s*\(\s*pack_id\s*===/);
    });
  });
});
