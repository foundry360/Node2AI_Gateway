import { randomBytes } from 'node:crypto';
import type {
  PolicyEngine,
  PolicyRequestContext,
  PolicyResponseContext,
} from '../types.js';
import {
  interpretBaselineInput,
  interpretBaselineOutput,
  type BaselineFacts,
  type InterpretedResult,
} from './packs/baseline.js';
import { applyRegulatoryOverlays } from './packs/regulatory.js';
import type { InMemoryPolicyRepository } from './repository.js';
import type {
  EnterprisePolicyDecisionPoint,
  PolicyDecision,
  PolicyEvaluationRequest,
} from './types.js';

function newEvaluationId(): string {
  return `eval_${randomBytes(8).toString('hex')}`;
}

function factsFromRequest(context: PolicyRequestContext): BaselineFacts {
  return {
    trust_level: context.application.trust_level,
    application_status: context.application.status,
    application_type: context.application.type,
    allowed_operations: context.application.allowed_operations,
    allowed_models: context.application.allowed_models,
    operation: context.operation,
    classification: String(context.classification.sensitivity),
    deployment_mode: context.deploymentMode,
    roles: context.user.roles,
    requested_model: context.requestedModel,
    available_models: context.availableModels,
  };
}

function factsFromResponse(
  context: PolicyResponseContext,
  allowDetokenization: boolean,
): BaselineFacts {
  return {
    trust_level: context.application.trust_level,
    application_status: context.application.status,
    application_type: context.application.type,
    allowed_operations: context.application.allowed_operations,
    allowed_models: context.application.allowed_models,
    operation: context.operation,
    classification: String(context.request_classification.sensitivity),
    deployment_mode: 'connected',
    roles: context.user.roles,
    available_models: [],
    requested_model: context.model_id,
    inspection_sensitivity: String(context.inspection.sensitivity),
    tool_or_action: context.inspection.tool_or_action_detected,
    contains_tokens: context.inspection.contains_tokens,
    input_was_tokenized: context.input_was_tokenized,
    allow_detokenization: allowDetokenization,
  };
}

function toEpaDecision(
  result: InterpretedResult,
  evidence: PolicyDecision['evidence'],
): PolicyDecision {
  return {
    decision: result.decision,
    reason: result.reason_codes.join(', ') || result.decision,
    reason_codes: result.reason_codes,
    applicable_policies: [
      {
        policy_id: result.policy_id,
        version: result.policy_version,
        pack_id: result.pack_id,
      },
    ],
    obligations: result.obligations,
    transformations: result.transforms,
    restrictions: {
      eligible_models: result.eligible_models,
      require_local: result.eligible_models.every((m) => m.startsWith('local-')),
      deny_external_transmission: result.obligations.some(
        (o) => o.code === 'NO_EXTERNAL_TRANSMISSION',
      ),
    },
    approval_requirements: [],
    conflicts: [],
    explanation: {
      matched_conditions: result.matched.map((detail) => ({
        policy_id: result.policy_id,
        version: result.policy_version,
        condition_key: detail,
        detail,
      })),
      rejected_conditions: [],
      final_reason: result.reason_codes.join(', ') || result.decision,
    },
    evidence,
    evaluation_id: newEvaluationId(),
  };
}

/**
 * Pack-backed PDP (M2).
 * Loads active Baseline / Response pack metadata from the repository and runs
 * versioned interpreters. Fail closed when required pack policy is missing.
 */
export class PackBackedEnterprisePdp implements EnterprisePolicyDecisionPoint {
  constructor(
    private readonly repository: InMemoryPolicyRepository,
    private readonly options: {
      allowDetokenization?: boolean;
      isPolicyActive?: (policyId: string) => Promise<boolean>;
    } = {},
  ) {}

