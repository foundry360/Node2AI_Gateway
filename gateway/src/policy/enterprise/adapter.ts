import type {
  PolicyEngine,
  PolicyEvaluationResult,
  PolicyRequestContext,
  PolicyResponseContext,
  PolicyResponseResult,
} from '../types.js';
import {
  toInputEvaluationRequest,
  toLegacyRequestResult,
  toLegacyResponseResult,
  toOutputEvaluationRequest,
} from './map.js';
import type { BridgedEnterprisePdp } from './pack-pdp.js';
import type { PolicyDecision, PolicyEngineMode } from './types.js';

export interface EnterprisePolicyAdapterOptions {
  /**
   * - legacy: DeterministicPolicyEngine only
   * - enterprise: EPA pack PDP authoritative (M3 default)
   * - shadow: EPA authoritative; also run legacy and report mismatches
   * - compare: both; legacy authoritative (rollback / M2)
   */
  mode?: PolicyEngineMode;
  onMismatch?: (info: {
    phase: 'input' | 'output';
    legacy: PolicyEvaluationResult | PolicyResponseResult;
    enterprise: PolicyDecision;
  }) => void;
}

function failClosedRequest(_reason: string): PolicyEvaluationResult {
  return {
    decision: 'BLOCK',
    reason_codes: ['POLICY_ENGINE_FAILURE'],
    eligible_models: [],
    policy_ids: [],
    policy_version: 0,
    transforms: [],
  };
}

function failClosedResponse(_reason: string): PolicyResponseResult {
  return {
    decision: 'BLOCK',
    reason_codes: ['POLICY_ENGINE_FAILURE'],
    policy_ids: [],
    policy_version: 0,
    transforms: [],
    authorize_detokenization: false,
  };
}

/**
 * Adapter: existing PolicyEngine API ↔ Enigma PDP contract.
 * M3: EPA pack PDP is authoritative for enterprise/shadow modes.
 */
export class EnterprisePolicyAdapter implements PolicyEngine {
  constructor(
    private readonly pdp: BridgedEnterprisePdp,
    private readonly legacy: PolicyEngine,
    private readonly options: EnterprisePolicyAdapterOptions = {},
  ) {}

  async evaluateRequest(context: PolicyRequestContext): Promise<PolicyEvaluationResult> {
    const mode = this.options.mode ?? 'enterprise';

    if (mode === 'legacy') {
      return this.legacy.evaluateRequest(context);
    }

    toInputEvaluationRequest(context);

    let enterprise: PolicyDecision;
    try {
      enterprise = await this.pdp.evaluateLegacyRequest(context);
    } catch {
      return failClosedRequest('PDP threw during request evaluation');
    }

    if (enterprise.fail_closed) {
      return toLegacyRequestResult(enterprise);
    }

    const fromEpa = toLegacyRequestResult(enterprise);

    if (mode === 'compare' || mode === 'shadow') {
      try {
        const legacyResult = await this.legacy.evaluateRequest(context);
        if (!requestResultsEqual(legacyResult, fromEpa)) {
          this.options.onMismatch?.({
            phase: 'input',
            legacy: legacyResult,
            enterprise,
          });
        }
        if (mode === 'compare') {
          return legacyResult;
        }
      } catch {
        // Shadow/compare legacy failure: enterprise remains source for shadow;
        // compare fail-closes rather than silently using EPA if legacy is required.
        if (mode === 'compare') {
          return failClosedRequest('Legacy policy engine failed in compare mode');
        }
      }
    }

    return fromEpa;
  }

  async evaluateResponse(context: PolicyResponseContext): Promise<PolicyResponseResult> {
    const mode = this.options.mode ?? 'enterprise';

    if (mode === 'legacy') {
      return this.legacy.evaluateResponse(context);
    }

    toOutputEvaluationRequest(context);

    let enterprise: PolicyDecision;
    try {
      enterprise = await this.pdp.evaluateLegacyResponse(context);
    } catch {
      return failClosedResponse('PDP threw during response evaluation');
    }

    if (enterprise.fail_closed) {
      return toLegacyResponseResult(enterprise);
    }

    const fromEpa = toLegacyResponseResult(enterprise);

    if (mode === 'compare' || mode === 'shadow') {
      try {
        const legacyResult = await this.legacy.evaluateResponse(context);
        if (!responseResultsEqual(legacyResult, fromEpa)) {
          this.options.onMismatch?.({
            phase: 'output',
            legacy: legacyResult,
            enterprise,
          });
        }
        if (mode === 'compare') {
          return legacyResult;
        }
      } catch {
        if (mode === 'compare') {
          return failClosedResponse('Legacy policy engine failed in compare mode');
        }
      }
    }

    return fromEpa;
  }
}

function requestResultsEqual(a: PolicyEvaluationResult, b: PolicyEvaluationResult): boolean {
  return (
    a.decision === b.decision &&
    a.policy_version === b.policy_version &&
    JSON.stringify(a.reason_codes) === JSON.stringify(b.reason_codes) &&
    JSON.stringify(a.eligible_models) === JSON.stringify(b.eligible_models) &&
    JSON.stringify(a.policy_ids) === JSON.stringify(b.policy_ids) &&
    JSON.stringify(a.transforms) === JSON.stringify(b.transforms)
  );
}

function responseResultsEqual(a: PolicyResponseResult, b: PolicyResponseResult): boolean {
  return (
    a.decision === b.decision &&
    a.authorize_detokenization === b.authorize_detokenization &&
    a.policy_version === b.policy_version &&
    JSON.stringify(a.reason_codes) === JSON.stringify(b.reason_codes) &&
    JSON.stringify(a.policy_ids) === JSON.stringify(b.policy_ids) &&
    JSON.stringify(a.transforms) === JSON.stringify(b.transforms)
  );
}
