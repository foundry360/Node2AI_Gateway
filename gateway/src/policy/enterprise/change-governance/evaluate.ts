/**
 * Change evaluation orchestration.
 * Lifecycle decisions remain distinct from policy decisions.
 * Material / critical / unknown paths invoke the existing generic PDP.
 */

import { randomUUID } from 'node:crypto';
import type { Application, User } from '../../../identity/types.js';
import type { PolicyRequestContext } from '../../types.js';
import type { PackBackedEnterprisePdp } from '../pack-pdp.js';
import type { InMemoryPolicyRepository } from '../repository.js';
import type { PolicyDecision } from '../types.js';
import { createGovernanceBaseline, nextBaselineFromChange } from './baseline.js';
import { assessMateriality, lifecycleToPolicyHold } from './materiality.js';
import type { InMemoryChangeGovernanceRepository } from './repository.js';
import type {
  ChangeEvaluationResult,
  ChangeInput,
  GovernanceBaseline,
  NormalizedChange,
} from './types.js';

export interface EvaluateChangeOptions {
  repository: InMemoryChangeGovernanceRepository;
  input: ChangeInput;
  /** Existing generic PDP — required when re-evaluation / mandatory review. */
  pdp?: PackBackedEnterprisePdp;
  /** Policy evaluation store — used to persist lifecycle REVIEW holds on the same evaluation. */
  policy_repository?: InMemoryPolicyRepository;
  /** Request context builder inputs for PDP invocation. */
  policy_context?: {
    user: User;
    application: Application;
    operation?: string;
    requestedModel?: string;
    availableModels?: string[];
    environment?: string;
    sensitivity?: string;
    regulatory_applicability?: string[];
    governance_context?: PolicyRequestContext['governance_context'];
    evaluation_phase?: 'input' | 'simulate';
    evaluation_as_of?: string;
  };
  /** When true, commit next baseline even if policy holds (records governed proposal). */
  commit_baseline_on_hold?: boolean;
}

function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function baselineToState(b: GovernanceBaseline): Record<string, unknown> {
  return {
    capabilities: structuredClone(b.capabilities),
    configuration: structuredClone(b.configuration),
    components: structuredClone(b.components),
    governance_context: b.governance_context
      ? structuredClone(b.governance_context)
      : undefined,
    applicable_authorities: b.applicable_authorities
      ? [...b.applicable_authorities]
      : undefined,
    write_capability: b.capabilities.write_capability,
    autonomy_level: b.capabilities.autonomy_level,
    tools: b.capabilities.tools,
    data_sources: b.capabilities.data_sources,
    model_id: b.capabilities.model_id,
    model_version: b.capabilities.model_version,
    model_provider: b.capabilities.model_provider,
    processing_location: b.capabilities.processing_location,
    system_prompt_hash: b.capabilities.system_prompt_hash,
    ui_label: b.configuration.ui_label,
  };
}

function buildPolicyContext(
  opts: EvaluateChangeOptions,
  change: NormalizedChange,
): PolicyRequestContext {
  const pc = opts.policy_context!;
  const proposed = change.proposed_state;
  const applicability =
    pc.regulatory_applicability ??
    (proposed.applicable_authorities as string[] | undefined) ??
    [];
  const reason_codes = applicability.map((a) =>
    a.startsWith('REGULATORY_APPLICABILITY:')
      ? a
      : `REGULATORY_APPLICABILITY:${a}`,
  );
  return {
    user: pc.user,
    application: pc.application,
    operation: pc.operation ?? 'summarize',
    requestedModel:
      pc.requestedModel ??
      (proposed.model_id as string | undefined) ??
      pc.application.allowed_models[0],
    availableModels: pc.availableModels ?? pc.application.allowed_models,
    environment: pc.environment ?? 'prod',
    classification: {
      sensitivity: (pc.sensitivity as 'INTERNAL') ?? 'INTERNAL',
      confidence: 0.9,
      risk: 'medium',
      reason_codes,
    },
    deploymentMode: 'connected',
    governance_context:
      pc.governance_context ??
      (proposed.governance_context as PolicyRequestContext['governance_context']),
    processing_location: proposed.processing_location as string | undefined,
    evaluation_as_of: pc.evaluation_as_of,
    evaluation_phase: pc.evaluation_phase,
    request_id: change.request_id,
  };
}

