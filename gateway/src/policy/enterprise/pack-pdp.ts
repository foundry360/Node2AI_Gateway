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
import type { PolicyRepository } from './pg-repository.js';
import type {
  EnterprisePolicyDecisionPoint,
  PolicyDecision,
  PolicyEvaluationRequest,
} from './types.js';
import { toEvaluationRecord } from './evaluation-record.js';
import { withOperatorExplanation } from './decision-explanation.js';
import {
  toInputEvaluationRequest,
  toOutputEvaluationRequest,
} from './map.js';

function newEvaluationId(): string {
  return `eval_${randomBytes(8).toString('hex')}`;
}

function factsFromRequest(context: PolicyRequestContext): BaselineFacts {
  const entityTypes = context.classification.entities?.map((e) => e.type) ?? [];
  const reasonCodes = context.classification.reason_codes ?? [];
  const regulatory = reasonCodes
    .filter((c) => c.startsWith('REGULATORY_APPLICABILITY:'))
    .map((c) => c.replace('REGULATORY_APPLICABILITY:', ''));
  if (
    (String(context.classification.sensitivity).toUpperCase() === 'PHI' ||
      String(context.classification.sensitivity).toUpperCase() === 'EPHI') &&
    !regulatory.includes('HIPAA')
  ) {
    regulatory.push('HIPAA');
  }
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
    entity_types: entityTypes,
    has_entity_spans: entityTypes.length > 0,
    health_context: reasonCodes.some(
      (c) =>
        c.includes('HEALTH') ||
        c.includes('HIPAA_PROFILE') ||
        c.startsWith('PROFILE:hipaa'),
    ),
    health_sensitive: reasonCodes.some(
      (c) => c.includes('ENIGMA_HEALTH_SENSITIVE') || c.includes('HEALTH_INFORMATION'),
    ),
    classification_profile_id: reasonCodes
      .find((c) => c.startsWith('PROFILE:'))
      ?.replace('PROFILE:', ''),
    regulatory_applicability: regulatory,
    purpose: context.purpose,
    recipient: context.recipient,
    source_system: context.source_system,
    processing_location: context.processing_location,
    authorization_context: context.authorization_context,
    agent_id: context.agent_id,
    tool_id: context.tool_id,
    permitted_entity_types: context.permitted_entity_types,
    governance_context: context.governance_context,
    evaluation_as_of: context.evaluation_as_of ?? new Date().toISOString(),
    nist_governance_documented:
      context.governance_context?.accountability_documented,
    nist_map_context_documented:
      context.governance_context?.system_context_documented,
    nist_measure_documented: context.governance_context?.measurement_documented,
    nist_manage_response_documented:
      context.governance_context?.risk_response_documented,
  };
}

function factsFromResponse(
  context: PolicyResponseContext,
  allowDetokenization: boolean,
): BaselineFacts {
  const releaseConditions =
    context.release_conditions_satisfied !== undefined
      ? context.release_conditions_satisfied
      : allowDetokenization &&
        !!context.inspection.contains_tokens &&
        !!context.input_was_tokenized &&
        context.application.trust_level === 'trusted' &&
        context.application.type === 'clinical' &&
        context.user.roles.includes('clinician');
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
    release_authorized: releaseConditions,
    release_conditions_satisfied: releaseConditions,
    entity_types: context.inspection.entities?.map((e) => e.type) ?? [],
    has_entity_spans: (context.inspection.entities?.length ?? 0) > 0,
    purpose: context.purpose,
    recipient: context.recipient,
    authorization_context: context.authorization_context,
    agent_id: context.agent_id,
    tool_id: context.tool_id,
    permitted_entity_types: context.permitted_entity_types,
    governance_context: context.governance_context,
    evaluation_as_of: context.evaluation_as_of ?? new Date().toISOString(),
    nist_governance_documented:
      context.governance_context?.accountability_documented,
    nist_map_context_documented:
      context.governance_context?.system_context_documented,
    nist_measure_documented: context.governance_context?.measurement_documented,
    nist_manage_response_documented:
      context.governance_context?.risk_response_documented,
  };
}

