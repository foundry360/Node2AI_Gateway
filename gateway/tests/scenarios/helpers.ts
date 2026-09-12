/**
 * Test-only helpers for Enterprise Governance Scenario Validation.
 * Exercises production EPA + Gateway paths — does not duplicate policy logic.
 */
import { expect } from 'vitest';
import type { Application, User } from '../../src/identity/types.js';
import type { GovernanceContext } from '../../src/policy/types.js';
import {
  InMemoryPolicyRepository,
  PackBackedEnterprisePdp,
  ensureDefaultOverlayRegistry,
  evaluationRecordToDecisionPayload,
  isEligibleForHumanReview,
  projectEnforcementResult,
  type PolicyDecision,
} from '../../src/policy/enterprise/index.js';
import {
  createPhase1Gateway,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';
import type { AuditEvent } from '../../src/audit/service.js';

ensureDefaultOverlayRegistry();

export const SCENARIO_CLINICIAN: User = {
  user_id: 'user_clinician',
  organization_id: 'org_demo',
  roles: ['clinician'],
  permissions: [],
  status: 'active',
};

export const SCENARIO_CLINICAL_APP: Application = {
  application_id: 'app_clinical',
  organization_id: 'org_demo',
  name: 'Clinical Gateway App',
  type: 'clinical',
  environment: 'prod',
  status: 'active',
  trust_level: 'trusted',
  allowed_models: ['local-general-v1', 'cloud-public-gpt'],
  allowed_datasets: [],
  allowed_operations: ['summarize', 'analyze', 'retrieve', 'submit', 'write'],
};

const AI_RISK_POLICIES = [
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
] as const;

export function suspendAiRiskPacks(repo: InMemoryPolicyRepository): void {
  for (const id of AI_RISK_POLICIES) {
    try {
      repo.setPolicyStatus(id, 'suspended');
    } catch {
      /* optional packs */
    }
  }
}

export function suspendHealthcarePacks(
  repo: InMemoryPolicyRepository,
  keep: Array<'hipaa' | 'part2' | 'onc' | 'cms'>,
): void {
  const keepSet = new Set(keep);
  if (!keepSet.has('hipaa')) {
    repo.setPolicyStatus('pol_hipaa_phi_local', 'suspended');
    repo.setPolicyStatus('pol_hipaa_release', 'suspended');
  }
  if (!keepSet.has('part2')) {
    repo.setPolicyStatus('pol_part2_sud_records', 'suspended');
    repo.setPolicyStatus('pol_part2_redisclosure', 'suspended');
  }
  if (!keepSet.has('onc')) {
    repo.setPolicyStatus('pol_onc_hti1_dsi_input', 'suspended');
    repo.setPolicyStatus('pol_onc_hti1_dsi_output', 'suspended');
  }
  if (!keepSet.has('cms')) {
    repo.setPolicyStatus('pol_cms_interop_input', 'suspended');
    repo.setPolicyStatus('pol_cms_interop_output', 'suspended');
  }
}

export function regs(...codes: string[]): string[] {
  return codes.map((c) =>
    c.startsWith('REGULATORY_APPLICABILITY:') ? c : `REGULATORY_APPLICABILITY:${c}`,
  );
}

export function phiClassification(extraReasonCodes: string[] = []) {
  return {
    sensitivity: 'PHI' as const,
    confidence: 0.99,
    risk: 'high' as const,
    reason_codes: regs('HIPAA', ...extraReasonCodes.filter((c) => !c.includes(':'))),
    entities: [
      {
        type: 'MRN',
        preview: 'A1…67',
        start: 14,
        end: 22,
        source: 'deterministic' as const,
      },
      {
        type: 'SSN',
        preview: '12…89',
        start: 30,
        end: 41,
        source: 'deterministic' as const,
      },
    ],
  };
}

export function packIds(decision: PolicyDecision): string[] {
  return [...new Set(decision.applicable_policies.map((p) => p.pack_id).filter(Boolean))];
}

export function contributingPackIds(decision: PolicyDecision): string[] {
  return decision.explanation.resolution?.contributing_pack_ids ?? [];
}

export function contributionDecisions(
  decision: PolicyDecision,
): Array<{ pack_id: string; decision: string }> {
  return (decision.explanation.resolution?.contributions ?? []).map((c) => ({
    pack_id: c.pack_id,
    decision: c.decision,
  }));
}

export type ScenarioPdpOpts = {
  requestId: string;
  regs?: string[];
  sensitivity?: string;
  purpose?: string;
  authorization?: string;
  requestedModel?: string;
  availableModels?: string[];
  application?: Application;
  user?: User;
  agentId?: string;
  toolId?: string;
  permittedEntityTypes?: string[];
  governance?: GovernanceContext;
  keepHealthcare?: Array<'hipaa' | 'part2' | 'onc' | 'cms'>;
  entities?: Array<{
    type: string;
    preview: string;
    start: number;
    end: number;
    source: 'deterministic';
  }>;
};

export async function evaluateScenario(
  opts: ScenarioPdpOpts,
): Promise<{
  decision: PolicyDecision;
  repo: InMemoryPolicyRepository;
  pdp: PackBackedEnterprisePdp;
}> {
  const repo = new InMemoryPolicyRepository();
  suspendAiRiskPacks(repo);
  if (opts.keepHealthcare) {
    suspendHealthcarePacks(repo, opts.keepHealthcare);
  }
  const pdp = new PackBackedEnterprisePdp(repo);
  const classification = {
    sensitivity: opts.sensitivity ?? 'PHI',
    confidence: 0.99,
    risk: 'high' as const,
    reason_codes: regs(...(opts.regs ?? ['HIPAA'])),
    entities: opts.entities,
  };
  const decision = await pdp.evaluateLegacyRequest({
    user: opts.user ?? SCENARIO_CLINICIAN,
    application: opts.application ?? SCENARIO_CLINICAL_APP,
    operation: 'summarize',
    requestedModel: opts.requestedModel ?? 'local-general-v1',
    availableModels: opts.availableModels ?? ['local-general-v1', 'cloud-public-gpt'],
    environment: 'prod',
    classification,
    deploymentMode: 'connected',
    purpose: opts.purpose,
    authorization_context: opts.authorization,
    agent_id: opts.agentId,
    tool_id: opts.toolId,
    permitted_entity_types: opts.permittedEntityTypes,
    governance_context: opts.governance,
    request_id: opts.requestId,
  });
  return { decision, repo, pdp };
}

export function assertNoModelExecution(audit: AuditEvent | undefined): void {
  if (!audit) return;
  // Blocked / held paths must not report a successful model release execution.
  if (audit.response_decision === 'BLOCK' || audit.policy_decision === 'BLOCK') {
    // model_selected may be absent or set only for failed selection attempts —
    // never treat as successful provider execution with RELEASE.
    expect(audit.response_decision).not.toBe('RELEASE');
  }
}

export function assertEligibleContainsSelected(
  eligible: string[] | undefined,
  selected: string | undefined,
): void {
  expect(Array.isArray(eligible)).toBe(true);
  expect(eligible!.length).toBeGreaterThan(0);
  expect(selected).toBeTruthy();
  expect(eligible).toContain(selected);
}

export function assertDenyBlocksModels(decision: PolicyDecision): void {
  expect(decision.decision).toBe('DENY');
  expect(decision.restrictions.eligible_models).toEqual([]);
  expect(isEligibleForHumanReview({
    evaluation_id: decision.evaluation_id,
    phase: 'input',
    subject: {},
    resource: {},
    context: {},
    ai_context: {},
    evidence_in: {},
    decision: 'DENY',
    applicable_policies: [],
    obligations: [],
    explanation: decision.explanation,
    created_at: new Date().toISOString(),
    restrictions: {
      eligible_models: decision.restrictions.eligible_models ?? [],
    },
  })).toBe(false);
}

export function historicalEligible(repo: InMemoryPolicyRepository, evaluationId: string) {
  const stored = repo.getEvaluation(evaluationId)!;
  const hydrated = evaluationRecordToDecisionPayload(stored);
  return {
    stored,
    hydrated,
    eligible: hydrated.restrictions.eligible_models,
  };
}

export async function runLiveCompletion(opts: {
  requestId?: string;
  model?: string;
  content: string;
  purpose?: string;
  authorization_context?: string;
  agent_id?: string;
  tool_id?: string;
  permitted_entity_types?: string[];
  regulatory_applicability?: string[];
  governance_context?: Record<string, unknown>;
  application_id?: string;
}) {
  const gw = createPhase1Gateway({
    config: { adminApiKey: 'test_admin', auditSigningKey: 'test-audit-key' },
  });
  const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
    application_id: opts.application_id ?? 'app_clinical',
    user: { id: 'user_clinician' },
    operation: 'summarize',
    model: opts.model ?? 'local-general-v1',
    messages: [{ role: 'user', content: opts.content }],
    purpose: opts.purpose,
    authorization_context: opts.authorization_context,
    agent_id: opts.agent_id,
    tool_id: opts.tool_id,
    permitted_entity_types: opts.permitted_entity_types,
    regulatory_applicability: opts.regulatory_applicability,
    governance_context: opts.governance_context,
  });
  const audits = await gw.audit.list();
  const audit = audits.at(-1);
  const inputEvalId =
    typeof audit?.metadata?.evaluation_id === 'string'
      ? audit.metadata.evaluation_id
      : audit?.evaluation_id;
  const inputRecord = inputEvalId
    ? gw.packRepo.getEvaluation(String(inputEvalId))
    : undefined;
  return { gw, result, audit, inputRecord, inputEvalId };
}

export const APPROVED_ONC_ADMIN = {
  applicability: 'applicable' as const,
  use_class: 'administrative' as const,
  risk_tier: 'low' as const,
  version_governance_current: true,
};

export const INCOMPLETE_ONC_CLINICAL = {
  applicability: 'applicable' as const,
  use_class: 'clinical' as const,
  intended_use: 'clinical_decision_support',
  risk_tier: 'high' as const,
  algorithm_id: 'alg_x',
  model_id: 'mdl_x',
  transparency_sufficient: true,
  faves_status: 'incomplete' as const,
  faves: {
    fair: true,
    appropriate: true,
    valid: true,
    effective: true,
    safe: false,
  },
  risk_management_status: 'sufficient' as const,
  human_oversight: true,
  version_governance_current: true,
};

export const APPROVED_CMS_PATIENT = {
  applicability: 'applicable' as const,
  organization_role: 'provider' as const,
  program: 'medicare_advantage' as const,
  workflow: 'patient_access' as const,
  patient_authorized: true,
  application_authorized: true,
  purpose_permitted: true,
};
