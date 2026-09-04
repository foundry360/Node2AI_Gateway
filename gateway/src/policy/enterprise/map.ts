import { randomBytes } from 'node:crypto';
import type {
  PolicyDecision,
  PolicyEvaluationResult,
  PolicyRequestContext,
  PolicyResponseContext,
  PolicyResponseResult,
} from '../types.js';
import type {
  EnigmaAction,
  Obligation,
  PolicyDecision as EpaDecision,
  PolicyEvaluationRequest,
  PolicyEvidence,
} from './types.js';

function newEvaluationId(): string {
  return `eval_${randomBytes(8).toString('hex')}`;
}

export function mapOperationToAction(operation: string): EnigmaAction {
  const key = operation.trim().toUpperCase();
  const known = new Set([
    'READ',
    'RETRIEVE',
    'SUMMARIZE',
    'ANALYZE',
    'CLASSIFY',
    'GENERATE',
    'EXECUTE',
    'WRITE',
    'UPDATE',
    'DELETE',
    'TRANSMIT',
    'EXPORT',
    'SHARE',
  ]);
  if (known.has(key)) return key as EnigmaAction;
  return key as EnigmaAction;
}

export function toInputEvaluationRequest(
  context: PolicyRequestContext,
  requestId?: string,
): PolicyEvaluationRequest {
  const classification = String(context.classification.sensitivity);
  return {
    evaluation_phase: 'input',
    subject: {
      user_id: context.user.user_id,
      application_id: context.application.application_id,
      organization_id: context.application.organization_id,
      tenant_id: context.application.organization_id,
      roles: context.user.roles,
      trust_level: context.application.trust_level,
      status: context.user.status,
    },
    resource: {
      type: 'document',
      classification: classification as PolicyEvaluationRequest['resource']['classification'],
      attributes: {
        application_status: context.application.status,
        application_type: context.application.type,
        allowed_operations: context.application.allowed_operations,
        allowed_models: context.application.allowed_models,
      },
    },
    action: mapOperationToAction(context.operation),
    context: {
      environment: context.environment,
      deployment_mode: context.deploymentMode,
      tenant_id: context.application.organization_id,
      risk_level: context.classification.risk,
      application_environment: context.application.environment,
    },
    ai_context: {
      requested_model: context.requestedModel,
      available_models: context.availableModels,
      execution: context.requestedModel?.startsWith('local-')
        ? 'local'
        : context.requestedModel
          ? 'cloud'
          : undefined,
    },
    evidence: {
      classification: classification as PolicyEvidence['classification'],
      confidence: context.classification.confidence,
      intent: context.classification.intent,
      risk: context.classification.risk,
      reason_codes: context.classification.reason_codes,
      entities: context.classification.entities?.map((e) => ({
        type: e.type,
      })),
    },
    request_id: requestId,
  };
}

export function toOutputEvaluationRequest(
  context: PolicyResponseContext,
  requestId?: string,
): PolicyEvaluationRequest {
  const classification = String(context.request_classification.sensitivity);
  return {
    evaluation_phase: 'output',
    subject: {
      user_id: context.user.user_id,
      application_id: context.application.application_id,
      organization_id: context.application.organization_id,
      tenant_id: context.application.organization_id,
      roles: context.user.roles,
      trust_level: context.application.trust_level,
      status: context.user.status,
    },
    resource: {
      type: 'model_output',
      classification: classification as PolicyEvaluationRequest['resource']['classification'],
      attributes: {
        application_status: context.application.status,
        application_type: context.application.type,
        allowed_operations: context.application.allowed_operations,
        allowed_models: context.application.allowed_models,
      },
    },
    action: mapOperationToAction(context.operation),
    context: {
      environment: context.application.environment,
      deployment_mode: 'connected',
      tenant_id: context.application.organization_id,
      risk_level: context.request_classification.risk,
      application_environment: context.application.environment,
    },
    ai_context: {
      model_id: context.model_id,
      execution: context.model_id.startsWith('local-') ? 'local' : 'cloud',
    },
    evidence: {
      classification: classification as PolicyEvidence['classification'],
      confidence: context.request_classification.confidence,
      intent: context.request_classification.intent,
      risk: context.request_classification.risk,
      reason_codes: context.request_classification.reason_codes,
      contains_tokens: context.inspection.contains_tokens,
      input_was_tokenized: context.input_was_tokenized,
      inspector_findings: [
        ...(context.inspection.sensitivity
          ? [{ code: `SENSITIVITY_${context.inspection.sensitivity}` }]
          : []),
        ...(context.inspection.tool_or_action_detected
          ? [{ code: 'TOOL_OR_ACTION_ATTEMPT' }]
          : []),
      ],
    },
    request_id: requestId,
  };
}

function obligationsFromRequestResult(result: PolicyEvaluationResult): Obligation[] {
  const obligations: Obligation[] = [];
  for (const t of result.transforms) {
    if (t.type === 'tokenize') {
      obligations.push({ code: 'TOKENIZE_PII', parameters: { targets: t.targets } });
    } else if (t.type === 'redact') {
      obligations.push({ code: 'REDACT_CREDENTIALS', parameters: { targets: t.targets } });
    }
  }
  if (
    result.eligible_models.length > 0 &&
    result.eligible_models.every((m) => m.startsWith('local-'))
  ) {
    obligations.push({ code: 'LOCAL_MODEL_ONLY' });
  }
  obligations.push({ code: 'LOG_GOVERNANCE_EVENT' });
  return obligations;
}