function toEpaDecision(
  result: InterpretedResult,
  evidence: PolicyDecision['evidence'],
): PolicyDecision {
  const provenance = result.provenance;
  const resolution = result.resolution;
  const evidenceOut: PolicyDecision['evidence'] = {
    ...evidence,
    classification_provenance:
      evidence.classification_provenance ?? provenance?.classification,
  };

  const applicable_policies = [
    {
      policy_id: result.policy_id,
      version: result.policy_version,
      pack_id: result.pack_id,
    },
  ];
  // Only surface additional pack refs when multiple packs contributed to resolution.
  // Single-pack reinforce (HIPAA on baseline DENY) must not change applicable_policies parity.
  if ((resolution?.resolution.contributing_pack_ids.length ?? 0) > 1) {
    for (const p of resolution!.applicable_policies) {
      if (
        p.policy_id === result.policy_id &&
        p.version === result.policy_version &&
        p.pack_id === result.pack_id
      ) {
        continue;
      }
      applicable_policies.push(p);
    }
  }

  const decision: PolicyDecision = {
    decision: result.decision,
    reason: result.reason_codes.join(', ') || result.decision,
    reason_codes: result.reason_codes,
    applicable_policies,
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
    conflicts: resolution?.conflicts ?? [],
    explanation: {
      matched_conditions: result.matched.map((detail) => ({
        policy_id: result.policy_id,
        version: result.policy_version,
        condition_key: detail,
        detail,
      })),
      rejected_conditions: [],
      final_reason: result.reason_codes.join(', ') || result.decision,
      provenance: provenance
        ? {
            matched_rules: provenance.matched_rules,
            sources: provenance.sources?.map((s) => ({
              source_id: s.source_id,
              authority: s.authority,
              authority_tier: s.authority_tier,
              authority_type: s.authority_type,
              legal_authority: s.legal_authority,
              authority_id: s.authority_id,
              citation: s.citation,
              title: s.title,
              publisher: s.publisher,
              canonical_url: s.canonical_url,
            })),
            classification: provenance.classification,
            controls: provenance.controls,
            enforcement: provenance.enforcement,
          }
        : undefined,
      resolution: resolution
        ? {
            category: resolution.resolution.category,
            basis: resolution.resolution.basis,
            contributing_pack_ids: resolution.resolution.contributing_pack_ids,
            detail: resolution.resolution.detail,
            conflict_pairs: resolution.resolution.conflict_pairs,
            contributions: resolution.resolution.contributions.map((c) => ({
              pack_id: c.pack_id,
              pack_name: c.pack_name,
              pack_version: c.pack_version,
              policy_id: c.policy_id,
              policy_name: c.policy_name,
              policy_version: c.policy_version,
              decision: c.decision,
              rule_ids: c.rule_ids,
              obligation_ids: c.obligation_ids,
              obligations: c.obligations.map((o) => o.code),
              controls: c.controls,
              reason_codes: c.reason_codes,
            })),
          }
        : undefined,
    },
    evidence: evidenceOut,
    evaluation_id: newEvaluationId(),
  };
  return withOperatorExplanation(decision);
}

/**
 * Pack-backed PDP (M2).
 * Loads active Baseline / Response pack metadata from the repository and runs
 * versioned interpreters. Fail closed when required pack policy is missing.
 */
export class PackBackedEnterprisePdp implements EnterprisePolicyDecisionPoint {
  constructor(
    private readonly repository: PolicyRepository,
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

    const reasonCodes = request.evidence.reason_codes ?? [];
    const regulatory = reasonCodes
      .filter((c) => c.startsWith('REGULATORY_APPLICABILITY:'))
      .map((c) => c.replace('REGULATORY_APPLICABILITY:', ''));
    const classification = String(
      request.evidence.classification ?? request.resource.classification ?? 'INTERNAL',
    );
    if (
      (classification.toUpperCase() === 'PHI' || classification.toUpperCase() === 'EPHI') &&
      !regulatory.includes('HIPAA')
    ) {
      regulatory.push('HIPAA');
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
      classification,
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
      entity_types: request.evidence.entities?.map((e) => e.type) ?? [],
      has_entity_spans: (request.evidence.entities?.length ?? 0) > 0,
      health_context: reasonCodes.some(
        (c) =>
          c.includes('HEALTH') ||
          c.includes('HIPAA_PROFILE') ||
          c.startsWith('PROFILE:hipaa'),
      ),
      health_sensitive: reasonCodes.some((c) => c.includes('ENIGMA_HEALTH_SENSITIVE')),
      release_authorized:
        !!request.evidence.contains_tokens &&
        !!request.evidence.input_was_tokenized &&
        request.subject.trust_level === 'trusted' &&
        String(request.resource.attributes.application_type ?? '') === 'clinical' &&
        request.subject.roles.includes('clinician'),
      release_conditions_satisfied:
        !!request.evidence.contains_tokens &&
        !!request.evidence.input_was_tokenized &&
        request.subject.trust_level === 'trusted' &&
        String(request.resource.attributes.application_type ?? '') === 'clinical' &&
        request.subject.roles.includes('clinician'),
      classification_profile_id: reasonCodes
        .find((c) => c.startsWith('PROFILE:'))
        ?.replace('PROFILE:', ''),
      regulatory_applicability: regulatory,
      purpose: request.context.purpose,
      recipient: request.context.recipient,
      source_system: request.context.source,
      processing_location: request.context.processing_location,
      authorization_context: request.context.authorization,
      governance_context: request.context.governance,
      evaluation_as_of:
        request.context.time ?? new Date().toISOString(),
      nist_governance_documented:
        request.context.governance?.accountability_documented,
      nist_map_context_documented:
        request.context.governance?.system_context_documented,
      nist_measure_documented: request.context.governance?.measurement_documented,
      nist_manage_response_documented:
        request.context.governance?.risk_response_documented,
    };

    if (request.evaluation_phase === 'output') {
      return this.evaluateOutputFacts(facts, request.evidence, {
        request_id: request.request_id,
        phase: 'output',
        request,
      });
    }
    return this.evaluateInputFacts(facts, request.evidence, {
      request_id: request.request_id,
      phase: request.evaluation_phase === 'simulate' ? 'simulate' : 'input',
      request,
    });
  }

