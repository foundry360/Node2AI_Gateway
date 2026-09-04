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
  /** When compare: evaluate both paths; enforce legacy; report mismatches. */
  mode?: PolicyEngineMode;
  onMismatch?: (info: {
    phase: 'input' | 'output';
    legacy: PolicyEvaluationResult | PolicyResponseResult;
    enterprise: PolicyDecision;
  }) => void;
}

/**
 * Adapter: existing PolicyEngine API ↔ Enigma PDP contract.
 * M2: pack-backed PDP by default; compare mode keeps legacy authoritative.
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

    const enterprise = await this.pdp.evaluateLegacyRequest(context);
    const fromEpa = toLegacyRequestResult(enterprise);

    if (mode === 'compare') {
      const legacyResult = await this.legacy.evaluateRequest(context);
      if (!requestResultsEqual(legacyResult, fromEpa)) {
        this.options.onMismatch?.({
          phase: 'input',
          legacy: legacyResult,
          enterprise,
        });
      }
      return legacyResult;
    }

    return fromEpa;
  }

  async evaluateResponse(context: PolicyResponseContext): Promise<PolicyResponseResult> {
    const mode = this.options.mode ?? 'enterprise';

    if (mode === 'legacy') {
      return this.legacy.evaluateResponse(context);
    }

    toOutputEvaluationRequest(context);

    const enterprise = await this.pdp.evaluateLegacyResponse(context);
    const fromEpa = toLegacyResponseResult(enterprise);

    if (mode === 'compare') {
      const legacyResult = await this.legacy.evaluateResponse(context);
      if (!responseResultsEqual(legacyResult, fromEpa)) {
        this.options.onMismatch?.({
          phase: 'output',
          legacy: legacyResult,
          enterprise,
        });
      }
      return legacyResult;
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