  async evaluate(request: PolicyEvaluationRequest): Promise<PolicyDecision> {
    // Simulate / pure EPA path without full application allowlists cannot authorize.
    if (
      !request.resource.attributes?.allowed_operations ||
      !request.resource.attributes?.allowed_models
    ) {
      return {
        decision: 'DENY',
        reason: 'Insufficient resource attributes for pack evaluation (fail closed)',
        reason_codes: ['POLICY_ENGINE_FAILURE'],
        applicable_policies: [],
        obligations: [],
        transformations: [],
        restrictions: {},
        approval_requirements: [],
        conflicts: [],
        explanation: {
          matched_conditions: [],
          rejected_conditions: [],
          final_reason: 'Fail closed: incomplete evaluation request',
        },
        evidence: request.evidence,
        evaluation_id: newEvaluationId(),
        fail_closed: true,
      };
    }

    const facts: BaselineFacts = {
      trust_level: request.subject.trust_level,
      application_status: String(
        request.resource.attributes.application_status ?? 'active',
      ),
      application_type: String(request.resource.attributes.application_type ?? ''),
      allowed_operations: request.resource.attributes.allowed_operations as string[],
      allowed_models: request.resource.attributes.allowed_models as string[],
      operation: request.action.toLowerCase(),
      classification: String(
        request.evidence.classification ?? request.resource.classification ?? 'INTERNAL',
      ),
      deployment_mode: request.context.deployment_mode,
      roles: request.subject.roles,
      requested_model: request.ai_context.requested_model,
      available_models: request.ai_context.available_models ?? [],
      inspection_sensitivity: request.evidence.inspector_findings
        ?.find((f) => f.code.startsWith('SENSITIVITY_'))
        ?.code.replace('SENSITIVITY_', ''),
      tool_or_action: request.evidence.inspector_findings?.some(
        (f) => f.code === 'TOOL_OR_ACTION_ATTEMPT',
      ),
      contains_tokens: request.evidence.contains_tokens,
      input_was_tokenized: request.evidence.input_was_tokenized,
    };

    if (request.evaluation_phase === 'output') {
      return this.evaluateOutputFacts(facts, request.evidence);
    }
    return this.evaluateInputFacts(facts, request.evidence);
  }

  async evaluateLegacyRequest(context: PolicyRequestContext): Promise<PolicyDecision> {
    return this.evaluateInputFacts(factsFromRequest(context), {
      classification: String(
        context.classification.sensitivity,
      ) as PolicyDecision['evidence']['classification'],
      confidence: context.classification.confidence,
      risk: context.classification.risk,
      reason_codes: context.classification.reason_codes,
    });
  }

  async evaluateLegacyResponse(context: PolicyResponseContext): Promise<PolicyDecision> {
    return this.evaluateOutputFacts(
      factsFromResponse(context, !!this.options.allowDetokenization),
      {
        classification: String(
          context.request_classification.sensitivity,
        ) as PolicyDecision['evidence']['classification'],
        contains_tokens: context.inspection.contains_tokens,
        input_was_tokenized: context.input_was_tokenized,
      },
    );
  }

  private async resolveInputMeta() {
    const meta = this.repository.findByInterpreter('baseline_input_v2');
    if (!meta) return undefined;
    if (this.options.isPolicyActive && !(await this.options.isPolicyActive(meta.policy_id))) {
      return { ...meta, status: 'suspended' as const };
    }
    return meta;
  }

  private async resolveOutputMeta() {
    const meta = this.repository.findByInterpreter('baseline_output_v5');
    if (!meta) return undefined;
    if (this.options.isPolicyActive && !(await this.options.isPolicyActive(meta.policy_id))) {
      return { ...meta, status: 'suspended' as const };
    }
    return meta;
  }

  private async evaluateInputFacts(
    facts: BaselineFacts,
    evidence: PolicyDecision['evidence'],
  ): Promise<PolicyDecision> {
    const meta = await this.resolveInputMeta();
    if (!meta) {
      return failClosed('No active baseline input policy', evidence);
    }
    const result = interpretBaselineInput(facts, meta);
    const overlays = this.repository.listActiveOverlays('input');
    const withOverlays = applyRegulatoryOverlays(result, facts, overlays);
    return toEpaDecision(withOverlays, evidence);
  }

  private async evaluateOutputFacts(
    facts: BaselineFacts,
    evidence: PolicyDecision['evidence'],
  ): Promise<PolicyDecision> {
    const meta = await this.resolveOutputMeta();
    if (!meta) {
      return failClosed('No active baseline output policy', evidence);
    }
    const result = interpretBaselineOutput(facts, meta);
    return toEpaDecision(result, evidence);
  }
}

function failClosed(
  reason: string,
  evidence: PolicyDecision['evidence'],
): PolicyDecision {
  return {
    decision: 'DENY',
    reason,
    reason_codes: ['POLICY_ENGINE_FAILURE'],
    applicable_policies: [],
    obligations: [],
    transformations: [],
    restrictions: {},
    approval_requirements: [],
    conflicts: [],
    explanation: {
      matched_conditions: [],
      rejected_conditions: [],
      final_reason: reason,
    },
    evidence,
    evaluation_id: newEvaluationId(),
    fail_closed: true,
  };
}

/** PDP that supports legacy bridge methods used by EnterprisePolicyAdapter. */
export type BridgedEnterprisePdp = EnterprisePolicyDecisionPoint & {
  evaluateLegacyRequest(context: PolicyRequestContext): Promise<PolicyDecision>;
  evaluateLegacyResponse(context: PolicyResponseContext): Promise<PolicyDecision>;
};

/** Optional: wrap pack PDP with legacy engine for dual-run helpers. */
export function createCompareHelper(legacy: PolicyEngine, pack: PackBackedEnterprisePdp) {
  return { legacy, pack };
}