/**
 * Force a REVIEW hold for mandatory lifecycle review without weakening DENY/BLOCK.
 * Preserves pack contributions / reason codes from the PDP result when present.
 */
export function applyLifecycleReviewHold(
  decision: PolicyDecision,
  reasons: string[],
): PolicyDecision {
  const d = String(decision.decision).toUpperCase();
  if (d === 'DENY' || d === 'BLOCK' || d === 'BLOCK_OUTPUT') {
    return {
      ...decision,
      reason_codes: [...reasons, ...(decision.reason_codes ?? [])],
    };
  }
  return {
    ...decision,
    decision: 'REVIEW',
    reason_codes: [...reasons, ...(decision.reason_codes ?? [])],
    restrictions: {
      ...decision.restrictions,
      eligible_models: [],
    },
  };
}

function persistLifecycleHold(
  policyRepo: InMemoryPolicyRepository | undefined,
  decision: PolicyDecision,
  change: NormalizedChange,
  policyContext: EvaluateChangeOptions['policy_context'],
): void {
  if (!policyRepo || !decision.evaluation_id) return;
  const existing = policyRepo.getEvaluation(decision.evaluation_id);
  if (!existing) return;

  const held_request =
    decision.decision === 'REVIEW' && policyContext
      ? {
          version: 1 as const,
          application_id: policyContext.application.application_id,
          organization_id: policyContext.application.organization_id,
          user_id: policyContext.user.user_id,
          operation: policyContext.operation ?? 'lifecycle_change',
          model: policyContext.requestedModel ?? policyContext.application.allowed_models[0],
          messages: [
            {
              role: 'system',
              content: `Governance change ${change.change_id} held for review`,
            },
          ],
          correlation_id: change.correlation_id ?? change.request_id ?? change.change_id,
          classification: {
            sensitivity: policyContext.sensitivity ?? 'INTERNAL',
            confidence: 0.9,
            risk: 'medium' as const,
            reason_codes: [
              'LIFECYCLE_MANDATORY_REVIEW',
              ...change.materiality_reasons,
            ],
          },
          allowed_models: [...policyContext.application.allowed_models],
          available_models: [
            ...(policyContext.availableModels ?? policyContext.application.allowed_models),
          ],
        }
      : existing.held_request;

  policyRepo.recordEvaluation({
    ...existing,
    decision: decision.decision,
    reason_codes: decision.reason_codes,
    evidence_in: {
      ...existing.evidence_in,
      lifecycle_hold: true,
      change_id: change.change_id,
      materiality: change.materiality,
      lifecycle_decision: change.lifecycle_decision,
      governance_impacts: change.governance_impacts,
      decision_reason_codes: decision.reason_codes,
    },
    held_request,
  });
}

/**
 * Evaluate a governance change: normalize → materiality → optional PDP → baseline.
 */
