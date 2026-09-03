import type { PolicyEngine, PolicyRequestContext, PolicyResponseContext } from '../types.js';
import { fromLegacyRequestResult, fromLegacyResponseResult } from './map.js';
import type {
  EnterprisePolicyDecisionPoint,
  PolicyDecision,
  PolicyEvaluationRequest,
} from './types.js';

/**
 * Prototype PDP: delegates evaluation to the legacy DeterministicPolicyEngine.
 * Preserves behavior while exercising the Enigma evaluation contract.
 * Marked Prototype until pack-backed PDP is Production (migration M2+).
 */
export class DelegatingEnterprisePdp implements EnterprisePolicyDecisionPoint {
  constructor(private readonly legacy: PolicyEngine) {}

  /**
   * Pure EPA callers without legacy context fail closed.
   * Gateway path uses evaluateLegacyRequest/Response via the adapter.
   */
  async evaluate(_request: PolicyEvaluationRequest): Promise<PolicyDecision> {
    return {
      decision: 'DENY',
      reason: 'Delegating PDP requires legacy bridge context (fail closed)',
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
        final_reason: 'Fail closed: no pack-backed evaluator yet',
      },
      evidence: {},
      evaluation_id: 'eval_fail_closed',
      fail_closed: true,
    };
  }

  async evaluateLegacyRequest(context: PolicyRequestContext): Promise<PolicyDecision> {
    const result = await this.legacy.evaluateRequest(context);
    const decision = fromLegacyRequestResult(result);
    decision.evidence = {
      classification: String(
        context.classification.sensitivity,
      ) as PolicyDecision['evidence']['classification'],
      confidence: context.classification.confidence,
      risk: context.classification.risk,
      reason_codes: context.classification.reason_codes,
    };
    return decision;
  }

  async evaluateLegacyResponse(context: PolicyResponseContext): Promise<PolicyDecision> {
    const result = await this.legacy.evaluateResponse(context);
    const decision = fromLegacyResponseResult(result);
    decision.evidence = {
      classification: String(
        context.request_classification.sensitivity,
      ) as PolicyDecision['evidence']['classification'],
      contains_tokens: context.inspection.contains_tokens,
      input_was_tokenized: context.input_was_tokenized,
    };
    return decision;
  }
}

/** Build a simulation request (no model execution). Prototype helper. */
export function buildSimulateRequest(
  partial: Omit<PolicyEvaluationRequest, 'evaluation_phase'> & {
    evaluation_phase?: 'simulate';
  },
): PolicyEvaluationRequest {
  return {
    ...partial,
    evaluation_phase: 'simulate',
  };
}