  async evaluateLegacyRequest(context: PolicyRequestContext): Promise<PolicyDecision> {
    const phase = context.evaluation_phase === 'simulate' ? 'simulate' : 'input';
    const request = toInputEvaluationRequest(context, context.request_id);
    request.evaluation_phase = phase;
    return this.evaluateInputFacts(
      factsFromRequest(context),
      {
        classification: String(
          context.classification.sensitivity,
        ) as PolicyDecision['evidence']['classification'],
        confidence: context.classification.confidence,
        risk: context.classification.risk,
        reason_codes: context.classification.reason_codes,
        intent: context.classification.intent,
        entities: context.classification.entities?.map((e) => ({ type: e.type })),
      },
      { request_id: context.request_id, phase, request },
    );
  }

  async evaluateLegacyResponse(context: PolicyResponseContext): Promise<PolicyDecision> {
    const request = toOutputEvaluationRequest(context, context.request_id);
    return this.evaluateOutputFacts(
      factsFromResponse(context, !!this.options.allowDetokenization),
      {
        classification: String(
          context.request_classification.sensitivity,
        ) as PolicyDecision['evidence']['classification'],
        contains_tokens: context.inspection.contains_tokens,
        input_was_tokenized: context.input_was_tokenized,
      },
      { request_id: context.request_id, phase: 'output', request },
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
    opts?: {
      request_id?: string;
      phase?: 'input' | 'simulate';
      request?: Partial<PolicyEvaluationRequest>;
    },
  ): Promise<PolicyDecision> {
    const meta = await this.resolveInputMeta();
    if (!meta) {
      return failClosed('No active baseline input policy', evidence);
    }
    const result = interpretBaselineInput(facts, meta);
    const overlays = this.repository.listActiveOverlays('input');
    const withOverlays = applyRegulatoryOverlays(result, facts, overlays);
    const decision = toEpaDecision(withOverlays, evidence);
    this.persistEvaluation(decision, opts?.phase ?? 'input', opts?.request_id, opts?.request);
    return decision;
  }

  private async evaluateOutputFacts(
    facts: BaselineFacts,
    evidence: PolicyDecision['evidence'],
    opts?: {
      request_id?: string;
      phase?: 'output';
      request?: Partial<PolicyEvaluationRequest>;
    },
  ): Promise<PolicyDecision> {
    const meta = await this.resolveOutputMeta();
    if (!meta) {
      return failClosed('No active baseline output policy', evidence);
    }
    const result = interpretBaselineOutput(facts, meta);
    const overlays = this.repository.listActiveOverlays('output');
    const withOverlays = applyRegulatoryOverlays(result, facts, overlays);
    const decision = toEpaDecision(withOverlays, evidence);
    this.persistEvaluation(decision, opts?.phase ?? 'output', opts?.request_id, opts?.request);
    return decision;
  }

  private persistEvaluation(
    decision: PolicyDecision,
    phase: 'input' | 'output' | 'simulate',
    requestId?: string,
    request?: Partial<PolicyEvaluationRequest>,
  ): void {
    if (!this.repository.recordEvaluation) return;
    void this.repository.recordEvaluation(
      toEvaluationRecord(decision, {
        ...request,
        evaluation_phase: phase,
        request_id: requestId ?? request?.request_id,
      }),
    );
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