export async function evaluateGovernanceChange(
  opts: EvaluateChangeOptions,
): Promise<ChangeEvaluationResult> {
  const { repository, input } = opts;
  const change_id = newId('chg');
  const detected_at = input.detected_at ?? new Date().toISOString();
  const request_id = input.request_id ?? newId('req');
  const correlation_id = input.correlation_id ?? request_id;

  const previous = input.previous_baseline_id
    ? repository.getBaseline(input.previous_baseline_id)
    : repository.latestBaseline(input.target_type, input.target_id);

  const previous_state =
    input.previous_state ?? (previous ? baselineToState(previous) : undefined);
  const proposed_state = input.proposed_state;

  const assessment = assessMateriality({
    ...input,
    previous_state,
    proposed_state,
  });

  const change: NormalizedChange = {
    change_id,
    target_type: input.target_type,
    target_id: input.target_id,
    previous_baseline_id: previous?.baseline_id,
    previous_state: structuredClone(previous_state ?? {}),
    proposed_state: structuredClone(proposed_state ?? {}),
    change_types: assessment.change_types,
    source: input.source ?? 'api',
    detected_at,
    actor: input.actor,
    correlation_id,
    request_id,
    materiality: assessment.materiality,
    lifecycle_decision: assessment.lifecycle_decision,
    governance_impacts: assessment.governance_impacts,
    materiality_reasons: assessment.materiality_reasons,
  };

  let policy_decision: PolicyDecision | undefined;
  let pdp_invoked = false;
  let next_baseline: GovernanceBaseline | undefined;

  const needsPdp =
    assessment.lifecycle_decision === 'REEVALUATION_REQUIRED' ||
    assessment.lifecycle_decision === 'MANDATORY_REVIEW' ||
    assessment.lifecycle_decision === 'UNKNOWN';

  if (needsPdp) {
    if (!opts.pdp || !opts.policy_context) {
      change.materiality =
        change.materiality === 'NON_MATERIAL' ? 'UNKNOWN' : change.materiality;
      change.lifecycle_decision = 'UNKNOWN';
      change.materiality_reasons = [
        ...change.materiality_reasons,
        'LIFECYCLE_PDP_UNAVAILABLE',
      ];
    } else {
      pdp_invoked = true;
      const ctx = buildPolicyContext(opts, change);
      policy_decision = await opts.pdp.evaluateLegacyRequest(ctx);

      if (lifecycleToPolicyHold(change.materiality, change.lifecycle_decision)) {
        policy_decision = applyLifecycleReviewHold(policy_decision, [
          'LIFECYCLE_MANDATORY_REVIEW',
          ...change.materiality_reasons,
        ]);
        persistLifecycleHold(
          opts.policy_repository,
          policy_decision,
          change,
          opts.policy_context,
        );
      }
    }
  }

  const decisionCode = String(policy_decision?.decision ?? '').toUpperCase();
  const held = ['REVIEW', 'DENY', 'BLOCK', 'BLOCK_OUTPUT'].includes(decisionCode);

  const shouldCommitBaseline =
    !!proposed_state &&
    (assessment.lifecycle_decision === 'NO_REEVALUATION' ||
      opts.commit_baseline_on_hold === true ||
      (policy_decision && !held));

  if (previous && proposed_state && shouldCommitBaseline) {
    next_baseline = nextBaselineFromChange({
      previous,
      proposed_state,
      change_id,
      created_at: detected_at,
    });
    repository.saveBaseline(next_baseline);
    change.next_baseline_id = next_baseline.baseline_id;
  } else if (
    !previous &&
    proposed_state &&
    assessment.lifecycle_decision === 'NO_REEVALUATION'
  ) {
    next_baseline = createGovernanceBaseline({
      target_type: input.target_type,
      target_id: input.target_id,
      capabilities:
        (proposed_state.capabilities as GovernanceBaseline['capabilities']) ?? {},
      configuration: (proposed_state.configuration as Record<string, unknown>) ?? {
        ...(proposed_state.ui_label !== undefined
          ? { ui_label: proposed_state.ui_label }
          : {}),
      },
      change_id,
      created_at: detected_at,
    });
    repository.saveBaseline(next_baseline);
    change.next_baseline_id = next_baseline.baseline_id;
  }

  if (policy_decision?.evaluation_id) {
    change.evaluation_id = policy_decision.evaluation_id;
  }

  repository.saveChange(change);

  return {
    change,
    previous_baseline: previous,
    next_baseline,
    materiality: change.materiality,
    lifecycle_decision: change.lifecycle_decision,
    governance_impacts: change.governance_impacts,
    materiality_reasons: change.materiality_reasons,
    policy_decision,
    evaluation_id: change.evaluation_id,
    pdp_invoked,
  };
}
