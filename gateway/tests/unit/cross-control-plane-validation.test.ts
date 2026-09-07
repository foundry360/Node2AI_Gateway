/**
 * Ten-Pack Cross-Control-Plane Validation (NOT Pack #11).
 *
 * Proves: across all 10 live authorities, Enigma remains a governance control
 * plane — Policy → Decision → Enforcement → Proof — with one authoritative
 * policy_evaluations decision, generic resolution, and no pack-specific engines.
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
  computeDecisionHash,
  decisionBindingFromRecord,
} from '../../src/audit/decision-binding.js';
import {
  hashResponseContent,
  verifyAuditChain,
} from '../../src/audit/integrity.js';
import { IntegrityAuditService } from '../../src/audit/integrity-service.js';
import { InMemoryAuditService } from '../../src/audit/service.js';
import type { Application, User } from '../../src/identity/types.js';
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
  executionAfterAuthorize,
  findAuditForEvaluation,
  getAuthorityForPack,
  getPolicyAuthority,
  isEligibleForHumanReview,
  listDomainPackIds,
  listPolicyAuthorities,
  listRegisteredOverlayInterpreters,
  projectEnforcementResult,
  resolvePackContributions,
  treatsAsLegalAuthority,
  withHumanResolution,
  withOperatorExplanation,
  type HeldRequestSnapshot,
  type PackEvaluationContribution,
  type PolicyEvaluationRecord,
} from '../../src/policy/enterprise/index.js';

ensureDefaultOverlayRegistry();

const clinician: User = {
  user_id: 'u_tcp',
  organization_id: 'o1',
  roles: ['clinician'],
  permissions: [],
  status: 'active',
};

const clinicalApp: Application = {
  application_id: 'a_tcp',
  organization_id: 'o1',
  name: 'TenPackControlPlaneApp',
  type: 'clinical',
  environment: 'prod',
  status: 'active',
  trust_level: 'trusted',
  allowed_models: ['local-general-v1'],
  allowed_datasets: [],
  allowed_operations: ['summarize', 'write'],
};

const TEN_APPLICABILITY = [
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
] as const;

const TEN_AUTHORITY_IDS = [
  POLICY_AUTHORITY_IDS.hipaa,
  POLICY_AUTHORITY_IDS.part2,
  POLICY_AUTHORITY_IDS.nistAiRmf,
  POLICY_AUTHORITY_IDS.owaspLlm2025,
  POLICY_AUTHORITY_IDS.euAiAct,
  POLICY_AUTHORITY_IDS.iso42001,
  POLICY_AUTHORITY_IDS.iso23894,
  POLICY_AUTHORITY_IDS.iso42005,
  POLICY_AUTHORITY_IDS.soc2,
  POLICY_AUTHORITY_IDS.nistCsf2,
] as const;

const TEN_PACK_IDS = [
  'pack_hipaa',
  'pack_42_cfr_part_2',
  'pack_nist_ai_rmf',
  'pack_owasp_llm_2025',
  'pack_eu_ai_act',
  'pack_iso_42001',
  'pack_iso_23894',
  'pack_iso_42005',
  'pack_soc2',
  'pack_nist_csf_2',
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
  assurance: {
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
  },
  cybersecurity: {
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

function sampleReviewRecord(
  overrides: Partial<PolicyEvaluationRecord> = {},
): PolicyEvaluationRecord {
  return {
    evaluation_id: 'eval_tcp_review',
    request_id: 'req_tcp_review',
    phase: 'input',
    subject: {},
    resource: {},
    action: 'SUMMARIZE',
    context: {},
    ai_context: {},
    evidence_in: {},
    decision: 'REVIEW',
    reason_codes: ['NIST_CSF_2_GOVERN_ACCOUNTABILITY_REVIEW'],
    applicable_policies: [
      { policy_id: 'pol_nist_csf_2_input', version: 1, pack_id: 'pack_nist_csf_2' },
    ],
    obligations: [{ code: 'REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION' }],
    explanation: {
      matched_conditions: [],
      rejected_conditions: [],
      final_reason: 'missing cybersecurity evidence',
    },
    created_at: '2026-09-07T12:00:00.000Z',
    ...overrides,
  } as PolicyEvaluationRecord;
}

describe('Ten-Pack Cross-Control-Plane Validation', () => {
  describe('1. Portfolio + authoritative decision', () => {
    it('registers exactly the ten live authorities and pack links', () => {
      const ids = listPolicyAuthorities().map((a) => a.id);
      for (const id of TEN_AUTHORITY_IDS) {
        expect(ids).toContain(id);
      }
      for (const packId of TEN_PACK_IDS) {
        expect(getAuthorityForPack(packId)?.id).toBeTruthy();
      }
      expect(treatsAsLegalAuthority(getPolicyAuthority(POLICY_AUTHORITY_IDS.hipaa)!)).toBe(
        true,
      );
      expect(treatsAsLegalAuthority(getPolicyAuthority(POLICY_AUTHORITY_IDS.euAiAct)!)).toBe(
        true,
      );
      expect(treatsAsLegalAuthority(getPolicyAuthority(POLICY_AUTHORITY_IDS.soc2)!)).toBe(
        false,
      );
      expect(
        treatsAsLegalAuthority(getPolicyAuthority(POLICY_AUTHORITY_IDS.nistCsf2)!),
      ).toBe(false);
      expect(getPolicyAuthority(POLICY_AUTHORITY_IDS.nistCsf2)?.type).toBe('FRAMEWORK');
      expect(getPolicyAuthority(POLICY_AUTHORITY_IDS.soc2)?.type).toBe('FRAMEWORK');
    });

    it('ten-authority request yields one input policy_evaluations as sole decision authority', async () => {
      const repo = new InMemoryPolicyRepository();
      const pdp = new PackBackedEnterprisePdp(repo);
      const requestId = 'req_tcp_auth_one';
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
          reason_codes: [...TEN_APPLICABILITY],
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

      const stored = repo.getEvaluation(decision.evaluation_id!)!;
      expect(stored.request_id).toBe(requestId);
      expect(stored.decision).toBe(decision.decision);
      expect(
        repo
          .listEvaluations({ limit: 50 })
          .filter((r) => r.request_id === requestId && r.phase === 'input'),
      ).toHaveLength(1);

      const sources = decision.explanation.provenance?.sources ?? [];
      for (const authId of TEN_AUTHORITY_IDS) {
        expect(sources.some((s) => s.authority_id === authId)).toBe(true);
      }

      // Observability/audit is evidence, not a competing decision authority
      const gw = createPhase1Gateway({
        config: { auditSigningKey: 'tcp-validation-key' },
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
      expect(repo.getEvaluation(decision.evaluation_id!)?.decision).toBe(decision.decision);
    });
  });

  describe('2. Lifecycle outcomes', () => {
    it('ALLOW_WITH_CONTROLS path preserves obligations; missing evidence → REVIEW ≠ DENY', async () => {
      const repo = new InMemoryPolicyRepository();
      const pdp = new PackBackedEnterprisePdp(repo);

      const ok = await pdp.evaluateLegacyRequest({
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
            'REGULATORY_APPLICABILITY:NIST_CSF_2',
            'REGULATORY_APPLICABILITY:SOC_2',
          ],
        },
        deploymentMode: 'connected',
        governance_context: {
          assurance: FULL_GOVERNANCE.assurance,
          cybersecurity: FULL_GOVERNANCE.cybersecurity,
        },
        request_id: 'req_tcp_awc',
      });
      expect(ok.reason_codes).toEqual(
        expect.arrayContaining(['NIST_CSF_2_CONTROLS_SATISFIED', 'SOC2_CONTROLS_SATISFIED']),
      );
      expect(ok.decision).not.toBe('REVIEW');
      expect(ok.obligations.some((o) => o.code === 'LOG_GOVERNANCE_EVENT')).toBe(true);

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
          reason_codes: ['REGULATORY_APPLICABILITY:NIST_CSF_2'],
        },
        deploymentMode: 'connected',
        request_id: 'req_tcp_review_missing',
      });
      expect(missing.decision).toBe('REVIEW');
      expect(missing.decision).not.toBe('DENY');

      const held = projectEnforcementResult(repo.getEvaluation(missing.evaluation_id!)!, {
        audit_id: 'aud_hold',
        timestamp: new Date().toISOString(),
        request_id: 'req_tcp_review_missing',
        correlation_id: 'req_tcp_review_missing',
        policy_decision: 'REVIEW',
        response_decision: 'BLOCK',
      } as never);
      expect(held.status).toBe('REVIEW_REQUIRED');
      expect(held.safety_fallback).toBe(true);
      expect(held.status).not.toBe('BLOCKED');
      expect(customerVerificationLabel(held)).toBe('UNVERIFIED');
    });

    it('DENY stays DENY; human cannot authorize machine DENY; REVIEW→DENY blocks resume', () => {
      const denyRecord = sampleReviewRecord({
        evaluation_id: 'eval_tcp_deny',
        request_id: 'req_tcp_deny',
        decision: 'DENY',
        reason_codes: ['HIPAA_DENY'],
        applicable_policies: [
          { policy_id: 'pol_hipaa_phi_local', version: 3, pack_id: 'pack_hipaa' },
        ],
      });
      expect(isEligibleForHumanReview(denyRecord)).toBe(false);
      expect(() =>
        buildHumanResolution(denyRecord, {
          disposition: 'AUTHORIZE',
          reason: 'should not work',
          resolved_by: 'reviewer_1',
        }),
      ).toThrow(/not eligible/i);
      expect(() => assertResumeEligible(denyRecord)).toThrow(/Only REVIEW|NOT_REVIEW/i);

      const review = sampleReviewRecord();
      const denied = withHumanResolution(
        review,
        buildHumanResolution(review, {
          disposition: 'DENY',
          reason: 'operator deny after CSF review',
          resolved_by: 'reviewer_1',
        }),
      );
      expect(denied.decision).toBe('REVIEW');
      expect(denied.human_resolution?.human_disposition).toBe('DENY');
      expect(denied.human_resolution?.final_decision).toBe('DENY');
      expect(() => assertResumeEligible(denied)).toThrow(/DENY_CANNOT_RESUME|cannot resume/i);
    });
  });

  describe('3. Applicability + generic resolution matrix', () => {
    it('single authority contributes; inapplicable packs skip; no industry-name inference', async () => {
      const repo = new InMemoryPolicyRepository();
      const pdp = new PackBackedEnterprisePdp(repo);

      const single = await pdp.evaluateLegacyRequest({
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
        governance_context: { management_system: FULL_GOVERNANCE.management_system },
        request_id: 'req_tcp_single',
      });
      expect(single.reason_codes.some((c) => c.startsWith('ISO42001_'))).toBe(true);
      expect(single.reason_codes.some((c) => c.startsWith('NIST_CSF_2_'))).toBe(false);
      expect(single.reason_codes.some((c) => c.startsWith('SOC2_'))).toBe(false);

      const inferred = await pdp.evaluateLegacyRequest({
        user: clinician,
        application: {
          ...clinicalApp,
          name: 'Hospital HIPAA Clinic EU ISO SOC NIST CSF Risk',
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
        request_id: 'req_tcp_no_infer',
      });
      expect(inferred.reason_codes.some((c) => c.startsWith('ISO42005_'))).toBe(false);
      expect(inferred.reason_codes.some((c) => c.startsWith('EU_AI_ACT_'))).toBe(false);
      expect(inferred.reason_codes.some((c) => c.startsWith('SOC2_'))).toBe(false);
      expect(inferred.reason_codes.some((c) => c.startsWith('NIST_CSF_2_'))).toBe(false);
    });

    it('matrix: AGREEMENT / COMPLEMENTARY / RESTRICTIVE / REVIEW / DENY / UNRESOLVED', () => {
      expect(
        resolvePackContributions([
          contrib({
            pack_id: 'pack_soc2',
            policy_id: 'pol_soc2_input',
            decision: 'ALLOW',
          }),
          contrib({
            pack_id: 'pack_nist_csf_2',
            policy_id: 'pol_nist_csf_2_input',
            decision: 'ALLOW',
          }),
        ]).resolution.category,
      ).toMatch(/AGREEMENT|COMPLEMENTARY/);

      const complementary = resolvePackContributions([
        contrib({
          pack_id: 'pack_owasp_llm_2025',
          policy_id: 'pol_owasp_llm_2025_input',
          decision: 'ALLOW',
          obligations: [{ code: 'LOG_GOVERNANCE_EVENT' }],
        }),
        contrib({
          pack_id: 'pack_iso_42001',
          policy_id: 'pol_iso_42001_input',
          decision: 'ALLOW',
          obligations: [{ code: 'REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION' }],
        }),
      ]);
      expect(complementary.resolution.category).toMatch(/COMPLEMENTARY|AGREEMENT/);
      expect(complementary.obligations.map((o) => o.code)).toEqual(
        expect.arrayContaining([
          'LOG_GOVERNANCE_EVENT',
          'REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION',
        ]),
      );

      expect(classifyDecisionPair('ALLOW', 'TOKENIZE')).toBe('RESTRICTIVE');
      const restrictive = resolvePackContributions([
        contrib({
          pack_id: 'pack_nist_csf_2',
          policy_id: 'pol_nist_csf_2_input',
          decision: 'ALLOW',
        }),
        contrib({
          pack_id: 'pack_hipaa',
          policy_id: 'pol_hipaa_phi_local',
          decision: 'TOKENIZE',
          transforms: [{ type: 'tokenize', targets: ['phi'] }],
        }),
      ]);
      expect(restrictive.resolution.category).toBe('RESTRICTIVE');
      expect(restrictive.decision).toBe('TOKENIZE');

      const reviewWins = resolvePackContributions([
        contrib({
          pack_id: 'pack_nist_csf_2',
          policy_id: 'pol_nist_csf_2_input',
          decision: 'ALLOW_WITH_CONTROLS',
        }),
        contrib({
          pack_id: 'pack_iso_42005',
          policy_id: 'pol_iso_42005_input',
          decision: 'REVIEW',
        }),
      ]);
      expect(reviewWins.decision).toBe('REVIEW');

      const denyWins = resolvePackContributions([
        contrib({
          pack_id: 'pack_nist_csf_2',
          policy_id: 'pol_nist_csf_2_input',
          decision: 'ALLOW_WITH_CONTROLS',
          precedence: { priority: 10, basis: 'DECLARED_POLICY_PRECEDENCE' },
        }),
        contrib({
          pack_id: 'pack_eu_ai_act',
          policy_id: 'pol_eu_ai_act_input',
          decision: 'DENY',
          precedence: { priority: 100, basis: 'DECLARED_POLICY_PRECEDENCE' },
        }),
      ]);
      expect(denyWins.decision).toBe('DENY');

      const unresolved = resolvePackContributions([
        contrib({
          pack_id: 'pack_nist_csf_2',
          policy_id: 'pol_nist_csf_2_input',
          decision: 'ALLOW',
        }),
        contrib({
          pack_id: 'pack_soc2',
          policy_id: 'pol_soc2_input',
          decision: 'ALLOW_WITH_CONTROLS',
        }),
      ]);
      // Compatible family may agree; force incompatible pair without precedence
      const unresolvedHard = resolvePackContributions([
        contrib({
          pack_id: 'pack_nist_csf_2',
          policy_id: 'pol_nist_csf_2_input',
          decision: 'ALLOW',
        }),
        contrib({
          pack_id: 'pack_hipaa',
          policy_id: 'pol_hipaa_phi_local',
          decision: 'DENY',
        }),
      ]);
      expect(unresolvedHard.resolution.category).toBe('UNRESOLVED');
      expect(unresolvedHard.decision).toBe('REVIEW');
      expect(unresolvedHard.reason_codes).toContain('POLICY_CONFLICT_UNRESOLVED');
      void unresolved;
    });

    const crossPairs: Array<[string, string, string, string]> = [
      ['pack_nist_csf_2', 'pol_nist_csf_2_input', 'pack_soc2', 'pol_soc2_input'],
      ['pack_nist_csf_2', 'pol_nist_csf_2_input', 'pack_iso_42001', 'pol_iso_42001_input'],
      ['pack_soc2', 'pol_soc2_input', 'pack_owasp_llm_2025', 'pol_owasp_llm_2025_input'],
      ['pack_eu_ai_act', 'pol_eu_ai_act_input', 'pack_nist_csf_2', 'pol_nist_csf_2_input'],
      ['pack_hipaa', 'pol_hipaa_phi_local', 'pack_nist_csf_2', 'pol_nist_csf_2_input'],
    ];

    it.each(crossPairs)(
      '%s + %s resolve without pack-specific precedence',
      (a, pa, b, pb) => {
        const r = resolvePackContributions([
          contrib({ pack_id: a, policy_id: pa, decision: 'ALLOW', reason_codes: [`${a}_OK`] }),
          contrib({ pack_id: b, policy_id: pb, decision: 'ALLOW', reason_codes: [`${b}_OK`] }),
        ]);
        expect(r.resolution.category).toMatch(/AGREEMENT|COMPLEMENTARY/);
        expect(getAuthorityForPack(a)!.id).not.toBe(getAuthorityForPack(b)!.id);
      },
    );
  });

  describe('4. Human resolution, resume, request correlation', () => {
    it('AUTHORIZE keeps machine REVIEW immutable; final intent ALLOW; resume eligibility', () => {
      const held: HeldRequestSnapshot = {
        version: 1,
        application_id: clinicalApp.application_id,
        organization_id: 'o1',
        user_id: clinician.user_id,
        operation: 'summarize',
        model: 'local-general-v1',
        messages: [{ role: 'user', content: 'Summarize note.' }],
        correlation_id: 'cor_tcp_resume',
        classification: {
          sensitivity: 'INTERNAL',
          confidence: 0.9,
          risk: 'medium',
          reason_codes: ['REGULATORY_APPLICABILITY:NIST_CSF_2'],
        },
        allowed_models: ['local-general-v1'],
        available_models: ['local-general-v1'],
      };
      const review = sampleReviewRecord({ held_request: held });
      const resolution = buildHumanResolution(review, {
        disposition: 'AUTHORIZE',
        reason: 'cybersecurity evidence accepted after review',
        resolved_by: 'reviewer_tcp',
      });
      const authorized = {
        ...withHumanResolution(review, resolution),
        execution: executionAfterAuthorize({
          ...withHumanResolution(review, resolution),
        }),
      };
      expect(authorized.decision).toBe('REVIEW');
      expect(authorized.human_resolution?.original_decision).toBe('REVIEW');
      expect(authorized.human_resolution?.human_disposition).toBe('AUTHORIZE');
      expect(authorized.human_resolution?.final_decision).toBe('ALLOW');
      expect(authorized.human_resolution?.resolved_by).toBe('reviewer_tcp');
      expect(authorized.execution?.status).toBe('AUTHORIZED_NOT_RESUMED');
      expect(() => assertResumeEligible(authorized)).not.toThrow();
    });

    it('request_id joins evaluation ↔ binding ↔ audit; mismatched request does not falsely verify', async () => {
      const repo = new InMemoryPolicyRepository();
      const pdp = new PackBackedEnterprisePdp(repo);
      const requestId = 'req_tcp_corr';
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
        governance_context: { cybersecurity: FULL_GOVERNANCE.cybersecurity },
        request_id: requestId,
      });
      const stored = repo.getEvaluation(decision.evaluation_id!)!;
      expect(stored.request_id).toBe(requestId);
      const binding = decisionBindingFromRecord(stored);

      const audit = new IntegrityAuditService(new InMemoryAuditService(), 'tcp-corr-key');
      const sealed = await audit.record({
        audit_id: 'aud_tcp_corr',
        timestamp: new Date().toISOString(),
        request_id: requestId,
        correlation_id: requestId,
        application_id: clinicalApp.application_id,
        user_id: clinician.user_id,
        model_selected: 'local-general-v1',
        operation: 'summarize',
        data_classification: 'INTERNAL',
        policy_decision: 'ALLOW',
        response_decision: 'RELEASE',
        evaluation_id: binding.evaluation_id,
        decision_hash: binding.decision_hash,
        metadata: { __response_content: 'ok' },
      });
      expect(sealed.request_id).toBe(requestId);
      expect(verifyAuditChain([sealed], 'tcp-corr-key').ok).toBe(true);

      const joined = findAuditForEvaluation(stored, [sealed]);
      expect(joined?.audit_id).toBe('aud_tcp_corr');
      const projected = projectEnforcementResult(stored, joined);
      // VERIFIED only when correlated enforcement matches expected action
      expect(['VERIFIED', 'FAILED', 'UNVERIFIED']).toContain(
        customerVerificationLabel(projected),
      );
      expect(projected.verified).toBe(true);
      expect(projected.request_id).toBe(requestId);

      const unrelated = { ...sealed, request_id: 'req_other', evaluation_id: undefined };
      expect(findAuditForEvaluation(stored, [unrelated as never])).toBeNull();
      expect(
        customerVerificationLabel(projectEnforcementResult(stored, null)),
      ).not.toBe('VERIFIED');

      // Plain ALLOW with matching RELEASE → VERIFIED (no false success without correlation)
      const allowRecord = sampleReviewRecord({
        evaluation_id: 'eval_tcp_allow_v',
        request_id: 'req_tcp_allow_v',
        decision: 'ALLOW',
        reason_codes: ['BASELINE_ALLOW'],
        obligations: [],
      });
      const allowSealed = await audit.record({
        audit_id: 'aud_tcp_allow_v',
        timestamp: new Date().toISOString(),
        request_id: 'req_tcp_allow_v',
        correlation_id: 'req_tcp_allow_v',
        policy_decision: 'ALLOW',
        response_decision: 'RELEASE',
        evaluation_id: allowRecord.evaluation_id,
        decision_hash: computeDecisionHash(allowRecord),
        metadata: { __response_content: 'ok' },
      });
      expect(
        customerVerificationLabel(projectEnforcementResult(allowRecord, allowSealed)),
      ).toBe('VERIFIED');
    });
  });

  describe('5. VERIFIED / crypto / response hash / simulation / degradation', () => {
    it('verification labels and simulate → NOT_EXECUTED (never false VERIFIED)', async () => {
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
        governance_context: { assurance: FULL_GOVERNANCE.assurance },
        evaluation_phase: 'simulate',
        request_id: 'req_tcp_sim',
      });
      const stored = repo.getEvaluation(decision.evaluation_id!)!;
      expect(stored.phase).toBe('simulate');
      const projected = projectEnforcementResult(stored, null);
      expect(projected.status).toBe('NOT_EXECUTED');
      expect(customerVerificationLabel(projected)).toBe('NOT_EXECUTED');
      expect(() => assertResumeEligible(stored)).toThrow();
    });

    it('decision_hash / event chain / response_hash detect tampering', async () => {
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
        governance_context: { cybersecurity: FULL_GOVERNANCE.cybersecurity },
        request_id: 'req_tcp_crypto',
      });
      const stored = repo.getEvaluation(decision.evaluation_id!)!;
      const h1 = computeDecisionHash(stored);
      const h2 = computeDecisionHash({ ...stored, decision: 'DENY' });
      expect(h1).not.toBe(h2);

      const audit = new IntegrityAuditService(new InMemoryAuditService(), 'tcp-crypto-key');
      const sealed = await audit.record({
        audit_id: 'aud_tcp_crypto',
        timestamp: new Date().toISOString(),
        request_id: 'req_tcp_crypto',
        correlation_id: 'req_tcp_crypto',
        policy_decision: 'ALLOW',
        response_decision: 'RELEASE',
        evaluation_id: stored.evaluation_id,
        decision_hash: h1,
        metadata: { __response_content: 'released bytes' },
      });
      expect(verifyAuditChain([sealed], 'tcp-crypto-key').ok).toBe(true);
      const tampered = { ...sealed, decision_hash: createHash('sha256').update('x').digest('hex') };
      expect(verifyAuditChain([tampered], 'tcp-crypto-key').ok).toBe(false);

      expect(hashResponseContent('released bytes')).toBe(hashResponseContent('released bytes'));
      expect(hashResponseContent('released bytes')).not.toBe(hashResponseContent('altered'));
      expect(hashResponseContent('')).toBe(hashResponseContent(''));
    });

    it('missing audit / missing evaluation binding → not VERIFIED success', () => {
      const review = sampleReviewRecord({ decision: 'ALLOW', reason_codes: ['OK'] });
      const projected = projectEnforcementResult(review, null);
      expect(projected.status).toMatch(/UNKNOWN|NOT_EXECUTED/);
      expect(customerVerificationLabel(projected)).not.toBe('VERIFIED');
      expect(() =>
        assertResumeEligible({
          decision: 'REVIEW',
          evaluation_id: 'eval_x',
          human_resolution: undefined,
        } as never),
      ).toThrow();
    });
  });

  describe('6. Explanation, provenance, historical, observability contract', () => {
    it('generic Decision Explanation + provenance distinguish source vs derived control', async () => {
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
            'REGULATORY_APPLICABILITY:NIST_CSF_2',
            'REGULATORY_APPLICABILITY:SOC_2',
          ],
        },
        deploymentMode: 'connected',
        purpose: 'treatment',
        governance_context: {
          assurance: FULL_GOVERNANCE.assurance,
          cybersecurity: FULL_GOVERNANCE.cybersecurity,
        },
        request_id: 'req_tcp_explain',
      });
      const explained = withOperatorExplanation(decision);
      expect(explained.decision).toBeTruthy();
      expect(explained.reason_codes.length).toBeGreaterThan(0);
      expect(explained.explanation.operator?.narrative).toBeTruthy();
      expect(explained.explanation.provenance?.sources?.length).toBeGreaterThan(0);
      const blob = JSON.stringify(explained);
      expect(blob).not.toMatch(
        /HipaaExplanation|NistCsfDashboard|Soc2Score|Iso42005DecisionExplanation/,
      );
      expect(blob).not.toMatch(/NIST CSF certified|SOC 2 certified|HIPAA certified/i);

      const csfAuth = getPolicyAuthority(POLICY_AUTHORITY_IDS.nistCsf2)!;
      expect(csfAuth.provenance.legal_authority).toBe(false);
      expect(csfAuth.provenance.notes ?? '').toMatch(/not.*certification|not.*assessment/i);
    });

    it('historical evaluation_as_of + snapshot immutability; packs avoid Date.now()', async () => {
      const repo = new InMemoryPolicyRepository();
      const pdp = new PackBackedEnterprisePdp(repo);
      const asOf = '2024-02-26';
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
        evaluation_as_of: asOf,
        governance_context: { cybersecurity: FULL_GOVERNANCE.cybersecurity },
        request_id: 'req_tcp_hist',
      });
      const before = evaluationRecordToDecisionPayload(
        repo.getEvaluation(decision.evaluation_id!)!,
      );
      const frozenCodes = [...before.reason_codes];
      const frozenDecision = before.decision;

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
          reason_codes: ['REGULATORY_APPLICABILITY:NIST_CSF_2'],
        },
        deploymentMode: 'connected',
        request_id: 'req_tcp_hist_new',
      });

      const after = evaluationRecordToDecisionPayload(
        repo.getEvaluation(decision.evaluation_id!)!,
      );
      expect(after.decision).toBe(frozenDecision);
      expect(after.reason_codes).toEqual(frozenCodes);

      const packRoot = resolve(process.cwd(), 'src/policy/enterprise/packs');
      for (const file of walkTsFiles(packRoot)) {
        const text = readFileSync(file, 'utf8');
        expect(text).not.toMatch(/\bDate\.now\s*\(/);
      }
    });
  });

  describe('7. Ten-authority realistic scenario + customer truth', () => {
    it('multi-authority health+LLM+cyber+assurance scenario → generic resolution → proof', async () => {
      const repo = new InMemoryPolicyRepository();
      const pdp = new PackBackedEnterprisePdp(repo);
      const requestId = 'req_tcp_realistic';
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
            'REGULATORY_APPLICABILITY:OWASP_LLM_2025',
            'REGULATORY_APPLICABILITY:ISO_42001',
            'REGULATORY_APPLICABILITY:ISO_23894',
            'REGULATORY_APPLICABILITY:ISO_42005',
            'REGULATORY_APPLICABILITY:SOC_2',
            'REGULATORY_APPLICABILITY:NIST_CSF_2',
            // EU AI Act + Part 2 only when explicitly applicable
            'REGULATORY_APPLICABILITY:EU_AI_ACT',
            'REGULATORY_APPLICABILITY:PART2',
          ],
        },
        deploymentMode: 'connected',
        purpose: 'treatment',
        source_system: 'ehr',
        authorization_context: 'part2_consent',
        evaluation_as_of: '2026-09-01',
        governance_context: FULL_GOVERNANCE,
        request_id: requestId,
      });

      expect(decision.reason_codes).not.toContain('POLICY_CONFLICT_UNRESOLVED');
      const stored = repo.getEvaluation(decision.evaluation_id!)!;
      expect(stored.request_id).toBe(requestId);
      expect(stored.decision).toBe(decision.decision);

      const sources = decision.explanation.provenance?.sources ?? [];
      for (const authId of TEN_AUTHORITY_IDS) {
        expect(sources.some((s) => s.authority_id === authId)).toBe(true);
      }

      const binding = decisionBindingFromRecord(stored);
      const audit = new IntegrityAuditService(new InMemoryAuditService(), 'tcp-real-key');
      const sealed = await audit.record({
        audit_id: 'aud_tcp_real',
        timestamp: new Date().toISOString(),
        request_id: requestId,
        correlation_id: requestId,
        application_id: clinicalApp.application_id,
        user_id: clinician.user_id,
        operation: 'summarize',
        policy_decision: decision.decision,
        response_decision: 'RELEASE',
        evaluation_id: binding.evaluation_id,
        decision_hash: binding.decision_hash,
        metadata: { __response_content: 'governed summary' },
      });
      expect(verifyAuditChain([sealed], 'tcp-real-key').ok).toBe(true);
      const projected = projectEnforcementResult(stored, sealed);
      // PHI + HIPAA may expect transforms; VERIFIED requires matching control evidence —
      // never claim VERIFIED solely because an unrelated audit exists.
      expect(projected.verified).toBe(true);
      expect(projected.request_id).toBe(requestId);
      expect(customerVerificationLabel(projected)).not.toBe('NOT_EXECUTED');
    });

    it('customer truth Q1–Q10: apply / decide / why / hold / enforce / prove / human / history / not certify', async () => {
      const repo = new InMemoryPolicyRepository();
      const pdp = new PackBackedEnterprisePdp(repo);

      // Q4 hold: missing CSF evidence while other packs satisfied
      const held = await pdp.evaluateLegacyRequest({
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
            'REGULATORY_APPLICABILITY:NIST_CSF_2',
            'REGULATORY_APPLICABILITY:SOC_2',
          ],
        },
        deploymentMode: 'connected',
        governance_context: { assurance: FULL_GOVERNANCE.assurance },
        request_id: 'req_tcp_q_hold',
      });
      expect(held.decision).toBe('REVIEW');
      expect(held.reason_codes.some((c) => c.startsWith('NIST_CSF_2_'))).toBe(true);
      // Q2 authoritative from policy_evaluations
      const heldStored = repo.getEvaluation(held.evaluation_id!)!;
      expect(heldStored.decision).toBe(held.decision);
      // Q1 policies apply
      expect(heldStored.applicable_policies.length).toBeGreaterThan(0);
      // Q3 why
      const why = withOperatorExplanation(held);
      expect(why.explanation.operator?.narrative).toBeTruthy();
      expect(why.explanation.provenance?.sources?.length).toBeGreaterThan(0);
      // Q4 which authority held — CSF contribution present
      expect(
        (held.explanation.provenance?.sources ?? []).some(
          (s) => s.authority_id === POLICY_AUTHORITY_IDS.nistCsf2,
        ),
      ).toBe(true);

      // Q7–Q8 human AUTHORIZE does not rewrite machine decision
      const authorized = withHumanResolution(
        heldStored,
        buildHumanResolution(heldStored, {
          disposition: 'AUTHORIZE',
          reason: 'accepted residual CSF evidence gap with compensating controls',
          resolved_by: 'approver_tcp',
        }),
      );
      expect(authorized.decision).toBe('REVIEW');
      expect(authorized.human_resolution?.resolved_by).toBe('approver_tcp');
      expect(authorized.human_resolution?.final_decision).toBe('ALLOW');

      // Q5–Q6 enforcement + binding after satisfied ten-authority path
      const full = await pdp.evaluateLegacyRequest({
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
          reason_codes: [...TEN_APPLICABILITY],
        },
        deploymentMode: 'connected',
        purpose: 'treatment',
        source_system: 'ehr',
        authorization_context: 'part2_consent',
        evaluation_as_of: '2026-09-01',
        governance_context: FULL_GOVERNANCE,
        request_id: 'req_tcp_q_full',
      });
      const fullStored = repo.getEvaluation(full.evaluation_id!)!;
      const binding = decisionBindingFromRecord(fullStored);
      expect(binding.evaluation_id).toBe(full.evaluation_id);
      expect(binding.decision_hash).toMatch(/^[a-f0-9]{64}$/);

      // Q9 historical replay from stored record
      const replay = evaluationRecordToDecisionPayload(fullStored);
      expect(replay.decision).toBe(full.decision);
      expect(replay.reason_codes).toEqual(full.reason_codes);

      // Q10 not certification
      const blob = JSON.stringify(withOperatorExplanation(full));
      expect(blob).not.toMatch(
        /certified|certification|audit opinion|CSF maturity|compliance percentage/i,
      );
      for (const authId of [
        POLICY_AUTHORITY_IDS.nistCsf2,
        POLICY_AUTHORITY_IDS.soc2,
        POLICY_AUTHORITY_IDS.nistAiRmf,
        POLICY_AUTHORITY_IDS.iso42001,
      ]) {
        const auth = getPolicyAuthority(authId)!;
        expect(auth.provenance.legal_authority).toBe(false);
        expect(String(auth.provenance.notes ?? '').length).toBeGreaterThan(0);
      }
      expect(getPolicyAuthority(POLICY_AUTHORITY_IDS.nistCsf2)?.provenance.notes ?? '').toMatch(
        /not.*certif|not.*assessment/i,
      );
      expect(getPolicyAuthority(POLICY_AUTHORITY_IDS.soc2)?.provenance.notes ?? '').toMatch(
        /not.*certif|not.*audit opinion/i,
      );
    });
  });

  describe('8. Architecture anti-regression + product sprawl', () => {
    it('no authority-specific Evaluator/Engine/Resolver/Gateway/Score/Dashboard', () => {
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
        'NistCsfEvaluator',
        'Iso38507Evaluator',
        'Iso38507Engine',
        'Iso38507Score',
        'Iso38507Dashboard',
        'Iso27001Evaluator',
        'Iso27001Engine',
        'Iso27001Score',
        'Iso27001Dashboard',
        'ComplianceEngine',
        'AssessmentEngine',
        'Soc2Dashboard',
        'NistCsfDashboard',
        'ImpactScore',
        'Soc2Score',
        'NistCsfScore',
      ];
      const hits: string[] = [];
      for (const root of [
        resolve(process.cwd(), 'src/policy'),
        resolve(process.cwd(), 'src/api'),
      ]) {
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

      expect(listRegisteredOverlayInterpreters()).toEqual(
        expect.arrayContaining([
          'nist_csf_2_pack_v1',
          'soc2_pack_v1',
          'iso_42005_pack_v1',
          'eu_ai_act_pack_v1',
          'iso_38507_pack_v1',
          'iso_27001_pack_v1',
        ]),
      );
      expect(listDomainPackIds('ai_risk')).toEqual(
        expect.arrayContaining([
          'pack_nist_csf_2',
          'pack_soc2',
          'pack_iso_42005',
          'pack_eu_ai_act',
          'pack_iso_38507',
          'pack_iso_27001',
        ]),
      );

      const resolution = readFileSync(
        resolve(process.cwd(), 'src/policy/enterprise/policy-resolution.ts'),
        'utf8',
      );
      expect(resolution).not.toMatch(/pack_nist_csf_2|pack_soc2|pack_hipaa|pack_eu_ai_act/);
      expect(resolution).not.toMatch(/if\s*\(\s*(pack_id|authority|framework)\s*===/);

      // Product sprawl: no new assessment/GRC pages under admin
      const adminSrc = resolve(process.cwd(), 'admin/src');
      if (existsSync(adminSrc)) {
        for (const file of walkTsFiles(adminSrc)) {
          const text = readFileSync(file, 'utf8');
          expect(text).not.toMatch(/NistCsfDashboard|Soc2Maturity|ComplianceScorePage/);
        }
      }
    });
  });
});
