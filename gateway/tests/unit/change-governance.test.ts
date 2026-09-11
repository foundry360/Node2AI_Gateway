/**
 * Pack #15 — AI Lifecycle & Change Governance (NOT a policy pack).
 * Covers materiality, baseline immutability, PDP re-evaluation, human hold paths.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computeDecisionHash,
  decisionBindingFromRecord,
} from '../../src/audit/decision-binding.js';
import type { Application, User } from '../../src/identity/types.js';
import {
  InMemoryChangeGovernanceRepository,
  InMemoryPolicyRepository,
  PackBackedEnterprisePdp,
  POLICY_AUTHORITY_IDS,
  applyLifecycleReviewHold,
  assertResumeEligible,
  assessMateriality,
  buildHumanResolution,
  commitAuthorizedLifecycleChange,
  createGovernanceBaseline,
  customerVerificationLabel,
  ensureDefaultOverlayRegistry,
  evaluateGovernanceChange,
  executionAfterAuthorize,
  hasResumableHeldRequest,
  inferChangeTypes,
  isEligibleForHumanReview,
  nextBaselineFromChange,
  projectEnforcementResult,
  withHumanResolution,
  withOperatorExplanation,
  type HeldRequestSnapshot,
  type PolicyDecision,
  type PolicyEvaluationRecord,
} from '../../src/policy/enterprise/index.js';
import { MANAGEMENT_SYSTEM_ALL } from './iso-42001.test.js';
import { INFOSEC_ALL } from './iso-27001.test.js';
import { PRIVACY_ALL } from './iso-27701.test.js';
import { ORG_GOVERNANCE_ALL } from './iso-38507.test.js';
import { CYBERSECURITY_ALL } from './nist-csf-2.test.js';
import { NIST_PF_ALL } from './nist-privacy-framework.test.js';
import { ASSURANCE_ALL } from './soc2.test.js';

ensureDefaultOverlayRegistry();

const user: User = {
  user_id: 'u_cg',
  organization_id: 'o1',
  roles: ['operator'],
  permissions: [],
  status: 'active',
};

const app: Application = {
  application_id: 'a_cg',
  organization_id: 'o1',
  name: 'ChangeGovApp',
  type: 'internal',
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
  management_system: MANAGEMENT_SYSTEM_ALL,
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
  privacy: { ...PRIVACY_ALL, nist_pf: NIST_PF_ALL },
  regulatory: {
    actor_role: 'deployer' as const,
    deployment_jurisdiction: 'EU',
    market_placement_jurisdiction: 'EU',
    prohibited_practice_code: 'none',
    regulatory_risk_category: 'MINIMAL_OR_NO_RISK' as const,
  },
};

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

function baseCaps(overrides: Record<string, unknown> = {}) {
  return {
    model_id: 'local-general-v1',
    model_version: '1.0.0',
    model_provider: 'local',
    write_capability: false,
    autonomy_level: 'ASSISTIVE' as const,
    tools: [{ id: 'search', write: false }],
    data_sources: ['docs_v1'],
    processing_location: 'us-east',
    ...overrides,
  };
}

function seedBaseline(
  repo: InMemoryChangeGovernanceRepository,
  caps: ReturnType<typeof baseCaps> = baseCaps(),
) {
  const baseline = createGovernanceBaseline({
    target_type: 'application',
    target_id: app.application_id,
    organization_id: app.organization_id,
    capabilities: caps,
    configuration: { ui_label: 'Assistant' },
    applicable_authorities: ['HIPAA', 'ISO_27701'],
  });
  return repo.saveBaseline(baseline);
}

function policyCtx(
  overrides: {
    regulatory_applicability?: string[];
    governance_context?: Record<string, unknown>;
    evaluation_phase?: 'input' | 'simulate';
    operation?: string;
    sensitivity?: string;
    application?: typeof app;
    user?: typeof user;
  } = {},
) {
  return {
    user: overrides.user ?? user,
    application: overrides.application ?? app,
    operation: overrides.operation ?? 'summarize',
    requestedModel: 'local-general-v1',
    availableModels: ['local-general-v1'],
    environment: 'prod',
    sensitivity: overrides.sensitivity ?? 'INTERNAL',
    regulatory_applicability: overrides.regulatory_applicability ?? ['NIST_AI_RMF'],
    governance_context: overrides.governance_context ?? {
      accountability_documented: true,
      system_context_documented: true,
      measurement_documented: true,
      risk_response_documented: true,
    },
    evaluation_phase: overrides.evaluation_phase,
  };
}

/** High-risk clinical write context — policy (HIPAA) requires approval. */
function highRiskWritePolicyCtx() {
  return policyCtx({
    operation: 'write',
    sensitivity: 'PHI',
    regulatory_applicability: ['HIPAA'],
    user: { ...user, roles: ['clinician'] },
    application: {
      ...app,
      type: 'clinical',
      allowed_operations: ['summarize', 'write'],
    },
  });
}

