import type {
  PolicyEngine,
  PolicyEvaluationResult,
  PolicyRequestContext,
  PolicyResponseContext,
  PolicyResponseResult,
} from './types.js';

/**
 * Deterministic PolicyEngine.
 * AI/interrogation/inspection components supply evidence only — this module authorizes.
 */
export class DeterministicPolicyEngine implements PolicyEngine {
  constructor(
    private readonly options: {
      /** Test hook: force evaluation failure (fail closed). */
      forceFailure?: boolean;
      forceResponseFailure?: boolean;
      defaultLocalModel: string;
      /** Test/admin override: allow privileged detokenization when tokens present. */
      allowDetokenization?: boolean;
    } = { defaultLocalModel: 'local-general-v1' },
  ) {}

  async evaluateRequest(context: PolicyRequestContext): Promise<PolicyEvaluationResult> {
    if (this.options.forceFailure) {
      throw new Error('PolicyEngine forced failure');
    }

    return this.evaluate(context);
  }

  async evaluateResponse(context: PolicyResponseContext): Promise<PolicyResponseResult> {
    if (this.options.forceFailure || this.options.forceResponseFailure) {
      throw new Error('PolicyEngine response evaluation forced failure');
    }

    const policyIds = ['pol_phase5_response'];
    const version = 5;
    const { inspection } = context;

    if (inspection.tool_or_action_detected) {
      return {
        decision: 'BLOCK',
        reason_codes: ['RESPONSE_TOOL_OR_ACTION_BLOCKED'],
        policy_ids: policyIds,
        policy_version: version,
        transforms: [],
        authorize_detokenization: false,
      };
    }

    if (inspection.sensitivity === 'Credential') {
      return {
        decision: 'BLOCK',
        reason_codes: ['RESPONSE_CREDENTIAL_BLOCKED'],
        policy_ids: policyIds,
        policy_version: version,
        transforms: [],
        authorize_detokenization: false,
      };
    }

    if (inspection.sensitivity === 'PHI') {
      return {
        decision: 'BLOCK',
        reason_codes: ['RESPONSE_PHI_BLOCKED'],
        policy_ids: policyIds,
        policy_version: version,
        transforms: [],
        authorize_detokenization: false,
      };
    }

    if (inspection.sensitivity === 'PII' || inspection.sensitivity === 'Financial') {
      return {
        decision: 'REDACT',
        reason_codes: ['RESPONSE_PII_REDACT'],
        policy_ids: policyIds,
        policy_version: version,
        transforms: [{ type: 'redact', targets: [String(inspection.sensitivity)] }],
        authorize_detokenization: false,
      };
    }

    // Tokens in model output are NOT automatically restored.
    const authorize_detokenization =
      !!this.options.allowDetokenization &&
      inspection.contains_tokens &&
      context.input_was_tokenized &&
      context.application.trust_level === 'trusted';

    return {
      decision: 'RELEASE',
      reason_codes: authorize_detokenization
        ? ['RESPONSE_RELEASE', 'DETOKENIZE_AUTHORIZED']
        : ['RESPONSE_RELEASE'],
      policy_ids: policyIds,
      policy_version: version,
      transforms: [],
      authorize_detokenization,
    };
  }

  private evaluate(context: PolicyRequestContext): PolicyEvaluationResult {
    const policyIds = ['pol_phase2_core'];
    const version = 2;
    const sensitivity = context.classification.sensitivity;

    if (context.application.trust_level === 'untrusted') {
      return blocked(['UNTRUSTED_APPLICATION'], policyIds, version);
    }

    if (context.application.status !== 'active') {
      return blocked(['APPLICATION_INACTIVE'], policyIds, version);
    }

    if (!context.application.allowed_operations.includes(context.operation)) {
      return blocked(['OPERATION_NOT_ALLOWED'], policyIds, version);
    }

    if (sensitivity === 'Credential') {
      return blocked(['CREDENTIAL_CONTENT_BLOCKED'], policyIds, version);
    }

    let eligible = context.availableModels.filter((m) =>
      context.application.allowed_models.includes(m),
    );

    if (context.deploymentMode === 'airgap') {
      eligible = eligible.filter((m) => m.startsWith('local-'));
    }

    if (sensitivity === 'PHI') {
      const cloudRequested =
        !!context.requestedModel && isCloudModel(context.requestedModel);
      if (cloudRequested) {
        return blocked(['PHI_PUBLIC_CLOUD_BLOCKED'], policyIds, version);
      }

      eligible = eligible.filter((m) => m.startsWith('local-'));
      if (eligible.length === 0) {
        return blocked(['PHI_REQUIRES_LOCAL_MODEL'], policyIds, version);
      }

      const clinicalOk =
        context.application.type === 'clinical' &&
        context.user.roles.includes('clinician');
      if (!clinicalOk) {
        return blocked(['PHI_APPLICATION_NOT_AUTHORIZED'], policyIds, version);
      }
    }

    if (eligible.length === 0) {
      return blocked(['MODEL_NOT_ELIGIBLE'], policyIds, version);
    }

    if (context.requestedModel) {
      if (!eligible.includes(context.requestedModel)) {
        return {
          decision: 'BLOCK',
          reason_codes: ['MODEL_NOT_ELIGIBLE'],
          eligible_models: eligible,
          policy_ids: policyIds,
          policy_version: version,
          transforms: [],
        };
      }
      eligible = [context.requestedModel];
    }

    if (sensitivity === 'PII' || sensitivity === 'Financial') {
      const hasExternal = eligible.some((m) => isCloudModel(m));
      return {
        decision: 'TOKENIZE',
        reason_codes: hasExternal
          ? ['PII_REQUIRES_TOKENIZE', 'EXTERNAL_MODEL_PRESENT']
          : ['PII_REQUIRES_TOKENIZE'],
        eligible_models: eligible,
        policy_ids: policyIds,
        policy_version: version,
        transforms: [{ type: 'tokenize', targets: [String(sensitivity)] }],
      };
    }

    return {
      decision: 'ALLOW',
      reason_codes: ['POLICY_ALLOW'],
      eligible_models: eligible,
      policy_ids: policyIds,
      policy_version: version,
      transforms: [],
    };
  }
}

function isCloudModel(modelId: string): boolean {
  return (
    modelId.startsWith('cloud-') ||
    modelId.includes('public') ||
    modelId.includes('openai') ||
    modelId.includes('anthropic')
  );
}

function blocked(
  reason_codes: string[],
  policy_ids: string[],
  policy_version: number,
): PolicyEvaluationResult {
  return {
    decision: 'BLOCK',
    reason_codes,
    eligible_models: [],
    policy_ids,
    policy_version,
    transforms: [],
  };
}

/** Test double that always throws. */
export class FailingPolicyEngine implements PolicyEngine {
  async evaluateRequest(): Promise<PolicyEvaluationResult> {
    throw new Error('PolicyEngine unavailable');
  }

  async evaluateResponse(): Promise<PolicyResponseResult> {
    throw new Error('PolicyEngine unavailable');
  }
}
