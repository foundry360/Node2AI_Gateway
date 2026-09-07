/**
 * 14-Pack Control-Plane Stress Test (file name retained for continuity).
 *
 * Proves: fourteen live authorities remain policy knowledge plugged into one
 * control plane — Policy → Decision → Enforcement → Proof — without pack-specific
 * engines, scoring, certification claims, or namespace substitution.
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
import { INFOSEC_ALL } from './iso-27001.test.js';
import { PRIVACY_ALL } from './iso-27701.test.js';
import { ORG_GOVERNANCE_ALL } from './iso-38507.test.js';
import { CYBERSECURITY_ALL } from './nist-csf-2.test.js';
import { NIST_PF_ALL } from './nist-privacy-framework.test.js';

ensureDefaultOverlayRegistry();

const clinician: User = {
  user_id: 'u_12stress',
  organization_id: 'o1',
  roles: ['clinician'],
  permissions: [],
  status: 'active',
};

const clinicalApp: Application = {
  application_id: 'a_12stress',
  organization_id: 'o1',
  name: 'TwelvePackStressApp',
  type: 'clinical',
  environment: 'prod',
  status: 'active',
  trust_level: 'trusted',
  allowed_models: ['local-general-v1'],
  allowed_datasets: [],
  allowed_operations: ['summarize', 'write'],
};

const FOURTEEN_APPLICABILITY = [
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
  'REGULATORY_APPLICABILITY:ISO_27701',
  'REGULATORY_APPLICABILITY:NIST_PRIVACY_FRAMEWORK',
] as const;

/** @deprecated aliases — prefer FOURTEEN_* */
const THIRTEEN_APPLICABILITY = FOURTEEN_APPLICABILITY;
const TWELVE_APPLICABILITY = FOURTEEN_APPLICABILITY;

const FOURTEEN_AUTHORITY_IDS = [
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
  POLICY_AUTHORITY_IDS.iso38507,
  POLICY_AUTHORITY_IDS.iso27001,
  POLICY_AUTHORITY_IDS.iso27701,
  POLICY_AUTHORITY_IDS.nistPrivacyFramework,
] as const;

/** @deprecated aliases — prefer FOURTEEN_AUTHORITY_IDS */
const THIRTEEN_AUTHORITY_IDS = FOURTEEN_AUTHORITY_IDS;
const TWELVE_AUTHORITY_IDS = FOURTEEN_AUTHORITY_IDS;

const FOURTEEN_PACK_IDS = [
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
  'pack_iso_38507',
  'pack_iso_27001',
  'pack_iso_27701',
  'pack_nist_privacy_framework',
] as const;