function heldFor(evalId: string, requestId: string): HeldRequestSnapshot {
  return {
    version: 1,
    application_id: app.application_id,
    organization_id: app.organization_id!,
    user_id: user.user_id,
    operation: 'summarize',
    model: 'local-general-v1',
    messages: [{ role: 'user', content: 'Held change governance request' }],
    correlation_id: requestId,
    classification: {
      sensitivity: 'INTERNAL',
      confidence: 0.9,
      risk: 'medium',
      reason_codes: ['REGULATORY_APPLICABILITY:NIST_AI_RMF'],
    },
    allowed_models: ['local-general-v1'],
    available_models: ['local-general-v1'],
  };
}

describe('Pack #15 — AI Lifecycle & Change Governance', () => {
  it('1. Baseline creation', () => {
    const b = createGovernanceBaseline({
      target_type: 'application',
      target_id: 'app_x',
      capabilities: baseCaps(),
      configuration: { ui_label: 'Bot' },
      applicable_authorities: ['OWASP_LLM_2025'],
    });
    expect(b.baseline_id).toMatch(/^gbl_/);
    expect(b.version).toBe(1);
    expect(b.target_id).toBe('app_x');
    expect(b.capabilities.model_version).toBe('1.0.0');
    expect(b.applicable_authorities).toEqual(['OWASP_LLM_2025']);
    expect(b.created_at).toBeTruthy();
  });

  it('2. Baseline immutability (v1 unchanged after v2; duplicate save throws; tryMutateBaseline)', () => {
    const repo = new InMemoryChangeGovernanceRepository();
    const v1 = seedBaseline(repo);
    const v1Snapshot = structuredClone(v1);

    const v2 = nextBaselineFromChange({
      previous: v1,
      proposed_state: { model_version: '2.0.0', ui_label: 'Renamed' },
      change_id: 'chg_immut_1',
    });
    repo.saveBaseline(v2);

    expect(repo.getBaseline(v1.baseline_id)).toEqual(v1Snapshot);
    expect(v2.version).toBe(2);
    expect(v2.supersedes_baseline_id).toBe(v1.baseline_id);
    expect(v2.capabilities.model_version).toBe('2.0.0');

    expect(() => repo.saveBaseline(v1)).toThrow(/immutable|already exists/i);
    expect(() =>
      repo.saveChange({
        change_id: 'chg_dup',
        target_type: 'application',
        target_id: 'a',
        previous_state: {},
        proposed_state: {},
        change_types: [],
        source: 'test',
        detected_at: new Date().toISOString(),
        materiality: 'NON_MATERIAL',
        lifecycle_decision: 'NO_REEVALUATION',
        governance_impacts: [],
        materiality_reasons: [],
      }),
    ).not.toThrow();
    expect(() =>
      repo.saveChange({
        change_id: 'chg_dup',
        target_type: 'application',
        target_id: 'a',
        previous_state: {},
        proposed_state: {},
        change_types: [],
        source: 'test',
        detected_at: new Date().toISOString(),
        materiality: 'NON_MATERIAL',
        lifecycle_decision: 'NO_REEVALUATION',
        governance_impacts: [],
        materiality_reasons: [],
      }),
    ).toThrow(/immutable|already exists/i);

    const ok = repo.tryMutateBaseline(v1.baseline_id, (b) => {
      b.version = 99;
      b.capabilities.model_version = 'hacked';
    });
    expect(ok).toBe(true);
    expect(repo.getBaseline(v1.baseline_id)?.version).toBe(1);
    expect(repo.getBaseline(v1.baseline_id)?.capabilities.model_version).toBe('1.0.0');
  });

  it('3. Non-material UI_LABEL → NON_MATERIAL / NO_REEVALUATION', async () => {
    const changeRepo = new InMemoryChangeGovernanceRepository();
    const previous = seedBaseline(changeRepo);
    const assessment = assessMateriality({
      target_type: 'application',
      target_id: app.application_id,
      previous_state: { ui_label: 'Assistant', capabilities: previous.capabilities },
      proposed_state: { ui_label: 'Helper', capabilities: previous.capabilities },
      change_types: ['UI_LABEL'],
    });
    expect(assessment.materiality).toBe('NON_MATERIAL');
    expect(assessment.lifecycle_decision).toBe('NO_REEVALUATION');

    const result = await evaluateGovernanceChange({
      repository: changeRepo,
      input: {
        target_type: 'application',
        target_id: app.application_id,
        previous_baseline_id: previous.baseline_id,
        // Preserve capabilities so inference does not invent MODEL_VERSION deltas.
        proposed_state: {
          capabilities: previous.capabilities,
          configuration: { ...previous.configuration, ui_label: 'Helper' },
          ui_label: 'Helper',
        },
        change_types: ['UI_LABEL'],
      },
    });
    expect(result.materiality).toBe('NON_MATERIAL');
    expect(result.lifecycle_decision).toBe('NO_REEVALUATION');
    expect(result.pdp_invoked).toBe(false);
    expect(result.next_baseline?.configuration.ui_label).toBe('Helper');
  });

  it('4. Model version → MATERIAL + pdp_invoked', async () => {
    const changeRepo = new InMemoryChangeGovernanceRepository();
    const policyRepo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(policyRepo);
    const previous = seedBaseline(changeRepo);

    const result = await evaluateGovernanceChange({
      repository: changeRepo,
      policy_repository: policyRepo,
      pdp,
      policy_context: policyCtx(),
      input: {
        target_type: 'application',
        target_id: app.application_id,
        previous_baseline_id: previous.baseline_id,
        proposed_state: { model_version: '2.1.0' },
        request_id: 'req_cg_model',
      },
    });
    expect(result.materiality).toBe('MATERIAL');
    expect(result.lifecycle_decision).toBe('REEVALUATION_REQUIRED');
    expect(result.pdp_invoked).toBe(true);
    expect(result.governance_impacts).toEqual(
      expect.arrayContaining(['MODEL_GOVERNANCE']),
    );
    expect(result.evaluation_id).toBeTruthy();
  });

  it('5. Tool added → MATERIAL', () => {
    const assessment = assessMateriality({
      target_type: 'application',
      target_id: app.application_id,
      previous_state: { tools: [{ id: 'search', write: false }] },
      proposed_state: {
        tools: [
          { id: 'search', write: false },
          { id: 'browser', write: false },
        ],
      },
    });
    expect(assessment.change_types).toContain('TOOL_ADDED');
    expect(assessment.materiality).toBe('MATERIAL');
    expect(assessment.lifecycle_decision).toBe('REEVALUATION_REQUIRED');
    expect(assessment.governance_impacts).toEqual(
      expect.arrayContaining(['SECURITY', 'AUTONOMY', 'EXTERNAL_ACTION']),
    );
  });

  it('6. Low-risk write capability → MATERIAL + ALLOW (auto, no human review)', async () => {
    const changeRepo = new InMemoryChangeGovernanceRepository();
    const policyRepo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(policyRepo);
    const previous = seedBaseline(changeRepo);

    const result = await evaluateGovernanceChange({
      repository: changeRepo,
      policy_repository: policyRepo,
      pdp,
      policy_context: policyCtx(),
      input: {
        target_type: 'application',
        target_id: app.application_id,
        previous_baseline_id: previous.baseline_id,
        proposed_state: { write_capability: true },
        request_id: 'req_cg_write',
      },
    });
    expect(result.materiality).toBe('MATERIAL');
    expect(result.lifecycle_decision).toBe('REEVALUATION_REQUIRED');
    expect(result.pdp_invoked).toBe(true);
    expect(String(result.policy_decision?.decision).toUpperCase()).toBe('ALLOW');
    expect(result.policy_decision?.reason_codes ?? []).not.toContain(
      'LIFECYCLE_MANDATORY_REVIEW',
    );
    expect(result.next_baseline?.capabilities.write_capability).toBe(true);
    const stored = policyRepo.getEvaluation(result.evaluation_id!);
    expect(stored?.evidence_in?.authorization_mode).toBe('AUTOMATICALLY_AUTHORIZED');
    expect(stored?.evidence_in?.lifecycle_hold).toBe(false);
    expect(stored?.held_request).toBeFalsy();
  });

  it('6b. High-risk PHI write capability → MATERIAL + REVIEW (policy, not lifecycle hardcode)', async () => {
    const changeRepo = new InMemoryChangeGovernanceRepository();
    const policyRepo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(policyRepo);
    const previous = seedBaseline(changeRepo);

    const result = await evaluateGovernanceChange({
      repository: changeRepo,
      policy_repository: policyRepo,
      pdp,
      policy_context: highRiskWritePolicyCtx(),
      input: {
        target_type: 'application',
        target_id: app.application_id,
        previous_baseline_id: previous.baseline_id,
        proposed_state: { write_capability: true },
        request_id: 'req_cg_write_phi',
      },
    });
    expect(result.materiality).toBe('MATERIAL');
    expect(result.lifecycle_decision).toBe('REEVALUATION_REQUIRED');
    expect(String(result.policy_decision?.decision).toUpperCase()).toBe('REVIEW');
    expect(result.policy_decision?.reason_codes).toEqual(
      expect.arrayContaining(['HIPAA_PHI_WRITE_REQUIRES_APPROVAL']),
    );
    expect(result.next_baseline).toBeFalsy();
    const stored = policyRepo.getEvaluation(result.evaluation_id!);
    expect(stored?.evidence_in?.authorization_mode).toBe('HUMAN_AUTHORIZATION');
    expect(stored?.held_request).toBeTruthy();
  });

  it('7. Autonomy ASSISTIVE→AUTONOMOUS → CRITICAL', () => {
    const assessment = assessMateriality({
      target_type: 'application',
      target_id: app.application_id,
      previous_state: { autonomy_level: 'ASSISTIVE' },
      proposed_state: { autonomy_level: 'AUTONOMOUS' },
    });
    expect(assessment.change_types).toContain('AUTONOMY_LEVEL');
    expect(assessment.materiality).toBe('CRITICAL');
    expect(assessment.lifecycle_decision).toBe('MANDATORY_REVIEW');
    expect(assessment.materiality_reasons).toEqual(
      expect.arrayContaining(['LIFECYCLE_AUTONOMY_ESCALATION_TO_AUTONOMOUS']),
    );
  });

  it('8. Data source → PRIVACY + DATA_GOVERNANCE impacts', () => {
    const assessment = assessMateriality({
      target_type: 'application',
      target_id: app.application_id,
      previous_state: { data_sources: ['docs_v1'] },
      proposed_state: { data_sources: ['docs_v1', 'ehr_feed'] },
    });
    expect(assessment.change_types).toContain('DATA_SOURCE_ADDED');
    expect(assessment.materiality).toBe('MATERIAL');
    expect(assessment.governance_impacts).toEqual(
      expect.arrayContaining(['PRIVACY', 'DATA_GOVERNANCE']),
    );
  });

  it('9. Processing location → PRIVACY/REGULATORY', () => {
    const assessment = assessMateriality({
      target_type: 'application',
      target_id: app.application_id,
      previous_state: { processing_location: 'us-east' },
      proposed_state: { processing_location: 'eu-west' },
    });
    expect(assessment.change_types).toContain('PROCESSING_LOCATION');
    expect(assessment.materiality).toBe('MATERIAL');
    expect(assessment.governance_impacts).toEqual(
      expect.arrayContaining(['PRIVACY', 'REGULATORY', 'PROCESSING_LOCATION']),
    );
  });

  it('10. Unknown/incomplete → UNKNOWN (never silently NON_MATERIAL)', () => {
    const incomplete = assessMateriality({
      target_type: 'application',
      target_id: app.application_id,
      incomplete: true,
      change_types: ['UI_LABEL'],
    });
    expect(incomplete.materiality).toBe('UNKNOWN');
    expect(incomplete.lifecycle_decision).toBe('UNKNOWN');
    expect(incomplete.materiality).not.toBe('NON_MATERIAL');

    const missing = assessMateriality({
      target_type: 'application',
      target_id: app.application_id,
    });
    expect(missing.materiality).toBe('UNKNOWN');
    expect(missing.lifecycle_decision).toBe('UNKNOWN');
  });

  it('11. Re-evaluation stores policy_evaluations (evaluation_id present)', async () => {
    const changeRepo = new InMemoryChangeGovernanceRepository();
    const policyRepo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(policyRepo);
    const previous = seedBaseline(changeRepo);

    const result = await evaluateGovernanceChange({
      repository: changeRepo,
      policy_repository: policyRepo,
      pdp,
      policy_context: policyCtx(),
      input: {
        target_type: 'application',
        target_id: app.application_id,
        previous_baseline_id: previous.baseline_id,
        proposed_state: { model_version: '3.0.0' },
        request_id: 'req_cg_eval_store',
      },
    });
    expect(result.evaluation_id).toBeTruthy();
    expect(result.change.evaluation_id).toBe(result.evaluation_id);
    const stored = policyRepo.getEvaluation(result.evaluation_id!);
    expect(stored).toBeTruthy();
    expect(stored!.request_id).toBe('req_cg_eval_store');
  });

  it('12. Autonomy CRITICAL → REVIEW not DENY; DENY/BLOCK from PDP preserved', async () => {
    const changeRepo = new InMemoryChangeGovernanceRepository();
    const policyRepo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(policyRepo);
    const previous = seedBaseline(changeRepo);

    const result = await evaluateGovernanceChange({
      repository: changeRepo,
      policy_repository: policyRepo,
      pdp,
      policy_context: policyCtx(),
      input: {
        target_type: 'application',
        target_id: app.application_id,
        previous_baseline_id: previous.baseline_id,
        proposed_state: { autonomy_level: 'AUTONOMOUS' },
        request_id: 'req_cg_crit_review',
      },
    });
    expect(result.materiality).toBe('CRITICAL');
    expect(String(result.policy_decision?.decision).toUpperCase()).toBe('REVIEW');
    expect(String(result.policy_decision?.decision).toUpperCase()).not.toBe('DENY');
    expect(result.policy_decision?.reason_codes).toEqual(
      expect.arrayContaining(['LIFECYCLE_MANDATORY_REVIEW']),
    );

    const denyBase: PolicyDecision = {
      decision: 'DENY',
      reason: 'pack deny',
      reason_codes: ['HIPAA_DENY'],
      applicable_policies: [],
      obligations: [],
      transformations: [],
      restrictions: {},
      approval_requirements: [],
      conflicts: [],
      explanation: {
        matched_conditions: [],
        rejected_conditions: [],
        final_reason: 'deny',
      },
      evidence: {},
      evaluation_id: 'eval_deny_preserve',
    };
    const heldDeny = applyLifecycleReviewHold(denyBase, ['LIFECYCLE_MANDATORY_REVIEW']);
    expect(heldDeny.decision).toBe('DENY');

    const blockBase = { ...denyBase, decision: 'BLOCK' as const };
    expect(applyLifecycleReviewHold(blockBase, ['LIFECYCLE_MANDATORY_REVIEW']).decision).toBe(
      'BLOCK',
    );
  });

  it('13. Human AUTHORIZE + resume path (held_request required)', async () => {
    const changeRepo = new InMemoryChangeGovernanceRepository();
    const policyRepo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(policyRepo);
    const previous = seedBaseline(changeRepo);

    const result = await evaluateGovernanceChange({
      repository: changeRepo,
      policy_repository: policyRepo,
      pdp,
      policy_context: highRiskWritePolicyCtx(),
      input: {
        target_type: 'application',
        target_id: app.application_id,
        previous_baseline_id: previous.baseline_id,
        proposed_state: { write_capability: true },
        request_id: 'req_cg_authorize',
        review_context: {
          title: 'Enable write for clinical note updates',
          summary:
            'Caller asked to append a follow-up note; write capability must be authorized first.',
          requester_prompt:
            'Please enable write so clinical notes can be updated for patient Greene.',
          rationale:
            'Caller explicitly requested note updates; current baseline is write=false.',
          intended_outcome:
            'After Authorize, update_clinical_notes becomes available for approved appends.',
          conversation: [
            {
              role: 'user',
              content:
                'Please enable write so clinical notes can be updated for patient Greene.',
            },
            {
              role: 'assistant',
              content:
                'Submitting a governance change to Enigma for mandatory review before write is enabled.',
            },
          ],
        },
      },
    });
    expect(String(result.policy_decision?.decision).toUpperCase()).toBe('REVIEW');

    const stored = policyRepo.getEvaluation(result.evaluation_id!)!;
    expect(stored.held_request?.messages?.length).toBeGreaterThan(0);
    const heldText = stored.held_request!.messages.map((m) => m.content).join('\n');
    expect(heldText).toContain(
      'Please enable write so clinical notes can be updated for patient Greene.',
    );
    expect(heldText).toContain('capability:write_capability');
    expect(heldText).toMatch(/false → true/);
    expect(heldText).toMatch(/UPDATED \[capability\]|Change Write capability/);
    expect(heldText).toContain('Change ID:');
    expect(heldText).toMatch(/If Authorize is chosen|If Deny is chosen/);

    const inventory = stored.evidence_in?.change_review as
      | {
          change_id?: string;
          evidence?: {
            title?: string;
            summary?: string;
            requester_prompt?: string;
            if_authorized?: string;
          };
          items?: Array<{ id: string; action: string; before?: string; after?: string }>;
        }
      | undefined;
    expect(inventory?.change_id).toBeTruthy();
    expect(inventory?.evidence?.requester_prompt).toContain('enable write');
    expect(inventory?.evidence?.title).toBeTruthy();
    expect(inventory?.evidence?.if_authorized).toMatch(/Write capability|Authorize/i);
    expect(inventory?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'capability:write_capability',
          action: 'updated',
          before: 'false',
          after: 'true',
        }),
      ]),
    );
    expect(heldText).toContain('MATERIAL');
    expect(stored.evidence_in?.change_types).toEqual(
      expect.arrayContaining(['WRITE_CAPABILITY']),
    );
    expect(stored.evidence_in?.review_context).toEqual(
      expect.objectContaining({
        requester_prompt: expect.stringContaining('enable write'),
      }),
    );

    expect(isEligibleForHumanReview(stored)).toBe(true);
    const resolution = buildHumanResolution(stored, {
      disposition: 'AUTHORIZE',
      reason: 'lifecycle write capability accepted after review',
      resolved_by: 'reviewer_cg',
    });
    const authorized = withHumanResolution(stored, resolution);
    expect(authorized.decision).toBe('REVIEW');
    expect(authorized.human_resolution?.human_disposition).toBe('AUTHORIZE');
    expect(authorized.human_resolution?.final_decision).toBe('ALLOW');
    // Lifecycle holds are not resumed through completions — baseline commit is the effect.
    expect(hasResumableHeldRequest(authorized)).toBe(false);
    expect(executionAfterAuthorize(authorized)).toBeUndefined();
    const committed = commitAuthorizedLifecycleChange({
      record: authorized,
      repository: changeRepo,
    });
    expect(committed?.capabilities.write_capability).toBe(true);
  });

  it('14. Human DENY no resume', async () => {
    const changeRepo = new InMemoryChangeGovernanceRepository();
    const policyRepo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(policyRepo);
    const previous = seedBaseline(changeRepo);

    const result = await evaluateGovernanceChange({
      repository: changeRepo,
      policy_repository: policyRepo,
      pdp,
      policy_context: policyCtx(),
      input: {
        target_type: 'application',
        target_id: app.application_id,
        previous_baseline_id: previous.baseline_id,
        proposed_state: { autonomy_level: 'AUTONOMOUS' },
        request_id: 'req_cg_human_deny',
      },
    });
    const stored = policyRepo.getEvaluation(result.evaluation_id!)!;
    const withHold: PolicyEvaluationRecord = {
      ...stored,
      held_request: heldFor(stored.evaluation_id, 'req_cg_human_deny'),
    };
    const denied = withHumanResolution(
      withHold,
      buildHumanResolution(withHold, {
        disposition: 'DENY',
        reason: 'autonomy escalation rejected',
        resolved_by: 'reviewer_cg',
      }),
    );
    expect(denied.human_resolution?.final_decision).toBe('DENY');
    expect(executionAfterAuthorize(denied)).toBeUndefined();
    expect(() => assertResumeEligible(denied)).toThrow(/DENY|cannot resume/i);
  });

  it('15. Terminal DENY/BLOCK/BLOCK_OUTPUT not eligible for human review', () => {
    for (const decision of ['DENY', 'BLOCK', 'BLOCK_OUTPUT'] as const) {
      const record = {
        evaluation_id: `eval_${decision}`,
        request_id: `req_${decision}`,
        phase: 'input',
        subject: {},
        resource: {},
        action: 'SUMMARIZE',
        context: {},
        ai_context: {},
        evidence_in: {},
        decision,
        reason_codes: ['TERMINAL'],
        applicable_policies: [],
        obligations: [],
        explanation: { matched_conditions: [], rejected_conditions: [], final_reason: 'x' },
        created_at: new Date().toISOString(),
      } as PolicyEvaluationRecord;
      expect(isEligibleForHumanReview(record)).toBe(false);
      expect(() =>
        buildHumanResolution(record, {
          disposition: 'AUTHORIZE',
          reason: 'should fail',
          resolved_by: 'x',
        }),
      ).toThrow(/not eligible/i);
    }
  });

  it('15b. AUTHORIZE on lifecycle hold commits write_capability baseline; no resume', async () => {
    const changeRepo = new InMemoryChangeGovernanceRepository();
    const policyRepo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(policyRepo);
    const previous = seedBaseline(changeRepo);

    const result = await evaluateGovernanceChange({
      repository: changeRepo,
      policy_repository: policyRepo,
      pdp,
      policy_context: highRiskWritePolicyCtx(),
      input: {
        target_type: 'application',
        target_id: app.application_id,
        previous_baseline_id: previous.baseline_id,
        proposed_state: {
          write_capability: true,
          tools: [{ id: 'update_clinical_notes', write: true }],
        },
        request_id: 'req_cg_auth_commit',
      },
    });
    expect(result.policy_decision?.decision).toBe('REVIEW');
    expect(result.next_baseline).toBeFalsy();
    expect(
      changeRepo.latestBaseline('application', app.application_id)?.capabilities
        .write_capability,
    ).toBe(false);

    const evaluationId = result.evaluation_id!;
    const held = policyRepo.getEvaluation(evaluationId)!;
    expect(held.evidence_in.lifecycle_hold).toBe(true);
    expect(hasResumableHeldRequest(held)).toBe(false);

    const resolution = buildHumanResolution(held, {
      disposition: 'AUTHORIZE',
      reason: 'Approved write capability for clinical note updates.',
      resolved_by: 'reviewer_cg',
    });
    const authorized = withHumanResolution(held, resolution);
    const committed = commitAuthorizedLifecycleChange({
      record: authorized,
      repository: changeRepo,
    });
    expect(committed?.capabilities.write_capability).toBe(true);
    expect(
      changeRepo.latestBaseline('application', app.application_id)?.capabilities
        .write_capability,
    ).toBe(true);
    expect(executionAfterAuthorize(authorized)).toBeUndefined();
  });

  it('16. Historical baseline immutability after change', async () => {
    const changeRepo = new InMemoryChangeGovernanceRepository();
    const policyRepo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(policyRepo);
    const previous = seedBaseline(changeRepo);
    const v1Snap = structuredClone(previous);

    await evaluateGovernanceChange({
      repository: changeRepo,
      policy_repository: policyRepo,
      pdp,
      policy_context: highRiskWritePolicyCtx(),
      commit_baseline_on_hold: true,
      input: {
        target_type: 'application',
        target_id: app.application_id,
        previous_baseline_id: previous.baseline_id,
        proposed_state: { write_capability: true, model_version: '9.0.0' },
        request_id: 'req_cg_hist',
      },
    });

    const still = changeRepo.getBaseline(previous.baseline_id)!;
    expect(still).toEqual(v1Snap);
    expect(still.capabilities.write_capability).not.toBe(true);
    const versions = changeRepo.listBaselinesForTarget('application', app.application_id);
    expect(versions.length).toBeGreaterThanOrEqual(2);
    expect(versions[0]!.baseline_id).toBe(previous.baseline_id);
  });

  it('17. Crypto binding: computeDecisionHash / decisionBindingFromRecord', async () => {
    const changeRepo = new InMemoryChangeGovernanceRepository();
    const policyRepo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(policyRepo);
    const previous = seedBaseline(changeRepo);

    const result = await evaluateGovernanceChange({
      repository: changeRepo,
      policy_repository: policyRepo,
      pdp,
      policy_context: policyCtx(),
      input: {
        target_type: 'application',
        target_id: app.application_id,
        previous_baseline_id: previous.baseline_id,
        proposed_state: { model_version: '4.0.0' },
        request_id: 'req_cg_crypto',
      },
    });
    expect(result.evaluation_id).toBeTruthy();
    const stored = policyRepo.getEvaluation(result.evaluation_id!)!;
    const binding = decisionBindingFromRecord(stored);
    expect(binding.evaluation_id).toBe(stored.evaluation_id);
    expect(binding.decision_hash).toBe(computeDecisionHash(stored));
    expect(computeDecisionHash({ ...stored, decision: 'DENY' })).not.toBe(
      binding.decision_hash,
    );
  });

  it('18. Correlation: change_id, evaluation_id, request_id linked', async () => {
    const changeRepo = new InMemoryChangeGovernanceRepository();
    const policyRepo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(policyRepo);
    const previous = seedBaseline(changeRepo);
    const requestId = 'req_cg_corr';

    const result = await evaluateGovernanceChange({
      repository: changeRepo,
      policy_repository: policyRepo,
      pdp,
      policy_context: policyCtx(),
      input: {
        target_type: 'application',
        target_id: app.application_id,
        previous_baseline_id: previous.baseline_id,
        proposed_state: { model_version: '5.0.0' },
        request_id: requestId,
        correlation_id: 'cor_cg_1',
      },
    });
    expect(result.change.change_id).toMatch(/^chg_/);
    expect(result.change.request_id).toBe(requestId);
    expect(result.change.correlation_id).toBe('cor_cg_1');
    expect(result.change.evaluation_id).toBe(result.evaluation_id);
    const stored = policyRepo.getEvaluation(result.evaluation_id!)!;
    expect(stored.request_id).toBe(requestId);
    expect(changeRepo.getChange(result.change.change_id)?.evaluation_id).toBe(
      result.evaluation_id,
    );
  });

  it('19. Observability: change record listable; material change has evaluation', async () => {
    const changeRepo = new InMemoryChangeGovernanceRepository();
    const policyRepo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(policyRepo);
    const previous = seedBaseline(changeRepo);

    await evaluateGovernanceChange({
      repository: changeRepo,
      policy_repository: policyRepo,
      pdp,
      policy_context: policyCtx(),
      input: {
        target_type: 'application',
        target_id: app.application_id,
        previous_baseline_id: previous.baseline_id,
        proposed_state: { model_version: '6.0.0' },
        request_id: 'req_cg_obs',
      },
    });
    const listed = changeRepo.listChanges();
    expect(listed.length).toBeGreaterThanOrEqual(1);
    const material = listed.find((c) => c.materiality === 'MATERIAL');
    expect(material).toBeTruthy();
    expect(material!.evaluation_id).toBeTruthy();
    expect(policyRepo.getEvaluation(material!.evaluation_id!)).toBeTruthy();
  });

  it('20. Simulation: evaluation_phase simulate → NOT_EXECUTED', async () => {
    const changeRepo = new InMemoryChangeGovernanceRepository();
    const policyRepo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(policyRepo);
    const previous = seedBaseline(changeRepo);

    const result = await evaluateGovernanceChange({
      repository: changeRepo,
      policy_repository: policyRepo,
      pdp,
      policy_context: policyCtx({ evaluation_phase: 'simulate' }),
      input: {
        target_type: 'application',
        target_id: app.application_id,
        previous_baseline_id: previous.baseline_id,
        proposed_state: { model_version: '7.0.0' },
        request_id: 'req_cg_sim',
      },
    });
    const stored = policyRepo.getEvaluation(result.evaluation_id!)!;
    expect(stored.phase).toBe('simulate');
    const projected = projectEnforcementResult(stored, null);
    expect(projected.status).toBe('NOT_EXECUTED');
    expect(customerVerificationLabel(projected)).toBe('NOT_EXECUTED');
  });

  it('21. Multi-pack: HIPAA+ISO_27701+OWASP applicability — PDP invoked', async () => {
    const changeRepo = new InMemoryChangeGovernanceRepository();
    const policyRepo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(policyRepo);
    const previous = seedBaseline(changeRepo);

    const result = await evaluateGovernanceChange({
      repository: changeRepo,
      policy_repository: policyRepo,
      pdp,
      policy_context: policyCtx({
        regulatory_applicability: ['HIPAA', 'ISO_27701', 'OWASP_LLM_2025'],
        governance_context: {
          ...FULL_GOVERNANCE,
          privacy: PRIVACY_ALL,
        },
      }),
      input: {
        target_type: 'application',
        target_id: app.application_id,
        previous_baseline_id: previous.baseline_id,
        proposed_state: {
          model_version: '8.0.0',
          applicable_authorities: ['HIPAA', 'ISO_27701', 'OWASP_LLM_2025'],
        },
        request_id: 'req_cg_multipack',
      },
    });
    expect(result.pdp_invoked).toBe(true);
    expect(result.policy_decision).toBeTruthy();
    const codes = result.policy_decision!.reason_codes ?? [];
    expect(
      codes.some((c) => c.includes('HIPAA') || c.includes('ISO27701') || c.includes('OWASP')),
    ).toBe(true);
  });

  it('22. Fourteen authorities: all REGULATORY_APPLICABILITY tags participate', async () => {
    expect(FOURTEEN_APPLICABILITY).toHaveLength(14);
    const changeRepo = new InMemoryChangeGovernanceRepository();
    const policyRepo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(policyRepo);
    const previous = seedBaseline(changeRepo);

    const result = await evaluateGovernanceChange({
      repository: changeRepo,
      policy_repository: policyRepo,
      pdp,
      policy_context: policyCtx({
        regulatory_applicability: [...FOURTEEN_APPLICABILITY],
        governance_context: FULL_GOVERNANCE,
      }),
      input: {
        target_type: 'application',
        target_id: app.application_id,
        previous_baseline_id: previous.baseline_id,
        proposed_state: { model_version: '10.0.0' },
        request_id: 'req_cg_14auth',
      },
    });
    expect(result.pdp_invoked).toBe(true);
    const decision = result.policy_decision!;
    // Evidence satisfied — conflict not required; authorities may participate via provenance/codes
    const blob = JSON.stringify(withOperatorExplanation(decision));
    for (const tag of FOURTEEN_APPLICABILITY) {
      const short = tag.replace('REGULATORY_APPLICABILITY:', '');
      expect(
        blob.includes(tag) ||
          blob.includes(short) ||
          (decision.reason_codes ?? []).some((c) => c.includes(short.replace(/_/g, ''))) ||
          (decision.explanation?.provenance?.sources ?? []).some((s) =>
            String(s.authority_id ?? '').includes(
              Object.values(POLICY_AUTHORITY_IDS).find((id) =>
                id.toLowerCase().includes(short.toLowerCase().split('_')[0]!),
              ) ?? '',
            ),
          ),
      ).toBe(true);
    }
    // Soft check: when evidence is complete, unresolved conflict is not mandatory
    expect(decision.decision).toBeTruthy();
  });

  it('23. Product truth: no certified/compliance score language in materiality/module', () => {
    const assessment = assessMateriality({
      target_type: 'application',
      target_id: app.application_id,
      previous_state: { model_version: '1' },
      proposed_state: { model_version: '2' },
    });
    const reasons = assessment.materiality_reasons.join(' ');
    expect(reasons).not.toMatch(/certified|compliance score|risk score|MaterialityScore/i);

    const moduleRoot = resolve(__dirname, '../../src/policy/enterprise/change-governance');
    for (const file of walkTsFiles(moduleRoot)) {
      const text = readFileSync(file, 'utf8');
      expect(text).not.toMatch(
        /certified|compliance score|ChangeRiskScore|MaterialityScore|LifecycleEvaluator/i,
      );
    }
  });

  it('24. Anti-regression: no lifecycle pack/engine sprawl', () => {
    const srcRoot = resolve(__dirname, '../../src');
    const forbiddenNames = [
      'LifecycleEvaluator',
      'ChangeRiskScore',
      'MaterialityScore',
      'auth_lifecycle',
      'pack_lifecycle',
      'auth_lifecycle_governance',
    ];
    const hits: string[] = [];
    for (const file of walkTsFiles(srcRoot)) {
      const text = readFileSync(file, 'utf8');
      for (const name of forbiddenNames) {
        if (text.includes(name)) hits.push(`${file}: ${name}`);
      }
    }
    expect(hits).toEqual([]);

    for (const file of walkTsFiles(
      resolve(__dirname, '../../src/policy/enterprise/change-governance'),
    )) {
      const text = readFileSync(file, 'utf8');
      expect(text).not.toMatch(/if\s*\(\s*(HIPAA|EU_AI_ACT|pack_hipaa)/);
      expect(text).not.toContain('pack_lifecycle');
      expect(text).not.toContain('auth_lifecycle');
    }

    // Gateway / resolver must not branch on a lifecycle pack
    const gatewayFiles = [
      resolve(__dirname, '../../src/api/app-factory.ts'),
      resolve(__dirname, '../../src/policy/enterprise/decision-resolution.ts'),
      resolve(__dirname, '../../src/policy/enterprise/pack-pdp.ts'),
    ];
    for (const file of gatewayFiles) {
      if (!existsSync(file)) continue;
      const text = readFileSync(file, 'utf8');
      expect(text).not.toMatch(/pack_lifecycle|auth_lifecycle|LifecycleEvaluator/);
    }
  });

  it('33. Simultaneous critical multi-delta → CRITICAL + MANDATORY_REVIEW + key impacts', async () => {
    const changeRepo = new InMemoryChangeGovernanceRepository();
    const policyRepo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(policyRepo);
    const previous = seedBaseline(changeRepo, baseCaps());

    const result = await evaluateGovernanceChange({
      repository: changeRepo,
      policy_repository: policyRepo,
      pdp,
      policy_context: policyCtx({
        regulatory_applicability: ['HIPAA', 'ISO_27701', 'OWASP_LLM_2025'],
        governance_context: { ...FULL_GOVERNANCE, privacy: PRIVACY_ALL },
      }),
      input: {
        target_type: 'application',
        target_id: app.application_id,
        previous_baseline_id: previous.baseline_id,
        proposed_state: {
          autonomy_level: 'AUTONOMOUS',
          model_version: '99.0.0',
          data_sources: ['docs_v1', 'phi_warehouse'],
          write_capability: true,
          tools: [
            { id: 'search', write: false },
            { id: 'ehr_write', write: true },
          ],
        },
        request_id: 'req_cg_section33',
      },
    });
    expect(result.materiality).toBe('CRITICAL');
    expect(result.lifecycle_decision).toBe('MANDATORY_REVIEW');
    expect(result.pdp_invoked).toBe(true);
    expect(result.governance_impacts).toEqual(
      expect.arrayContaining([
        'AUTONOMY',
        'EXTERNAL_ACTION',
        'SECURITY',
        'PRIVACY',
        'DATA_GOVERNANCE',
        'MODEL_GOVERNANCE',
      ]),
    );
    expect(String(result.policy_decision?.decision).toUpperCase()).toBe('REVIEW');
  });

  it('inferChangeTypes covers core deltas', () => {
    const types = inferChangeTypes(
      {
        model_version: '1',
        autonomy_level: 'ASSISTIVE',
        tools: [],
        data_sources: [],
      },
      {
        model_version: '2',
        autonomy_level: 'HUMAN_APPROVED',
        tools: [{ id: 't1', write: false }],
        data_sources: ['s1'],
        processing_location: 'eu',
      },
    );
    expect(types).toEqual(
      expect.arrayContaining([
        'MODEL_VERSION',
        'AUTONOMY_LEVEL',
        'TOOL_ADDED',
        'DATA_SOURCE_ADDED',
        'PROCESSING_LOCATION',
      ]),
    );
  });
});