export function fromLegacyRequestResult(result: PolicyEvaluationResult): EpaDecision {
  const decision =
    result.decision === 'BLOCK'
      ? 'DENY'
      : (result.decision as EpaDecision['decision']);

  return {
    decision,
    reason: result.reason_codes.join(', ') || result.decision,
    reason_codes: result.reason_codes,
    applicable_policies: result.policy_ids.map((policy_id) => ({
      policy_id,
      version: result.policy_version,
      pack_id: 'pack_enterprise_baseline',
    })),
    obligations: obligationsFromRequestResult(result),
    transformations: result.transforms,
    restrictions: {
      eligible_models: result.eligible_models,
      require_local: result.eligible_models.every((m) => m.startsWith('local-')),
    },
    approval_requirements: [],
    conflicts: [],
    explanation: {
      matched_conditions: result.reason_codes.map((code) => ({
        policy_id: result.policy_ids[0] ?? 'unknown',
        version: result.policy_version,
        condition_key: code,
      })),
      rejected_conditions: [],
      final_reason: result.reason_codes.join(', ') || result.decision,
    },
    evidence: {},
    evaluation_id: newEvaluationId(),
  };
}

export function fromLegacyResponseResult(result: PolicyResponseResult): EpaDecision {
  const decision =
    result.decision === 'BLOCK'
      ? 'BLOCK_OUTPUT'
      : result.decision === 'RELEASE'
        ? 'ALLOW'
        : (result.decision as EpaDecision['decision']);

  const obligations: Obligation[] = result.transforms.map((t) =>
    t.type === 'redact'
      ? { code: 'REDACT_CREDENTIALS' as const, parameters: { targets: t.targets } }
      : { code: 'LOG_GOVERNANCE_EVENT' as const, parameters: { type: t.type, targets: t.targets } },
  );
  if (result.authorize_detokenization) {
    obligations.push({ code: 'AUTHORIZE_DETOKENIZATION' });
  }
  obligations.push({ code: 'LOG_GOVERNANCE_EVENT' });

  return {
    decision,
    reason: result.reason_codes.join(', ') || result.decision,
    reason_codes: result.reason_codes,
    applicable_policies: result.policy_ids.map((policy_id) => ({
      policy_id,
      version: result.policy_version,
      pack_id: 'pack_enterprise_baseline',
    })),
    obligations,
    transformations: result.transforms,
    restrictions: {},
    approval_requirements: [],
    conflicts: [],
    explanation: {
      matched_conditions: result.reason_codes.map((code) => ({
        policy_id: result.policy_ids[0] ?? 'unknown',
        version: result.policy_version,
        condition_key: code,
      })),
      rejected_conditions: [],
      final_reason: result.reason_codes.join(', ') || result.decision,
    },
    evidence: {
      input_was_tokenized: undefined,
    },
    evaluation_id: newEvaluationId(),
  };
}

export function toLegacyRequestResult(decision: EpaDecision): PolicyEvaluationResult {
  const legacyDecision: PolicyDecision =
    decision.decision === 'DENY'
      ? 'BLOCK'
      : decision.decision === 'TOKENIZE' ||
          decision.decision === 'ALLOW' ||
          decision.decision === 'REDACT' ||
          decision.decision === 'MASK' ||
          decision.decision === 'TRANSFORM'
        ? decision.decision
        : decision.decision === 'BLOCK_OUTPUT'
          ? 'BLOCK'
          : 'BLOCK';

  const first = decision.applicable_policies[0];
  return {
    decision: legacyDecision,
    reason_codes: decision.reason_codes,
    eligible_models: decision.restrictions.eligible_models ?? [],
    policy_ids: decision.applicable_policies.map((p) => p.policy_id),
    policy_version: first?.version ?? 0,
    transforms:
      decision.transformations.length > 0
        ? decision.transformations
        : decision.obligations
            .filter((o) => o.code === 'TOKENIZE_PII')
            .map((o) => ({
              type: 'tokenize',
              targets: (o.parameters?.targets as string[]) ?? ['PII'],
            })),
  };
}

export function toLegacyResponseResult(decision: EpaDecision): PolicyResponseResult {
  const legacyDecision =
    decision.decision === 'ALLOW'
      ? 'RELEASE'
      : decision.decision === 'BLOCK_OUTPUT' || decision.decision === 'DENY'
        ? 'BLOCK'
        : decision.decision === 'REDACT' || decision.decision === 'TRANSFORM'
          ? decision.decision
          : 'BLOCK';

  const first = decision.applicable_policies[0];
  return {
    decision: legacyDecision,
    reason_codes: decision.reason_codes,
    policy_ids: decision.applicable_policies.map((p) => p.policy_id),
    policy_version: first?.version ?? 0,
    transforms: decision.transformations,
    authorize_detokenization: decision.obligations.some(
      (o) => o.code === 'AUTHORIZE_DETOKENIZATION',
    ),
  };
}