/** @deprecated aliases — prefer FOURTEEN_PACK_IDS */
const THIRTEEN_PACK_IDS = FOURTEEN_PACK_IDS;
const TWELVE_PACK_IDS = FOURTEEN_PACK_IDS;

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
  cybersecurity: CYBERSECURITY_ALL,
  organizational_governance: ORG_GOVERNANCE_ALL,
  information_security: INFOSEC_ALL,
  privacy: { ...PRIVACY_ALL, nist_pf: NIST_PF_ALL },
  regulatory: {
    actor_role: 'deployer' as const,
    deployment_jurisdiction: 'EU',
    market_placement_jurisdiction: 'EU',
    prohibited_practice_code: 'none',
    regulatory_risk_category: 'MINIMAL_OR_NO_RISK' as const,
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

function sampleReview(
  overrides: Partial<PolicyEvaluationRecord> = {},
): PolicyEvaluationRecord {
  return {
    evaluation_id: 'eval_12stress_review',
    request_id: 'req_12stress_review',
    phase: 'input',
    subject: {},
    resource: {},
    action: 'SUMMARIZE',
    context: {},
    ai_context: {},
    evidence_in: {},
    decision: 'REVIEW',
    reason_codes: ['POLICY_CONFLICT_UNRESOLVED'],
    applicable_policies: [
      { policy_id: 'pol_iso_27001_input', version: 1, pack_id: 'pack_iso_27001' },
      { policy_id: 'pol_hipaa_phi_local', version: 3, pack_id: 'pack_hipaa' },
    ],
    obligations: [{ code: 'REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION' }],
    explanation: {
      matched_conditions: [],
      rejected_conditions: [],
      final_reason: 'unresolved multi-pack conflict',
      resolution: {
        category: 'UNRESOLVED',
        basis: 'UNRESOLVED_NO_PRECEDENCE',
        contributing_pack_ids: ['pack_iso_27001', 'pack_hipaa'],
        detail: 'ALLOW vs DENY',
        contributions: [],
      },
    },
    created_at: '2026-09-07T18:00:00.000Z',
    ...overrides,
  } as PolicyEvaluationRecord;
}

async function evaluateTwelve(
  repo: InMemoryPolicyRepository,
  requestId: string,
  extras: {
    applicability?: string[];
    governance?: typeof FULL_GOVERNANCE | Record<string, unknown>;
    phase?: 'input' | 'simulate';
    asOf?: string;
    app?: Application;
    sensitivity?: string;
  } = {},
) {
  const pdp = new PackBackedEnterprisePdp(repo);
  return pdp.evaluateLegacyRequest({
    user: clinician,
    application: extras.app ?? clinicalApp,
    operation: 'summarize',
    requestedModel: 'local-general-v1',
    availableModels: ['local-general-v1'],
    environment: 'prod',
    classification: {
      sensitivity: extras.sensitivity ?? 'PHI',
      confidence: 0.99,
      risk: extras.sensitivity === 'INTERNAL' ? 'medium' : 'high',
      reason_codes: extras.applicability ?? [...TWELVE_APPLICABILITY],
    },
    deploymentMode: 'connected',
    purpose: 'treatment',
    source_system: 'ehr',
    authorization_context: 'part2_consent',
    evaluation_as_of: extras.asOf ?? '2026-09-01',
    governance_context: (extras.governance ?? FULL_GOVERNANCE) as never,
    evaluation_phase: extras.phase,
    request_id: requestId,
  });
}

describe('14-Pack Control-Plane Stress Test', () => {
  describe('1. Portfolio + single decision authority + fourteen-authority lifecycle', () => {
    it('registers 14 authorities/packs; one policy_evaluations record is authoritative', async () => {
      expect(FOURTEEN_AUTHORITY_IDS).toHaveLength(14);
      const ids = listPolicyAuthorities().map((a) => a.id);
      for (const id of TWELVE_AUTHORITY_IDS) expect(ids).toContain(id);
      for (const packId of TWELVE_PACK_IDS) {
        expect(getAuthorityForPack(packId)?.id).toBeTruthy();
      }
      expect(treatsAsLegalAuthority(getPolicyAuthority(POLICY_AUTHORITY_IDS.hipaa)!)).toBe(
        true,
      );
      expect(treatsAsLegalAuthority(getPolicyAuthority(POLICY_AUTHORITY_IDS.iso27001)!)).toBe(
        false,
      );
      expect(treatsAsLegalAuthority(getPolicyAuthority(POLICY_AUTHORITY_IDS.iso27701)!)).toBe(
        false,
      );
      expect(
        treatsAsLegalAuthority(getPolicyAuthority(POLICY_AUTHORITY_IDS.nistPrivacyFramework)!),
      ).toBe(false);

      const repo = new InMemoryPolicyRepository();
      const requestId = 'req_12_auth_one';
      const decision = await evaluateTwelve(repo, requestId);

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
      for (const authId of TWELVE_AUTHORITY_IDS) {
        expect(sources.some((s) => s.authority_id === authId)).toBe(true);
      }

      // Gateway operational evidence binds to policy_evaluations — does not invent decisions
      const gw = createPhase1Gateway({
        config: { auditSigningKey: '12stress-key' },
      });
      const live = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
        application_id: 'app_clinical',
        user: { id: 'user_clinician' },
        operation: 'summarize',
        messages: [{ role: 'user', content: 'Summarize discharge note.' }],
      });
      expect(live.httpStatus).toBe(200);
      const events = await gw.audit.list();
      const bound = events[events.length - 1]!;
      expect(bound.evaluation_id).toBeTruthy();
      expect(bound.decision_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(repo.getEvaluation(decision.evaluation_id!)?.decision).toBe(decision.decision);
    });
  });

  describe('2. Generic resolution matrix', () => {
    it('AGREEMENT / COMPLEMENTARY / RESTRICTIVE / DENY / REVIEW / UNRESOLVED', () => {
      const agreement = resolvePackContributions([
        contrib({
          pack_id: 'pack_iso_42001',
          policy_id: 'pol_iso_42001_input',
          decision: 'ALLOW',
        }),
        contrib({
          pack_id: 'pack_iso_27001',
          policy_id: 'pol_iso_27001_input',
          decision: 'ALLOW',
        }),
        contrib({
          pack_id: 'pack_nist_csf_2',
          policy_id: 'pol_nist_csf_2_input',
          decision: 'ALLOW',
        }),
      ]);
      expect(agreement.resolution.category).toMatch(/AGREEMENT|COMPLEMENTARY/);

      const complementary = resolvePackContributions([
        contrib({
          pack_id: 'pack_iso_27001',
          policy_id: 'pol_iso_27001_input',
          decision: 'ALLOW',
          obligations: [{ code: 'LOG_GOVERNANCE_EVENT' }],
          controls: [{ control_id: 'ctrl_isms' }],
        }),
        contrib({
          pack_id: 'pack_owasp_llm_2025',
          policy_id: 'pol_owasp_llm_2025_input',
          decision: 'ALLOW',
          obligations: [{ code: 'REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION' }],
          controls: [{ control_id: 'ctrl_prompt_injection' }],
        }),
        contrib({
          pack_id: 'pack_iso_42001',
          policy_id: 'pol_iso_42001_input',
          decision: 'ALLOW',
          controls: [{ control_id: 'ctrl_aims' }],
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
          pack_id: 'pack_iso_27001',
          policy_id: 'pol_iso_27001_input',
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

      const denyWins = resolvePackContributions([
        contrib({
          pack_id: 'pack_iso_27001',
          policy_id: 'pol_iso_27001_input',
          decision: 'ALLOW',
          precedence: { priority: 10, basis: 'DECLARED_POLICY_PRECEDENCE' },
        }),
        contrib({
          pack_id: 'pack_soc2',
          policy_id: 'pol_soc2_input',
          decision: 'ALLOW',
          precedence: { priority: 20, basis: 'DECLARED_POLICY_PRECEDENCE' },
        }),
        contrib({
          pack_id: 'pack_eu_ai_act',
          policy_id: 'pol_eu_ai_act_input',
          decision: 'DENY',
          precedence: { priority: 100, basis: 'DECLARED_POLICY_PRECEDENCE' },
        }),
      ]);
      expect(denyWins.decision).toBe('DENY');

      const multiReview = resolvePackContributions([
        contrib({
          pack_id: 'pack_iso_27001',
          policy_id: 'pol_iso_27001_input',
          decision: 'REVIEW',
        }),
        contrib({
          pack_id: 'pack_iso_38507',
          policy_id: 'pol_iso_38507_input',
          decision: 'REVIEW',
        }),
        contrib({
          pack_id: 'pack_soc2',
          policy_id: 'pol_soc2_input',
          decision: 'ALLOW',
        }),
      ]);
      expect(multiReview.decision).toBe('REVIEW');

      const unresolved = resolvePackContributions([
        contrib({
          pack_id: 'pack_iso_27001',
          policy_id: 'pol_iso_27001_input',
          decision: 'ALLOW',
        }),
        contrib({
          pack_id: 'pack_hipaa',
          policy_id: 'pol_hipaa_phi_local',
          decision: 'DENY',
        }),
      ]);
      expect(unresolved.resolution.category).toBe('UNRESOLVED');
      expect(unresolved.decision).toBe('REVIEW');
      expect(unresolved.reason_codes).toContain('POLICY_CONFLICT_UNRESOLVED');
    });
  });

  describe('3. Applicability + namespace isolation', () => {
    it('subset applicability; no industry inference; namespaces do not substitute', async () => {
      const repo = new InMemoryPolicyRepository();

      const three = await evaluateTwelve(repo, 'req_12_three', {
        sensitivity: 'INTERNAL',
        applicability: [
          'REGULATORY_APPLICABILITY:ISO_27001',
          'REGULATORY_APPLICABILITY:ISO_42001',
          'REGULATORY_APPLICABILITY:OWASP_LLM_2025',
        ],
        governance: {
          information_security: INFOSEC_ALL,
          management_system: FULL_GOVERNANCE.management_system,
          security_controls: FULL_GOVERNANCE.security_controls,
        },
        app: { ...clinicalApp, type: 'internal' },
      });
      expect(three.reason_codes.some((c) => c.startsWith('ISO27001_'))).toBe(true);
      expect(three.reason_codes.some((c) => c.startsWith('ISO42001_'))).toBe(true);
      expect(three.reason_codes.some((c) => c.includes('OWASP') || c.startsWith('OWASP'))).toBe(
        true,
      );
      expect(three.reason_codes.some((c) => c.startsWith('SOC2_'))).toBe(false);
      expect(three.reason_codes.some((c) => c.startsWith('NIST_CSF_2_'))).toBe(false);

      // SOC2 evidence alone does not satisfy ISO27001
      const soc2Only = await evaluateTwelve(repo, 'req_12_soc2_ne_27001', {
        sensitivity: 'INTERNAL',
        applicability: ['REGULATORY_APPLICABILITY:ISO_27001'],
        governance: { assurance: FULL_GOVERNANCE.assurance },
        app: { ...clinicalApp, type: 'internal' },
      });
      expect(soc2Only.decision).toBe('REVIEW');
      expect(soc2Only.reason_codes.some((c) => c.startsWith('ISO27001_'))).toBe(true);

      // CSF evidence alone does not satisfy ISO27001
      const csfOnly = await evaluateTwelve(repo, 'req_12_csf_ne_27001', {
        sensitivity: 'INTERNAL',
        applicability: ['REGULATORY_APPLICABILITY:ISO_27001'],
        governance: { cybersecurity: CYBERSECURITY_ALL },
        app: { ...clinicalApp, type: 'internal' },
      });
      expect(csfOnly.decision).toBe('REVIEW');

      const inferred = await evaluateTwelve(repo, 'req_12_no_infer', {
        sensitivity: 'INTERNAL',
        applicability: [],
        governance: {},
        app: {
          ...clinicalApp,
          type: 'internal',
          name: 'HIPAA EU ISO SOC2 NIST CSF 27001 Hospital Clinic',
        },
      });
      expect(inferred.reason_codes.some((c) => c.startsWith('ISO27001_'))).toBe(false);
      expect(inferred.reason_codes.some((c) => c.startsWith('ISO38507_'))).toBe(false);
      expect(inferred.reason_codes.some((c) => c.startsWith('SOC2_'))).toBe(false);
    });
  });

  describe('4. REVIEW / human resolution / resume / DENY', () => {
    it('REVIEW safety hold ≠ policy DENY; AUTHORIZE/DENY immutable; resume path', () => {
      const review = sampleReview();
      const held = projectEnforcementResult(review, {
        audit_id: 'aud_hold',
        timestamp: new Date().toISOString(),
        request_id: review.request_id!,
        correlation_id: review.request_id!,
        policy_decision: 'REVIEW',
        response_decision: 'BLOCK',
      } as never);
      expect(held.status).toBe('REVIEW_REQUIRED');
      expect(held.safety_fallback).toBe(true);
      expect(held.status).not.toBe('BLOCKED');
      expect(customerVerificationLabel(held)).toBe('UNVERIFIED');

      const heldSnap: HeldRequestSnapshot = {
        version: 1,
        application_id: clinicalApp.application_id,
        organization_id: 'o1',
        user_id: clinician.user_id,
        operation: 'summarize',
        model: 'local-general-v1',
        messages: [{ role: 'user', content: 'note' }],
        correlation_id: 'cor_12',
        classification: {
          sensitivity: 'PHI',
          confidence: 0.99,
          risk: 'high',
          reason_codes: [...TWELVE_APPLICABILITY],
        },
        allowed_models: ['local-general-v1'],
        available_models: ['local-general-v1'],
      };
      const withHold = sampleReview({ held_request: heldSnap });
      const authorized = {
        ...withHumanResolution(
          withHold,
          buildHumanResolution(withHold, {
            disposition: 'AUTHORIZE',
            reason: 'documented compensating controls',
            resolved_by: 'approver_12',
          }),
        ),
        execution: executionAfterAuthorize(
          withHumanResolution(
            withHold,
            buildHumanResolution(withHold, {
              disposition: 'AUTHORIZE',
              reason: 'documented compensating controls',
              resolved_by: 'approver_12',
            }),
          ),
        ),
      };
      expect(authorized.decision).toBe('REVIEW');
      expect(authorized.human_resolution?.final_decision).toBe('ALLOW');
      expect(authorized.human_resolution?.resolved_by).toBe('approver_12');
      expect(() => assertResumeEligible(authorized)).not.toThrow();

      const denied = withHumanResolution(
        withHold,
        buildHumanResolution(withHold, {
          disposition: 'DENY',
          reason: 'governance conflict unresolved by reviewer',
          resolved_by: 'approver_12',
        }),
      );
      expect(denied.decision).toBe('REVIEW');
      expect(denied.human_resolution?.final_decision).toBe('DENY');
      expect(() => assertResumeEligible(denied)).toThrow(/DENY_CANNOT_RESUME|cannot resume/i);

      const machineDeny = sampleReview({
        decision: 'DENY',
        reason_codes: ['HIPAA_DENY'],
        explanation: {
          matched_conditions: [],
          rejected_conditions: [],
          final_reason: 'deny',
        },
      });
      expect(isEligibleForHumanReview(machineDeny)).toBe(false);
      expect(() =>
        buildHumanResolution(machineDeny, {
          disposition: 'AUTHORIZE',
          reason: 'should fail',
          resolved_by: 'x',
        }),
      ).toThrow(/not eligible/i);
    });
  });

  describe('5. Correlation, verification, crypto, response hash, simulation', () => {
    it('request_id join; VERIFIED labels; tamper detection; simulate NOT_EXECUTED', async () => {
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
      const requestId = 'req_12_corr';
      const decision = await evaluateTwelve(repo, requestId, {
        sensitivity: 'INTERNAL',
        applicability: ['REGULATORY_APPLICABILITY:ISO_27001'],
        governance: { information_security: INFOSEC_ALL },
        app: { ...clinicalApp, type: 'internal' },
      });
      const stored = repo.getEvaluation(decision.evaluation_id!)!;
      const binding = decisionBindingFromRecord(stored);
      const audit = new IntegrityAuditService(new InMemoryAuditService(), '12-corr-key');
      const sealed = await audit.record({
        audit_id: 'aud_12_corr',
        timestamp: new Date().toISOString(),
        request_id: requestId,
        correlation_id: requestId,
        application_id: clinicalApp.application_id,
        user_id: clinician.user_id,
        operation: 'summarize',
        policy_decision: 'ALLOW',
        response_decision: 'RELEASE',
        evaluation_id: binding.evaluation_id,
        decision_hash: binding.decision_hash,
        metadata: { __response_content: 'released bytes' },
      });
      expect(verifyAuditChain([sealed], '12-corr-key').ok).toBe(true);
      expect(findAuditForEvaluation(stored, [sealed])?.audit_id).toBe('aud_12_corr');
      expect(
        findAuditForEvaluation(stored, [
          { ...sealed, request_id: 'req_other', evaluation_id: undefined } as never,
        ]),
      ).toBeNull();
      expect(
        customerVerificationLabel(projectEnforcementResult(stored, null)),
      ).not.toBe('VERIFIED');

      const h1 = computeDecisionHash(stored);
      const denyClone = structuredClone(stored);
      denyClone.decision = 'DENY';
      expect(computeDecisionHash(denyClone)).not.toBe(h1);
      const tampered = {
        ...sealed,
        decision_hash: createHash('sha256').update('x').digest('hex'),
      };
      expect(verifyAuditChain([tampered], '12-corr-key').ok).toBe(false);
      expect(hashResponseContent('released bytes')).not.toBe(hashResponseContent('altered'));
      expect(hashResponseContent('')).toBe(hashResponseContent(''));

      const sim = await evaluateTwelve(repo, 'req_12_sim', {
        sensitivity: 'INTERNAL',
        applicability: ['REGULATORY_APPLICABILITY:ISO_27001'],
        governance: { information_security: INFOSEC_ALL },
        phase: 'simulate',
        app: { ...clinicalApp, type: 'internal' },
      });
      const simStored = repo.getEvaluation(sim.evaluation_id!)!;
      expect(simStored.phase).toBe('simulate');
      expect(customerVerificationLabel(projectEnforcementResult(simStored, null))).toBe(
        'NOT_EXECUTED',
      );
      expect(() => assertResumeEligible(simStored)).toThrow();
    });
  });

  describe('6. Explanation, provenance, historical, concurrency, customer truth', () => {
    it('fourteen-authority explanation + provenance; no certification/score language', async () => {
      const repo = new InMemoryPolicyRepository();
      const decision = await evaluateTwelve(repo, 'req_12_explain');
      const explained = withOperatorExplanation(decision);
      expect(explained.explanation.operator?.narrative).toBeTruthy();
      expect(explained.explanation.provenance?.sources?.length).toBeGreaterThanOrEqual(14);
      const blob = JSON.stringify(explained);
      expect(blob).not.toMatch(
        /14\/14 compliant|13\/13 compliant|12\/12 compliant|ISO compliant|certified|100% compliant|risk score|Annex A score|privacy score/i,
      );
      expect(blob).not.toMatch(
        /HipaaExplanation|Iso27001Dashboard|Iso27701Dashboard|Soc2Score|NistPrivacyDashboard|PrivacyScore/,
      );

      // Overlapping themes retain distinct authorities
      expect(
        (decision.explanation.provenance?.sources ?? []).some(
          (s) => s.authority_id === POLICY_AUTHORITY_IDS.iso27001,
        ),
      ).toBe(true);
      expect(
        (decision.explanation.provenance?.sources ?? []).some(
          (s) => s.authority_id === POLICY_AUTHORITY_IDS.iso27701,
        ),
      ).toBe(true);
      expect(
        (decision.explanation.provenance?.sources ?? []).some(
          (s) => s.authority_id === POLICY_AUTHORITY_IDS.nistPrivacyFramework,
        ),
      ).toBe(true);
      expect(
        (decision.explanation.provenance?.sources ?? []).some(
          (s) => s.authority_id === POLICY_AUTHORITY_IDS.nistCsf2,
        ),
      ).toBe(true);
      expect(POLICY_AUTHORITY_IDS.iso27001).not.toBe(POLICY_AUTHORITY_IDS.nistCsf2);
      expect(POLICY_AUTHORITY_IDS.soc2).not.toBe(POLICY_AUTHORITY_IDS.iso27001);
      expect(POLICY_AUTHORITY_IDS.iso27701).not.toBe(POLICY_AUTHORITY_IDS.iso27001);
      expect(POLICY_AUTHORITY_IDS.nistPrivacyFramework).not.toBe(POLICY_AUTHORITY_IDS.iso27701);
    });

    it('historical snapshot immutability; packs avoid Date.now(); concurrency isolation', async () => {
      const repo = new InMemoryPolicyRepository();
      const a = await evaluateTwelve(repo, 'req_12_hist_a', {
        sensitivity: 'INTERNAL',
        asOf: '2024-01-15',
        applicability: ['REGULATORY_APPLICABILITY:ISO_27001'],
        governance: { information_security: INFOSEC_ALL },
        app: { ...clinicalApp, type: 'internal' },
      });
      const frozen = evaluationRecordToDecisionPayload(repo.getEvaluation(a.evaluation_id!)!);

      const b = await evaluateTwelve(repo, 'req_12_hist_b', {
        sensitivity: 'INTERNAL',
        applicability: ['REGULATORY_APPLICABILITY:ISO_27001'],
        governance: {},
        app: { ...clinicalApp, type: 'internal' },
      });
      expect(b.decision).toBe('REVIEW');
      expect(repo.getEvaluation(b.evaluation_id!)!.request_id).toBe('req_12_hist_b');

      const afterA = evaluationRecordToDecisionPayload(repo.getEvaluation(a.evaluation_id!)!);
      expect(afterA.decision).toBe(frozen.decision);
      expect(afterA.reason_codes).toEqual(frozen.reason_codes);
      expect(a.evaluation_id).not.toBe(b.evaluation_id);
      expect(repo.getEvaluation(a.evaluation_id!)!.request_id).not.toBe(
        repo.getEvaluation(b.evaluation_id!)!.request_id,
      );

      const packRoot = resolve(process.cwd(), 'src/policy/enterprise/packs');
      for (const file of walkTsFiles(packRoot)) {
        expect(readFileSync(file, 'utf8')).not.toMatch(/\bDate\.now\s*\(/);
      }
    });

    it('customer truth: hold cause, enforce, prove, authorize, simulate, no cert equivalence', async () => {
      const repo = new InMemoryPolicyRepository();

      // Q1/Q6 hold cause
      const held = await evaluateTwelve(repo, 'req_12_q_hold', {
        sensitivity: 'INTERNAL',
        applicability: [
          'REGULATORY_APPLICABILITY:ISO_27001',
          'REGULATORY_APPLICABILITY:SOC_2',
        ],
        governance: { assurance: FULL_GOVERNANCE.assurance },
        app: { ...clinicalApp, type: 'internal' },
      });
      expect(held.decision).toBe('REVIEW');
      expect(held.reason_codes.some((c) => c.startsWith('ISO27001_'))).toBe(true);
      const heldStored = repo.getEvaluation(held.evaluation_id!)!;
      expect(heldStored.decision).toBe('REVIEW');
      expect(withOperatorExplanation(held).explanation.operator?.narrative).toBeTruthy();

      // Q4/Q10 human authorize does not rewrite machine decision; conflict → REVIEW not arbitrary win
      const authorized = withHumanResolution(
        heldStored,
        buildHumanResolution(heldStored, {
          disposition: 'AUTHORIZE',
          reason: 'accepted ISMS compensating evidence',
          resolved_by: 'ciso_approver',
        }),
      );
      expect(authorized.decision).toBe('REVIEW');
      expect(authorized.human_resolution?.resolved_by).toBe('ciso_approver');

      // Q5 simulation
      const sim = await evaluateTwelve(repo, 'req_12_q_sim', { phase: 'simulate' });
      expect(
        customerVerificationLabel(
          projectEnforcementResult(repo.getEvaluation(sim.evaluation_id!)!, null),
        ),
      ).toBe('NOT_EXECUTED');

      // Q2/Q3/Q7 fourteen-auth proof path
      const full = await evaluateTwelve(repo, 'req_12_q_full');
      const fullStored = repo.getEvaluation(full.evaluation_id!)!;
      const binding = decisionBindingFromRecord(fullStored);
      expect(binding.evaluation_id).toBe(full.evaluation_id);
      expect(binding.decision_hash).toMatch(/^[a-f0-9]{64}$/);
      const sources = full.explanation.provenance?.sources ?? [];
      for (const authId of FOURTEEN_AUTHORITY_IDS) {
        expect(sources.some((s) => s.authority_id === authId)).toBe(true);
      }

      // Q8/Q9 no certification / no SOC2≡ISO27001 / no privacy≡infosec / no NIST PF≡ISO 27701
      const blob = JSON.stringify(withOperatorExplanation(full));
      expect(blob).not.toMatch(
        /certified|certification achieved|ISO 27001 compliant|ISO 27701 compliant|privacy score/i,
      );
      expect(getPolicyAuthority(POLICY_AUTHORITY_IDS.iso27001)?.provenance.notes ?? '').toMatch(
        /not.*certification/i,
      );
      expect(getPolicyAuthority(POLICY_AUTHORITY_IDS.iso27701)?.provenance.notes ?? '').toMatch(
        /not.*certification/i,
      );
      expect(
        getPolicyAuthority(POLICY_AUTHORITY_IDS.nistPrivacyFramework)?.provenance.notes ?? '',
      ).toMatch(/not.*certification/i);
      expect(POLICY_AUTHORITY_IDS.soc2).not.toBe(POLICY_AUTHORITY_IDS.iso27001);
      expect(POLICY_AUTHORITY_IDS.iso27701).not.toBe(POLICY_AUTHORITY_IDS.iso27001);
      expect(POLICY_AUTHORITY_IDS.nistPrivacyFramework).not.toBe(POLICY_AUTHORITY_IDS.iso27701);
    });
  });

  describe('7. Failure / degradation + architecture anti-regression', () => {
    it('missing audit / missing resolution fail safely; no pack-specific engines', () => {
      const review = sampleReview({ decision: 'ALLOW', reason_codes: ['OK'] });
      expect(customerVerificationLabel(projectEnforcementResult(review, null))).not.toBe(
        'VERIFIED',
      );
      expect(() =>
        assertResumeEligible({
          decision: 'REVIEW',
          evaluation_id: 'eval_x',
          human_resolution: undefined,
        } as never),
      ).toThrow();

      const forbidden = [
        'HipaaEvaluator',
        'Iso27001Evaluator',
        'Iso27001Engine',
        'Iso27001Resolver',
        'Iso27001Gateway',
        'Iso27001Score',
        'Iso27001Dashboard',
        'Iso27701Evaluator',
        'Iso27701Engine',
        'Iso27701Resolver',
        'Iso27701Gateway',
        'Iso27701Score',
        'Iso27701Dashboard',
        'NistPrivacyEvaluator',
        'NistPrivacyEngine',
        'NistPrivacyResolver',
        'NistPrivacyGateway',
        'NistPrivacyDashboard',
        'PrivacyScore',
        'PrivacyAssessmentEngine',
        'PrivacyScoreEngine',
        'Soc2Score',
        'NistCsfDashboard',
        'ComplianceEngine',
        'AssessmentEngine',
        'CertificationEngine',
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
          'iso_27001_pack_v1',
          'iso_27701_pack_v1',
          'nist_privacy_framework_pack_v1',
          'iso_38507_pack_v1',
          'nist_csf_2_pack_v1',
          'soc2_pack_v1',
        ]),
      );
      expect(listDomainPackIds('ai_risk')).toEqual(
        expect.arrayContaining([
          ...FOURTEEN_PACK_IDS.filter((p) => p !== 'pack_hipaa' && p !== 'pack_42_cfr_part_2'),
        ]),
      );

      const resolution = readFileSync(
        resolve(process.cwd(), 'src/policy/enterprise/policy-resolution.ts'),
        'utf8',
      );
      expect(resolution).not.toMatch(
        /pack_iso_27001|pack_iso_27701|pack_nist_privacy_framework|pack_hipaa|pack_eu_ai_act|pack_soc2|pack_nist_csf/,
      );
      expect(resolution).not.toMatch(/if\s*\(\s*(pack_id|authority|framework)\s*===/);

      const pdp = readFileSync(
        resolve(process.cwd(), 'src/policy/enterprise/pack-pdp.ts'),
        'utf8',
      );
      expect(pdp).not.toMatch(/if\s*\(\s*authority\s*===|if\s*\(\s*framework\s*===/);
    });
  });
});
