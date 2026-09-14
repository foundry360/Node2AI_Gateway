import type { AuditEvent, AuditService } from '../audit/service.js';
import { decisionBindingFromRecord } from '../audit/decision-binding.js';
import type { IdentityService } from '../identity/service.js';
import type { IdentityStore } from '../identity/store.js';
import type { DataInterrogator } from '../interrogation/types.js';
import { selectEligibleModel } from '../models/router.js';
import type { ModelGateway, ModelMessage } from '../models/types.js';
import type { PolicyRepository } from '../policy/enterprise/pg-repository.js';
import type { PolicyEvaluationRecord } from '../policy/enterprise/evaluation-record.js';
import type { HeldRequestSnapshot } from '../policy/enterprise/decision-resume.js';
import type { PolicyEngine } from '../policy/types.js';
import type { ResponseInspector } from '../response/inspector.js';
import type { GatewayConfig } from '../shared/config.js';
import { isGatewayError, gatewayErrorFromUnknown } from '../shared/errors.js';
import { newAuditId, newCorrelationId, newRequestId } from '../shared/ids.js';
import type { DetokenizationService, TransformService } from '../transform/types.js';
import {
  actionOutcomeRequestSchema,
  actionRequestSchema,
  completionRequestSchema,
  findForbiddenOverrides,
  type ActionOutcomeRequestBody,
  type ActionRequestBody,
  type CompletionRequestBody,
} from './validation.js';
import {
  computeOutcomeReceiptHash,
  clientOutcomeContextMismatch,
  deriveAuthorizedOutcomeContext,
  OUTCOME_REASON_CODES,
  outcomeReasonCode,
  type ClientOutcomeStatus,
} from '../audit/outcome.js';
import type { ActionOutcomeStore } from '../audit/outcome-store.js';
import type { ActorRegistry } from '../actors/registry.js';
import {
  applyRuntimeActorToGovernanceContext,
  normalizeRequestedOperation,
} from '../actors/facts.js';
import type { RuntimeActorFacts } from '../actors/types.js';
import type { GovernanceContext } from '../policy/types.js';

export interface CompletionSuccess {
  request_id: string;
  correlation_id: string;
  status: 'approved';
  model: string;
  response: { message: { role: string; content: string } };
  usage: { input_tokens: number; output_tokens: number };
  /** Tamper-evident hashes for the released response / audit event. */
  integrity: {
    response_hash: string;
    event_hash: string;
    prev_event_hash: string;
  };
  /**
   * Optional enforcement visibility for clients (e.g. scenario labs).
   * Does not change the authoritative decision; surfaces transform evidence.
   */
  governance?: {
    policy_decision: string;
    input_transformation: string;
    response_transformation: string;
    /** Prompt corpus after TOKENIZE (what the model received). */
    tokenized_input?: string;
    /** Model/output text still carrying tokens before authorized detokenize. */
    tokenized_output?: string;
  };
}

export interface CompletionBlocked {
  request_id: string;
  correlation_id: string;
  status: 'blocked';
  reason_code: string;
  message: string;
  /**
   * Present when input governance ran (e.g. TOKENIZE) but output release was blocked.
   * Lets clients show that the controlled path partially succeeded.
   */
  governance?: {
    policy_decision: string;
    input_transformation: string;
    response_decision: 'BLOCK';
    tokenized_input?: string;
  };
}

export type CompletionResult =
  | { httpStatus: 200; body: CompletionSuccess }
  | { httpStatus: number; body: CompletionBlocked };

export interface ActionSuccess {
  request_id: string;
  correlation_id: string;
  status: 'approved';
  evaluation_id: string;
  machine_decision: string;
  /**
   * Client may commit the external side effect (DML, etc.).
   * This is Gateway authorization to commit — not proof Enigma executed it.
   */
  action: 'commit_allowed';
  /** Product 1.0: actions ALLOW is always client-commit at the Gateway boundary. */
  enforcement_boundary: 'client_commit_required';
  resumed?: boolean;
}

export interface ActionBlocked {
  request_id: string;
  correlation_id: string;
  status: 'blocked';
  reason_code: string;
  message: string;
  evaluation_id?: string;
  machine_decision?: string;
  safety_hold?: boolean;
  /** Product 1.0 honesty: denied vs held for review. */
  enforcement_boundary?: 'denied' | 'review_required';
}

export type ActionResult =
  | { httpStatus: 200; body: ActionSuccess }
  | { httpStatus: number; body: ActionBlocked };

export interface ActionOutcomeSuccess {
  request_id: string;
  correlation_id: string;
  status: 'accepted' | 'idempotent';
  evaluation_id: string;
  execution_id: string;
  outcome: string;
  audit_id: string;
  /** Explicit: receipt is client-reported, not independently verified. */
  evidence_class: 'client_reported';
  machine_decision?: string;
  human_resolution?: string | null;
  enforcement?: string;
}

export interface ActionOutcomeBlocked {
  request_id: string;
  correlation_id: string;
  status: 'blocked' | 'conflict';
  reason_code: string;
  message: string;
  evaluation_id?: string;
  execution_id?: string;
  existing_outcome?: string;
}

export type ActionOutcomeResult =
  | { httpStatus: 200; body: ActionOutcomeSuccess }
  | { httpStatus: number; body: ActionOutcomeBlocked };

export interface GatewayOrchestratorDeps {
  config: GatewayConfig;
  identity: IdentityService;
  interrogator: DataInterrogator;
  policy: PolicyEngine;
  transform: TransformService;
  responseInspector: ResponseInspector;
  detokenizer: DetokenizationService;
  models: ModelGateway;
  audit: AuditService;
  /** Optional — required for REVIEW hold + post-AUTHORIZE resume. */
  policyRepository?: PolicyRepository;
  identityStore?: IdentityStore;
  /** Phase 4 — client Outcome receipt projection / idempotency. */
  outcomeStore?: import('../audit/outcome-store.js').ActionOutcomeStore;
  /** Installation deployment_id for Outcome claim scoping (Phase 4.1). */
  resolveDeploymentId?: () => Promise<string>;
  /** Phase A — Agent/Tool authorization substrate (not a PDP). */
  actorRegistry?: ActorRegistry;
}

/**
 * Single canonical AI execution path.
 * APPLICATION → IDENTITY → INTERROGATION → POLICY → TRANSFORM → MODEL
 *   → RESPONSE INSPECT → POLICY → TRANSFORM → (authorized detokenize) → AUDIT
 */
export class GatewayOrchestrator {
  constructor(private readonly deps: GatewayOrchestratorDeps) {}

  /**
   * Resolve Agent/Tool substrate facts before EPA.
   * Client may identify actors; client may not authorize them (enforce/shadow).
   */
  private async resolveRuntimeActors(opts: {
    applicationId: string;
    organizationId: string;
    agentId?: string | null;
    toolId?: string | null;
    operation?: string | null;
    actionKind?: string | null;
    governanceContext?: Record<string, unknown> | GovernanceContext;
  }): Promise<{
    governance_context: GovernanceContext | undefined;
    runtime_actor: RuntimeActorFacts | null;
  }> {
    const mode = this.deps.config.actorRegistryMode;
    const clientGov = opts.governanceContext as
      | Record<string, unknown>
      | undefined;
    const hasActorIds = !!opts.agentId?.trim() || !!opts.toolId?.trim();

    // off: legacy client attestation (migration/compat only).
    if (mode === 'off' || !hasActorIds) {
      return {
        governance_context: clientGov as GovernanceContext | undefined,
        runtime_actor: null,
      };
    }

    // enforce/shadow: never fall back to client authorization when deps missing.
    if (!this.deps.actorRegistry || !this.deps.resolveDeploymentId) {
      const failFacts: RuntimeActorFacts = {
        mode,
        agent: opts.agentId?.trim()
          ? {
              id: opts.agentId.trim(),
              registered: false,
              status: 'UNKNOWN',
              bound_to_application: false,
              autonomy_level: null,
              authorized: false,
            }
          : null,
        tool: opts.toolId?.trim()
          ? {
              id: opts.toolId.trim(),
              registered: false,
              status: 'UNKNOWN',
              granted_to_agent: false,
              operation: normalizeRequestedOperation({
                operation: opts.operation,
                actionKind: opts.actionKind,
              }),
              operation_declared: false,
              operation_granted: false,
              authorized: false,
            }
          : null,
        substrate: {
          agent_authorized: opts.agentId?.trim() ? false : null,
          tool_authorized: opts.toolId?.trim() ? false : null,
          reason_codes: ['REGISTRY_UNAVAILABLE'],
        },
        client_attested: {
          ...(typeof clientGov?.agent_authorized === 'boolean'
            ? { agent_authorized: clientGov.agent_authorized }
            : {}),
          ...(typeof clientGov?.tool_authorized === 'boolean'
            ? { tool_authorized: clientGov.tool_authorized }
            : {}),
        },
        mismatch: true,
        registry_error: 'actor_registry_or_deployment_unavailable',
      };
      const merged = applyRuntimeActorToGovernanceContext(
        mode,
        clientGov,
        failFacts,
      );
      return {
        governance_context: merged as GovernanceContext | undefined,
        runtime_actor: failFacts,
      };
    }

    try {
      const deploymentId = await this.deps.resolveDeploymentId();
      const operation = normalizeRequestedOperation({
        operation: opts.operation,
        actionKind: opts.actionKind,
      });
      const facts = await this.deps.actorRegistry.resolve({
        deploymentId,
        applicationId: opts.applicationId,
        organizationId: opts.organizationId,
        agentId: opts.agentId,
        toolId: opts.toolId,
        operation,
        mode,
        clientAgentAuthorized:
          typeof clientGov?.agent_authorized === 'boolean'
            ? clientGov.agent_authorized
            : undefined,
        clientToolAuthorized:
          typeof clientGov?.tool_authorized === 'boolean'
            ? clientGov.tool_authorized
            : undefined,
      });
      const merged = applyRuntimeActorToGovernanceContext(
        mode,
        clientGov,
        facts,
      );
      return {
        governance_context: merged as GovernanceContext | undefined,
        runtime_actor: facts,
      };
    } catch (err) {
      const failFacts: RuntimeActorFacts = {
        mode,
        agent: opts.agentId?.trim()
          ? {
              id: opts.agentId.trim(),
              registered: false,
              status: 'UNKNOWN',
              bound_to_application: false,
              autonomy_level: null,
              authorized: false,
            }
          : null,
        tool: opts.toolId?.trim()
          ? {
              id: opts.toolId.trim(),
              registered: false,
              status: 'UNKNOWN',
              granted_to_agent: false,
              operation: normalizeRequestedOperation({
                operation: opts.operation,
                actionKind: opts.actionKind,
              }),
              operation_declared: false,
              operation_granted: false,
              authorized: false,
            }
          : null,
        substrate: {
          agent_authorized: opts.agentId?.trim() ? false : null,
          tool_authorized: opts.toolId?.trim() ? false : null,
          reason_codes: ['REGISTRY_UNAVAILABLE'],
        },
        client_attested: {
          ...(typeof clientGov?.agent_authorized === 'boolean'
            ? { agent_authorized: clientGov.agent_authorized }
            : {}),
          ...(typeof clientGov?.tool_authorized === 'boolean'
            ? { tool_authorized: clientGov.tool_authorized }
            : {}),
        },
        mismatch: true,
        registry_error:
          err instanceof Error ? err.message : 'registry_resolve_failed',
      };
      const merged = applyRuntimeActorToGovernanceContext(
        mode,
        clientGov,
        failFacts,
      );
      return {
        governance_context: merged as GovernanceContext | undefined,
        runtime_actor: failFacts,
      };
    }
  }

  async completions(
    rawKey: string | undefined,
    rawBody: unknown,
  ): Promise<CompletionResult> {
    const started = Date.now();
    const requestId = newRequestId();
    let correlationId = newCorrelationId();
    let organizationId: string | undefined;
    let applicationId: string | undefined;
    let userId: string | undefined;
    let operation: string | undefined;

    const auditBase = () => ({
      audit_id: newAuditId(),
      timestamp: new Date().toISOString(),
      organization_id: organizationId,
      application_id: applicationId,
      user_id: userId,
      request_id: requestId,
      correlation_id: correlationId,
      operation,
      latency_ms: Date.now() - started,
    });

    const block = async (
      httpStatus: number,
      reason_code: string,
      message: string,
      extra: Record<string, unknown> = {},
    ): Promise<CompletionResult> => {
      await this.writeAudit({
        ...auditBase(),
        policy_decision: 'BLOCK',
        response_decision: 'BLOCK',
        reason_codes: [reason_code],
        ...extra,
        metadata: {
          ...((extra.metadata as Record<string, unknown>) ?? {}),
          __response_content: '',
        },
      });
      return {
        httpStatus,
        body: {
          request_id: requestId,
          correlation_id: correlationId,
          status: 'blocked',
          reason_code,
          message,
        },
      };
    };

    try {
      const forbidden = findForbiddenOverrides(rawBody);
      if (forbidden.length > 0) {
        return block(400, 'VALIDATION_FAILED', 'Request blocked by policy.', {
          errors: { forbidden_overrides: forbidden },
          reason_codes: ['VALIDATION_FAILED', 'SECURITY_OVERRIDE_REJECTED'],
        });
      }

      const parsed = completionRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return block(400, 'VALIDATION_FAILED', 'Request blocked by policy.', {
          errors: parsed.error.flatten(),
        });
      }

      const body: CompletionRequestBody = parsed.data;
      operation = body.operation;
      userId = body.user.id;
      if (body.metadata?.correlation_id) {
        correlationId = body.metadata.correlation_id;
      }

      const principal = await this.deps.identity.authenticateApiKey(rawKey);
      organizationId = principal.organization.organization_id;
      applicationId = principal.application.application_id;

      if (body.application_id !== principal.application.application_id) {
        return block(
          403,
          'APPLICATION_MISMATCH',
          'Request blocked by policy.',
        );
      }

      const user = await this.deps.identity.resolveUser(
        principal.organization.organization_id,
        body.user.id,
      );

      const corpus = body.messages.map((m) => m.content).join('\n');

      let interrogation;
      try {
        interrogation = await this.deps.interrogator.interrogate(corpus, {
          user_id: user.user_id,
          application_id: principal.application.application_id,
          organization_id: principal.organization.organization_id,
          operation: body.operation,
          requested_model: body.model,
          environment: principal.application.environment,
          deployment_mode: this.deps.config.deploymentMode,
          application_type: principal.application.type,
        });
      } catch {
        return block(
          403,
          'CLASSIFICATION_FAILURE',
          'Request blocked by policy.',
          { errors: { interrogation: 'failed' } },
        );
      }

      const classification = {
        sensitivity: interrogation.classification.sensitivity,
        confidence: interrogation.classification.confidence,
        intent: interrogation.intent,
        risk: interrogation.risk,
        reason_codes: interrogation.reason_codes,
        entities: interrogation.entities,
      };

      let policyResult;
      let resolvedActors: Awaited<
        ReturnType<GatewayOrchestrator['resolveRuntimeActors']>
      > | null = null;
      try {
        const applicabilityCodes = (body.regulatory_applicability ?? []).map(
          (a) =>
            a.startsWith('REGULATORY_APPLICABILITY:')
              ? a
              : `REGULATORY_APPLICABILITY:${a}`,
        );
        const reasonCodes = [
          ...new Set([...classification.reason_codes, ...applicabilityCodes]),
        ];
        resolvedActors = await this.resolveRuntimeActors({
          applicationId: principal.application.application_id,
          organizationId: principal.organization.organization_id,
          agentId: body.agent_id,
          toolId: body.tool_id,
          operation: body.operation,
          governanceContext: body.governance_context as
            | Record<string, unknown>
            | undefined,
        });
        policyResult = await this.deps.policy.evaluateRequest({
          user,
          application: principal.application,
          operation: body.operation,
          requestedModel: body.model,
          availableModels: this.deps.models.listAvailableModels(),
          environment: principal.application.environment,
          classification: {
            ...classification,
            reason_codes: reasonCodes,
          },
          deploymentMode: this.deps.config.deploymentMode,
          request_id: requestId,
          purpose: body.purpose,
          authorization_context: body.authorization_context,
          recipient: body.recipient,
          agent_id: body.agent_id,
          tool_id: body.tool_id,
          permitted_entity_types: body.permitted_entity_types,
          source_system: body.source_system,
          processing_location: body.processing_location,
          governance_context: resolvedActors.governance_context,
          runtime_actor: resolvedActors.runtime_actor
            ? (resolvedActors.runtime_actor as unknown as Record<string, unknown>)
            : undefined,
          evaluation_as_of: body.evaluation_as_of,
        });
      } catch {
        return block(
          403,
          'POLICY_ENGINE_FAILURE',
          'Request blocked by policy.',
          {
            errors: { policy: 'evaluation_failed' },
            data_classification: classification.sensitivity,
          },
        );
      }

      if (policyResult.decision === 'BLOCK' || policyResult.eligible_models.length === 0) {
        if (
          policyResult.machine_decision === 'REVIEW' &&
          policyResult.evaluation_id &&
          this.deps.policyRepository?.attachHeldRequest
        ) {
          const held: HeldRequestSnapshot = {
            version: 1,
            application_id: principal.application.application_id,
            organization_id: principal.organization.organization_id,
            user_id: user.user_id,
            operation: body.operation,
            model: body.model,
            messages: body.messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            correlation_id: correlationId,
            classification: {
              sensitivity: String(classification.sensitivity),
              confidence: classification.confidence,
              intent: classification.intent,
              risk: classification.risk,
              reason_codes: classification.reason_codes,
              entities: classification.entities?.map((e) => ({
                type: e.type,
                start: e.start,
                end: e.end,
                preview: e.preview,
              })),
            },
            allowed_models: [...principal.application.allowed_models],
            available_models: this.deps.models.listAvailableModels(),
            purpose: body.purpose,
            authorization_context: body.authorization_context,
            recipient: body.recipient,
            agent_id: body.agent_id,
            tool_id: body.tool_id,
            permitted_entity_types: body.permitted_entity_types,
            source_system: body.source_system,
            processing_location: body.processing_location,
            evaluation_as_of: body.evaluation_as_of,
            governance_context: (resolvedActors?.governance_context ??
              body.governance_context) as Record<string, unknown> | undefined,
          };
          try {
            await Promise.resolve(
              this.deps.policyRepository.attachHeldRequest(
                policyResult.evaluation_id,
                held,
              ),
            );
          } catch {
            // Hold is best-effort; fail-closed block still returns.
          }
        }
        return block(
          403,
          policyResult.reason_codes[0] ?? 'POLICY_BLOCKED',
          'Request blocked by policy.',
          {
            policy_ids: policyResult.policy_ids,
            policy_decision: 'BLOCK',
            data_classification: classification.sensitivity,
            reason_codes: policyResult.reason_codes,
            metadata: {
              intent: classification.intent,
              entity_types: classification.entities?.map((e) => e.type) ?? [],
              evaluation_id: policyResult.evaluation_id,
              machine_decision: policyResult.machine_decision,
              safety_hold:
                policyResult.machine_decision === 'REVIEW' ? true : undefined,
            },
          },
        );
      }

      let messagesForModel: ModelMessage[] = body.messages;
      let inputTransformation = 'none';

      const needsTransform =
        policyResult.decision === 'TOKENIZE' ||
        policyResult.decision === 'REDACT' ||
        policyResult.decision === 'MASK' ||
        policyResult.decision === 'TRANSFORM';

      if (needsTransform) {
        try {
          const transformed = await this.deps.transform.apply({
            organization_id: principal.organization.organization_id,
            request_id: requestId,
            correlation_id: correlationId,
            text: corpus,
            entities: classification.entities ?? [],
            decision: policyResult.decision,
            transforms: policyResult.transforms,
          });
          inputTransformation = transformed.action;
          // Phase 3: apply transform to the concatenated corpus as a single user message
          // so entity spans remain consistent with interrogation offsets.
          messagesForModel = [{ role: 'user', content: transformed.transformed_text }];
        } catch {
          return block(
            403,
            'TRANSFORM_FAILURE',
            'Request blocked by policy.',
            {
              policy_ids: policyResult.policy_ids,
              policy_decision: policyResult.decision,
              data_classification: classification.sensitivity,
              input_transformation: 'failed',
              reason_codes: [...policyResult.reason_codes, 'TRANSFORM_FAILURE'],
              metadata: { evaluation_id: policyResult.evaluation_id },
            },
          );
        }
      }

      const selectedModel = selectEligibleModel({
        eligibleModels: policyResult.eligible_models,
        requestedModel: body.model,
      });

      let execution;
      try {
        execution = await this.deps.models.executeApproved({
          request_id: requestId,
          correlation_id: correlationId,
          model_id: selectedModel,
          messages: messagesForModel,
          operation: body.operation,
          eligible_models: policyResult.eligible_models,
          application_id: principal.application.application_id,
          organization_id: principal.application.organization_id,
        });
      } catch (err) {
        const ge = gatewayErrorFromUnknown(err) ?? (isGatewayError(err) ? err : null);
        if (ge) {
          return block(ge.httpStatus, ge.reasonCode, 'Request blocked by policy.', {
            policy_ids: policyResult.policy_ids,
            policy_decision: policyResult.decision,
            data_classification: classification.sensitivity,
            model_selected: selectedModel,
            reason_codes: [ge.reasonCode],
            errors: { reason_code: ge.reasonCode },
          });
        }
        throw err;
      }

      // MODEL → INSPECT → POLICY → TRANSFORM → AUTHORIZED DETOKENIZATION → RELEASE
      let inspection;
      try {
        inspection = await this.deps.responseInspector.inspect({
          content: execution.message.content,
          model_id: execution.model_id,
          operation: body.operation,
        });
      } catch {
        return block(
          403,
          'INSPECTION_FAILURE',
          'Request blocked by policy.',
          {
            policy_ids: policyResult.policy_ids,
            policy_decision: policyResult.decision,
            model_selected: execution.model_id,
            provider: execution.provider,
            data_classification: classification.sensitivity,
            response_decision: 'BLOCK',
            reason_codes: ['INSPECTION_FAILURE'],
          },
        );
      }

      let responsePolicy;
      try {
        responsePolicy = await this.deps.policy.evaluateResponse({
          user,
          application: principal.application,
          operation: body.operation,
          model_id: execution.model_id,
          request_classification: classification,
          inspection,
          input_was_tokenized: inputTransformation === 'tokenize',
          request_id: requestId,
          purpose: body.purpose,
          authorization_context: body.authorization_context,
          recipient: body.recipient,
          agent_id: body.agent_id,
          tool_id: body.tool_id,
          permitted_entity_types: body.permitted_entity_types,
          governance_context:
            resolvedActors?.governance_context ?? body.governance_context,
          runtime_actor: resolvedActors?.runtime_actor
            ? (resolvedActors.runtime_actor as unknown as Record<string, unknown>)
            : undefined,
          evaluation_as_of: body.evaluation_as_of,
        });
      } catch {
        return block(
          403,
          'POLICY_ENGINE_FAILURE',
          'Request blocked by policy.',
          {
            policy_ids: policyResult.policy_ids,
            policy_decision: policyResult.decision,
            model_selected: execution.model_id,
            provider: execution.provider,
            data_classification: classification.sensitivity,
            response_decision: 'BLOCK',
            reason_codes: ['POLICY_ENGINE_FAILURE', 'RESPONSE_POLICY_FAILURE'],
            metadata: {
              evaluation_id: policyResult.evaluation_id,
            },
          },
        );
      }

      const tokenizedInput =
        inputTransformation === 'tokenize' && messagesForModel[0]?.content
          ? messagesForModel[0].content
          : undefined;

      if (responsePolicy.decision === 'BLOCK') {
        await this.writeAudit({
          ...auditBase(),
          data_classification: classification.sensitivity,
          policy_ids: [...policyResult.policy_ids, ...responsePolicy.policy_ids],
          policy_decision: policyResult.decision,
          model_selected: execution.model_id,
          provider: execution.provider,
          input_transformation: inputTransformation,
          response_transformation: 'none',
          response_decision: 'BLOCK',
          usage: execution.usage,
          reason_codes: responsePolicy.reason_codes,
          metadata: {
            intent: classification.intent,
            response_sensitivity: inspection.sensitivity,
            evaluation_id: policyResult.evaluation_id,
            response_evaluation_id: responsePolicy.evaluation_id,
          },
        });
        return {
          httpStatus: 403,
          body: {
            request_id: requestId,
            correlation_id: correlationId,
            status: 'blocked',
            reason_code: responsePolicy.reason_codes[0] ?? 'POLICY_BLOCKED',
            message: 'Request blocked by policy.',
            governance: {
              policy_decision: policyResult.decision,
              input_transformation: inputTransformation,
              response_decision: 'BLOCK',
              ...(tokenizedInput ? { tokenized_input: tokenizedInput } : {}),
            },
          },
        };
      }

      let responseContent = execution.message.content;
      let responseTransformation = 'none';

      if (
        responsePolicy.decision === 'REDACT' ||
        responsePolicy.decision === 'TRANSFORM'
      ) {
        try {
          const out = await this.deps.transform.apply({
            organization_id: principal.organization.organization_id,
            request_id: requestId,
            correlation_id: correlationId,
            text: responseContent,
            entities: inspection.entities,
            decision: responsePolicy.decision === 'REDACT' ? 'REDACT' : 'TRANSFORM',
            transforms: responsePolicy.transforms,
          });
          responseContent = out.transformed_text;
          responseTransformation = out.action;
        } catch {
          return block(
            403,
            'TRANSFORM_FAILURE',
            'Request blocked by policy.',
            {
              policy_ids: responsePolicy.policy_ids,
              policy_decision: policyResult.decision,
              model_selected: execution.model_id,
              provider: execution.provider,
              response_decision: 'BLOCK',
              reason_codes: ['TRANSFORM_FAILURE', 'RESPONSE_TRANSFORM_FAILURE'],
            },
          );
        }
      }

      // Snapshot token-bearing output before authorized detokenization.
      const tokenizedOutput =
        inputTransformation === 'tokenize' || /\{\{TOK_/.test(responseContent)
          ? responseContent
          : undefined;

      // Authorized detokenization ONLY when response policy explicitly allows it.
      if (responsePolicy.authorize_detokenization) {
        try {
          const detok = await this.deps.detokenizer.detokenize({
            organization_id: principal.organization.organization_id,
            text: responseContent,
            authorized: true,
          });
          responseContent = detok.text;
          if (detok.restored > 0) {
            responseTransformation =
              responseTransformation === 'none'
                ? 'detokenize'
                : `${responseTransformation}+detokenize`;
          }
        } catch {
          return block(
            403,
            'TRANSFORM_FAILURE',
            'Request blocked by policy.',
            {
              response_decision: 'BLOCK',
              reason_codes: ['DETOKENIZE_FAILURE'],
            },
          );
        }
      } else {
        // Explicit non-authorization path — ensure tokens are not restored.
        const denied = await this.deps.detokenizer.detokenize({
          organization_id: principal.organization.organization_id,
          text: responseContent,
          authorized: false,
        });
        responseContent = denied.text;
      }

      const audited = await this.writeAudit({
        ...auditBase(),
        data_classification: classification.sensitivity,
        policy_ids: [...policyResult.policy_ids, ...responsePolicy.policy_ids],
        policy_decision: policyResult.decision,
        model_selected: execution.model_id,
        provider: execution.provider,
        input_transformation: inputTransformation,
        response_transformation: responseTransformation,
        response_decision: 'RELEASE',
        usage: execution.usage,
        reason_codes: [
          ...policyResult.reason_codes,
          ...responsePolicy.reason_codes,
        ],
        metadata: {
          intent: classification.intent,
          response_sensitivity: inspection.sensitivity,
          authorize_detokenization: responsePolicy.authorize_detokenization,
          entity_types: classification.entities?.map((e) => e.type) ?? [],
          evaluation_id: policyResult.evaluation_id,
          response_evaluation_id: responsePolicy.evaluation_id,
          __response_content: responseContent,
        },
      });

      if (!audited.ok && this.deps.config.failClosedOnAuditError) {
        return block(403, 'INTERNAL_ERROR', 'Request blocked by policy.', {
          errors: { audit: 'write_failed' },
        });
      }

      return {
        httpStatus: 200,
        body: {
          request_id: requestId,
          correlation_id: correlationId,
          status: 'approved',
          model: execution.model_id,
          response: {
            message: { role: 'assistant', content: responseContent },
          },
          usage: execution.usage,
          integrity: {
            response_hash: audited.event?.response_hash ?? '',
            event_hash: audited.event?.event_hash ?? '',
            prev_event_hash: audited.event?.prev_event_hash ?? '',
          },
          governance: {
            policy_decision: policyResult.decision,
            input_transformation: inputTransformation,
            response_transformation: responseTransformation,
            ...(tokenizedInput ? { tokenized_input: tokenizedInput } : {}),
            ...(tokenizedOutput ? { tokenized_output: tokenizedOutput } : {}),
          },
        },
      };
    } catch (err) {
      const mapped = gatewayErrorFromUnknown(err);
      if (mapped) {
        return block(mapped.httpStatus, mapped.reasonCode, 'Request blocked by policy.', {
          errors: { reason_code: mapped.reasonCode },
          reason_codes: [mapped.reasonCode],
        });
      }
      if (isGatewayError(err)) {
        return block(err.httpStatus, err.reasonCode, 'Request blocked by policy.', {
          errors: { reason_code: err.reasonCode },
        });
      }
      return block(403, 'INTERNAL_ERROR', 'Request blocked by policy.', {
        errors: { reason_code: 'INTERNAL_ERROR' },
      });
    }
  }

  /**
   * Governed agent/tool action (write, etc.): policy decides + Decision recorded.
   * No model execution. Side effects stay with the client after ALLOW / post-AUTHORIZE.
   * Approving write capability once must not skip later per-action Decisions.
   */
  async actions(
    rawKey: string | undefined,
    rawBody: unknown,
  ): Promise<ActionResult> {
    const started = Date.now();
    const requestId = newRequestId();
    let correlationId = newCorrelationId();
    let organizationId: string | undefined;
    let applicationId: string | undefined;
    let userId: string | undefined;
    let operation: string | undefined;

    const auditBase = () => ({
      audit_id: newAuditId(),
      timestamp: new Date().toISOString(),
      organization_id: organizationId,
      application_id: applicationId,
      user_id: userId,
      request_id: requestId,
      correlation_id: correlationId,
      operation,
      latency_ms: Date.now() - started,
    });

    const block = async (
      httpStatus: number,
      reason_code: string,
      message: string,
      extra: Record<string, unknown> = {},
    ): Promise<ActionResult> => {
      const meta = (extra.metadata as Record<string, unknown> | undefined) ?? {};
      await this.writeAudit({
        ...auditBase(),
        policy_decision: 'BLOCK',
        response_decision: 'BLOCK',
        reason_codes: [reason_code],
        ...extra,
        metadata: {
          ...meta,
          __response_content: '',
          client_commit: true,
        },
      });
      return {
        httpStatus,
        body: {
          request_id: requestId,
          correlation_id: correlationId,
          status: 'blocked',
          reason_code,
          message,
          evaluation_id:
            typeof meta.evaluation_id === 'string'
              ? meta.evaluation_id
              : undefined,
          machine_decision:
            typeof meta.machine_decision === 'string'
              ? meta.machine_decision
              : undefined,
          safety_hold: meta.safety_hold === true ? true : undefined,
          enforcement_boundary:
            meta.safety_hold === true ? 'review_required' : 'denied',
        },
      };
    };

    try {
      const forbidden = findForbiddenOverrides(rawBody);
      if (forbidden.length > 0) {
        return block(400, 'VALIDATION_FAILED', 'Request blocked by policy.', {
          errors: { forbidden_overrides: forbidden },
          reason_codes: ['VALIDATION_FAILED', 'SECURITY_OVERRIDE_REJECTED'],
        });
      }

      const parsed = actionRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return block(400, 'VALIDATION_FAILED', 'Request blocked by policy.', {
          errors: parsed.error.flatten(),
        });
      }

      const body: ActionRequestBody = parsed.data;
      operation = body.operation;
      userId = body.user.id;
      if (body.metadata?.correlation_id) {
        correlationId = body.metadata.correlation_id;
      }

      const principal = await this.deps.identity.authenticateApiKey(rawKey);
      organizationId = principal.organization.organization_id;
      applicationId = principal.application.application_id;

      if (body.application_id !== principal.application.application_id) {
        return block(
          403,
          'APPLICATION_MISMATCH',
          'Request blocked by policy.',
        );
      }

      const corpus = body.messages.map((m) => m.content).join('\n');

      /**
       * Canonical continuation: resume_evaluation_id resumes ONE authorized Decision.
       * Invalid explicit IDs fail closed — never fall through to content matching.
       */
      if (body.resume_evaluation_id) {
        return this.claimAuthorizedClientCommit({
          evaluationId: body.resume_evaluation_id,
          applicationId: principal.application.application_id,
          userId: body.user.id,
          operation: body.operation,
          toolId: body.tool_id,
          agentId: body.agent_id,
          purpose: body.purpose,
          authorizationContext: body.authorization_context,
          action: body.action,
          requestId,
          correlationId,
          organizationId,
          mode: 'explicit_resume',
        });
      }

      /**
       * Transitional fallback: exact message-content match when no evaluation ID
       * is supplied. Prefer resume_evaluation_id for durable continuation.
       */
      const claimed = await this.findClaimableClientCommit({
        applicationId: principal.application.application_id,
        userId: body.user.id,
        operation: body.operation,
        content: corpus,
        toolId: body.tool_id,
        agentId: body.agent_id,
        purpose: body.purpose,
        authorizationContext: body.authorization_context,
        action: body.action,
      });
      if (claimed) {
        return this.claimAuthorizedClientCommit({
          evaluationId: claimed.evaluation_id,
          applicationId: principal.application.application_id,
          userId: body.user.id,
          operation: body.operation,
          toolId: body.tool_id,
          agentId: body.agent_id,
          purpose: body.purpose,
          authorizationContext: body.authorization_context,
          action: body.action,
          requestId,
          correlationId,
          organizationId,
          mode: 'content_fallback',
        });
      }

      const user = await this.deps.identity.resolveUser(
        principal.organization.organization_id,
        body.user.id,
      );

      let interrogation;
      try {
        interrogation = await this.deps.interrogator.interrogate(corpus, {
          user_id: user.user_id,
          application_id: principal.application.application_id,
          organization_id: principal.organization.organization_id,
          operation: body.operation,
          requested_model: body.model,
          environment: principal.application.environment,
          deployment_mode: this.deps.config.deploymentMode,
          application_type: principal.application.type,
        });
      } catch {
        return block(
          403,
          'CLASSIFICATION_FAILURE',
          'Request blocked by policy.',
          { errors: { interrogation: 'failed' } },
        );
      }

      const classification = {
        sensitivity: interrogation.classification.sensitivity,
        confidence: interrogation.classification.confidence,
        intent: interrogation.intent,
        risk: interrogation.risk,
        reason_codes: interrogation.reason_codes,
        entities: interrogation.entities,
      };

      let policyResult;
      let resolvedActors: Awaited<
        ReturnType<GatewayOrchestrator['resolveRuntimeActors']>
      > | null = null;
      try {
        const applicabilityCodes = (body.regulatory_applicability ?? []).map(
          (a) =>
            a.startsWith('REGULATORY_APPLICABILITY:')
              ? a
              : `REGULATORY_APPLICABILITY:${a}`,
        );
        const reasonCodes = [
          ...new Set([...classification.reason_codes, ...applicabilityCodes]),
        ];
        resolvedActors = await this.resolveRuntimeActors({
          applicationId: principal.application.application_id,
          organizationId: principal.organization.organization_id,
          agentId: body.agent_id,
          toolId: body.tool_id,
          operation: body.operation,
          actionKind: body.action?.kind,
          governanceContext: {
            ...((body.governance_context as Record<string, unknown>) ?? {}),
            client_commit: true,
            ...(body.action ? { action: body.action } : {}),
          },
        });
        policyResult = await this.deps.policy.evaluateRequest({
          user,
          application: principal.application,
          operation: body.operation,
          requestedModel: body.model,
          availableModels: this.deps.models.listAvailableModels(),
          environment: principal.application.environment,
          classification: {
            ...classification,
            reason_codes: reasonCodes,
          },
          deploymentMode: this.deps.config.deploymentMode,
          request_id: requestId,
          purpose: body.purpose,
          authorization_context: body.authorization_context,
          recipient: body.recipient,
          agent_id: body.agent_id,
          tool_id: body.tool_id,
          permitted_entity_types: body.permitted_entity_types,
          source_system: body.source_system,
          processing_location: body.processing_location,
          evaluation_as_of: body.evaluation_as_of,
          governance_context: resolvedActors.governance_context,
          runtime_actor: resolvedActors.runtime_actor
            ? (resolvedActors.runtime_actor as unknown as Record<string, unknown>)
            : undefined,
          action: body.action,
        });
      } catch {
        return block(
          403,
          'POLICY_ENGINE_FAILURE',
          'Request blocked by policy.',
          {
            errors: { policy: 'evaluation_failed' },
            data_classification: classification.sensitivity,
          },
        );
      }

      const machineDecision = String(
        policyResult.machine_decision ?? policyResult.decision ?? '',
      ).toUpperCase();
      const isHold =
        policyResult.decision === 'BLOCK' ||
        policyResult.eligible_models.length === 0 ||
        machineDecision === 'REVIEW' ||
        machineDecision === 'REQUIRE_APPROVAL';

      if (isHold) {
        if (
          (machineDecision === 'REVIEW' ||
            machineDecision === 'REQUIRE_APPROVAL' ||
            policyResult.machine_decision === 'REVIEW') &&
          policyResult.evaluation_id &&
          this.deps.policyRepository?.attachHeldRequest
        ) {
          const held: HeldRequestSnapshot = {
            version: 1,
            application_id: principal.application.application_id,
            organization_id: principal.organization.organization_id,
            user_id: user.user_id,
            operation: body.operation,
            model: body.model,
            messages: body.messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            correlation_id: correlationId,
            classification: {
              sensitivity: String(classification.sensitivity),
              confidence: classification.confidence,
              intent: classification.intent,
              risk: classification.risk,
              reason_codes: classification.reason_codes,
              entities: classification.entities?.map((e) => ({
                type: e.type,
                start: e.start,
                end: e.end,
                preview: e.preview,
              })),
            },
            allowed_models: [...principal.application.allowed_models],
            available_models: this.deps.models.listAvailableModels(),
            purpose: body.purpose,
            authorization_context: body.authorization_context,
            recipient: body.recipient,
            agent_id: body.agent_id,
            tool_id: body.tool_id,
            permitted_entity_types: body.permitted_entity_types,
            source_system: body.source_system,
            processing_location: body.processing_location,
            evaluation_as_of: body.evaluation_as_of,
            governance_context: {
              ...((resolvedActors?.governance_context as Record<
                string,
                unknown
              >) ??
                (body.governance_context as Record<string, unknown>) ??
                {}),
              client_commit: true,
              ...(body.action ? { action: body.action } : {}),
            },
          };
          try {
            await Promise.resolve(
              this.deps.policyRepository.attachHeldRequest(
                policyResult.evaluation_id,
                held,
              ),
            );
          } catch {
            // Hold is best-effort; fail-closed block still returns.
          }
        }

        const safetyHold =
          machineDecision === 'REVIEW' ||
          machineDecision === 'REQUIRE_APPROVAL' ||
          policyResult.machine_decision === 'REVIEW';

        return block(
          403,
          policyResult.reason_codes[0] ?? 'POLICY_BLOCKED',
          'Request blocked by policy.',
          {
            policy_ids: policyResult.policy_ids,
            policy_decision: 'BLOCK',
            data_classification: classification.sensitivity,
            reason_codes: policyResult.reason_codes,
            metadata: {
              intent: classification.intent,
              evaluation_id: policyResult.evaluation_id,
              machine_decision:
                policyResult.machine_decision ?? machineDecision,
              safety_hold: safetyHold ? true : undefined,
              client_commit: true,
            },
          },
        );
      }

      const audited = await this.writeAudit({
        ...auditBase(),
        data_classification: classification.sensitivity,
        policy_ids: policyResult.policy_ids,
        policy_decision: String(policyResult.decision),
        response_decision: 'RELEASE',
        reason_codes: [
          ...policyResult.reason_codes,
          'CLIENT_COMMIT_ALLOWED',
        ],
        metadata: {
          intent: classification.intent,
          evaluation_id: policyResult.evaluation_id,
          client_commit: true,
          action: body.action,
          __response_content: '',
        },
      });

      if (!audited.ok && this.deps.config.failClosedOnAuditError) {
        return block(500, 'INTERNAL_ERROR', 'Request blocked by policy.', {
          errors: { audit: 'write_failed' },
          metadata: { evaluation_id: policyResult.evaluation_id },
        });
      }

      return {
        httpStatus: 200,
        body: {
          request_id: requestId,
          correlation_id: correlationId,
          status: 'approved',
          evaluation_id: policyResult.evaluation_id ?? '',
          machine_decision: String(policyResult.decision),
          action: 'commit_allowed',
          enforcement_boundary: 'client_commit_required',
        },
      };
    } catch (err) {
      const mapped = gatewayErrorFromUnknown(err);
      return block(
        mapped?.httpStatus ?? 500,
        mapped?.reasonCode ?? 'INTERNAL_ERROR',
        'Request blocked by policy.',
      );
    }
  }

  /**
   * Resume a held REVIEW request after human AUTHORIZE.
   * Does not re-run input PDP — original machine decision stays REVIEW;
   * execution proceeds under final ALLOW with original obligations.
   */
  async resumeAuthorizedEvaluation(
    record: PolicyEvaluationRecord,
  ): Promise<CompletionResult & { audit_id?: string }> {
    const held = record.held_request;
    if (!held || !this.deps.identityStore) {
      return {
        httpStatus: 500,
        body: {
          request_id: record.request_id ?? 'req_missing',
          correlation_id: held?.correlation_id ?? 'cor_missing',
          status: 'blocked',
          reason_code: 'INTERNAL_ERROR',
          message: 'Resume dependencies unavailable.',
        },
      };
    }

    const started = Date.now();
    const requestId = record.request_id ?? newRequestId();
    const correlationId = held.correlation_id || newCorrelationId();
    const organizationId = held.organization_id;
    const applicationId = held.application_id;
    const userId = held.user_id;
    const operation = held.operation;

    const auditBase = () => ({
      audit_id: newAuditId(),
      timestamp: new Date().toISOString(),
      organization_id: organizationId,
      application_id: applicationId,
      user_id: userId,
      request_id: requestId,
      correlation_id: correlationId,
      operation,
      latency_ms: Date.now() - started,
    });

    const fail = async (
      reason_code: string,
      extra: Record<string, unknown> = {},
    ): Promise<CompletionResult & { audit_id?: string }> => {
      const audited = await this.writeAudit({
        ...auditBase(),
        policy_decision: 'ALLOW',
        response_decision: 'BLOCK',
        reason_codes: [reason_code, 'RESUME_FAILED'],
        ...extra,
        metadata: {
          ...((extra.metadata as Record<string, unknown>) ?? {}),
          evaluation_id: record.evaluation_id,
          resume: true,
          original_machine_decision: record.decision,
          final_decision: record.human_resolution?.final_decision,
          __response_content: '',
        },
      });
      return {
        httpStatus: 403,
        body: {
          request_id: requestId,
          correlation_id: correlationId,
          status: 'blocked',
          reason_code,
          message: 'Request blocked by policy.',
        },
        audit_id: audited.event?.audit_id,
      };
    };

    try {
      const application = await this.deps.identityStore.getApplication(applicationId);
      if (!application || application.status !== 'active') {
        return fail('APPLICATION_INACTIVE');
      }
      const user = await this.deps.identity.resolveUser(organizationId, userId);

      const gov = held.governance_context as Record<string, unknown> | undefined;
      if (gov?.client_commit === true) {
        const audited = await this.writeAudit({
          ...auditBase(),
          data_classification: held.classification.sensitivity,
          policy_decision: 'ALLOW',
          response_decision: 'RELEASE',
          reason_codes: [
            'HUMAN_AUTHORIZE_RESUME',
            'FINAL_ALLOW',
            'CLIENT_COMMIT_ALLOWED',
          ],
          metadata: {
            evaluation_id: record.evaluation_id,
            resume: true,
            client_commit: true,
            action: gov.action,
            original_machine_decision: record.decision,
            final_decision: 'ALLOW',
            __response_content: '',
          },
        });
        if (!audited.ok && this.deps.config.failClosedOnAuditError) {
          return fail('INTERNAL_ERROR', { errors: { audit: 'write_failed' } });
        }
        return {
          httpStatus: 200,
          body: {
            request_id: requestId,
            correlation_id: correlationId,
            status: 'approved',
            model: 'client-commit',
            response: {
              message: {
                role: 'assistant',
                content: 'Client commit authorized after human review.',
              },
            },
            usage: { input_tokens: 0, output_tokens: 0 },
            integrity: {
              response_hash: audited.event?.response_hash ?? '',
              event_hash: audited.event?.event_hash ?? '',
              prev_event_hash: audited.event?.prev_event_hash ?? '',
            },
            governance: {
              policy_decision: 'ALLOW',
              input_transformation: 'none',
              response_transformation: 'none',
            },
          },
          audit_id: audited.event?.audit_id,
        };
      }

      const classification = {
        sensitivity: held.classification.sensitivity,
        confidence: held.classification.confidence,
        intent: held.classification.intent,
        risk: held.classification.risk,
        reason_codes: held.classification.reason_codes,
        entities: held.classification.entities,
      };

      const obligationCodes = new Set(
        (record.obligations ?? [])
          .map((o) =>
            o && typeof o === 'object' && 'code' in o
              ? String((o as { code: unknown }).code)
              : '',
          )
          .filter(Boolean),
      );

      let eligibleModels = held.allowed_models.filter((m) =>
        held.available_models.includes(m),
      );
      if (eligibleModels.length === 0) {
        eligibleModels = [...held.allowed_models];
      }
      if (obligationCodes.has('LOCAL_MODEL_ONLY')) {
        eligibleModels = eligibleModels.filter((m) => m.startsWith('local-'));
      }
      if (eligibleModels.length === 0) {
        return fail('NO_ELIGIBLE_MODEL', {
          policy_ids: (record.applicable_policies ?? [])
            .map((p) =>
              p && typeof p === 'object' && 'policy_id' in p
                ? String((p as { policy_id: unknown }).policy_id)
                : '',
            )
            .filter(Boolean),
          data_classification: classification.sensitivity,
        });
      }

      const corpus = held.messages.map((m) => m.content).join('\n');
      let messagesForModel: ModelMessage[] = held.messages.map((m) => ({
        role: m.role as ModelMessage['role'],
        content: m.content,
      }));
      let inputTransformation = 'none';

      const needsTokenize = obligationCodes.has('TOKENIZE_PII');
      if (needsTokenize) {
        try {
          const transformed = await this.deps.transform.apply({
            organization_id: organizationId,
            request_id: requestId,
            correlation_id: correlationId,
            text: corpus,
            entities: (classification.entities ?? []).map((e) => ({
              type: e.type as never,
              preview: e.preview ?? '[redacted]',
              start: e.start,
              end: e.end,
              source: 'deterministic' as const,
            })),
            decision: 'TOKENIZE',
            transforms: [{ type: 'tokenize', targets: ['PII'] }],
          });
          inputTransformation = transformed.action;
          messagesForModel = [{ role: 'user', content: transformed.transformed_text }];
        } catch {
          return fail('TRANSFORM_FAILURE', {
            input_transformation: 'failed',
            data_classification: classification.sensitivity,
          });
        }
      }

      const selectedModel = selectEligibleModel({
        eligibleModels,
        requestedModel: held.model,
      });

      let execution;
      try {
        execution = await this.deps.models.executeApproved({
          request_id: requestId,
          correlation_id: correlationId,
          model_id: selectedModel,
          messages: messagesForModel,
          operation,
          eligible_models: eligibleModels,
          application_id: application.application_id,
          organization_id: application.organization_id,
        });
      } catch (err) {
        const ge = gatewayErrorFromUnknown(err) ?? (isGatewayError(err) ? err : null);
        return fail(ge?.reasonCode ?? 'INTERNAL_ERROR', {
          model_selected: selectedModel,
          data_classification: classification.sensitivity,
        });
      }

      let inspection;
      try {
        inspection = await this.deps.responseInspector.inspect({
          content: execution.message.content,
          model_id: execution.model_id,
          operation,
        });
      } catch {
        return fail('INSPECTION_FAILURE', {
          model_selected: execution.model_id,
          data_classification: classification.sensitivity,
        });
      }

      let responsePolicy;
      try {
        responsePolicy = await this.deps.policy.evaluateResponse({
          user,
          application,
          operation,
          model_id: execution.model_id,
          request_classification: classification as never,
          inspection,
          input_was_tokenized: inputTransformation === 'tokenize',
          request_id: requestId,
          purpose: held.purpose,
          authorization_context: held.authorization_context,
          recipient: held.recipient,
          agent_id: held.agent_id,
          tool_id: held.tool_id,
          permitted_entity_types: held.permitted_entity_types,
          governance_context: held.governance_context as never,
          evaluation_as_of: held.evaluation_as_of,
        });
      } catch {
        return fail('POLICY_ENGINE_FAILURE', {
          model_selected: execution.model_id,
          data_classification: classification.sensitivity,
        });
      }

      if (responsePolicy.decision === 'BLOCK') {
        return fail(responsePolicy.reason_codes[0] ?? 'POLICY_BLOCKED', {
          policy_ids: responsePolicy.policy_ids,
          model_selected: execution.model_id,
          provider: execution.provider,
          data_classification: classification.sensitivity,
          input_transformation: inputTransformation,
          metadata: {
            response_evaluation_id: responsePolicy.evaluation_id,
          },
        });
      }

      let responseContent = execution.message.content;
      let responseTransformation = 'none';
      let tokenizedInput: string | undefined;
      if (inputTransformation === 'tokenize' && messagesForModel[0]?.content) {
        tokenizedInput = messagesForModel[0].content;
      }
      if (
        responsePolicy.decision === 'REDACT' ||
        responsePolicy.decision === 'TRANSFORM'
      ) {
        // Keep content as-is when no output transform service path needed for stub;
        // mirror completions() for detokenize authorization below.
        responseTransformation = String(responsePolicy.decision).toLowerCase();
      }

      const tokenizedOutput =
        inputTransformation === 'tokenize' || /\{\{TOK_/.test(responseContent)
          ? responseContent
          : undefined;

      if (responsePolicy.authorize_detokenization) {
        try {
          const detok = await this.deps.detokenizer.detokenize({
            organization_id: organizationId,
            text: responseContent,
            authorized: true,
          });
          responseContent = detok.text;
          if (detok.restored > 0) {
            responseTransformation =
              responseTransformation === 'none'
                ? 'detokenize'
                : `${responseTransformation}+detokenize`;
          }
        } catch {
          return fail('DETOKENIZE_FAILURE');
        }
      } else {
        const denied = await this.deps.detokenizer.detokenize({
          organization_id: organizationId,
          text: responseContent,
          authorized: false,
        });
        responseContent = denied.text;
      }

      const policyIds = [
        ...(record.applicable_policies ?? [])
          .map((p) =>
            p && typeof p === 'object' && 'policy_id' in p
              ? String((p as { policy_id: unknown }).policy_id)
              : '',
          )
          .filter(Boolean),
        ...responsePolicy.policy_ids,
      ];

      const audited = await this.writeAudit({
        ...auditBase(),
        data_classification: classification.sensitivity,
        policy_ids: policyIds,
        policy_decision: 'ALLOW',
        model_selected: execution.model_id,
        provider: execution.provider,
        input_transformation: inputTransformation,
        response_transformation: responseTransformation,
        response_decision: 'RELEASE',
        usage: execution.usage,
        reason_codes: [
          'HUMAN_AUTHORIZE_RESUME',
          'FINAL_ALLOW',
          ...responsePolicy.reason_codes,
        ],
        metadata: {
          intent: classification.intent,
          response_sensitivity: inspection.sensitivity,
          authorize_detokenization: responsePolicy.authorize_detokenization,
          evaluation_id: record.evaluation_id,
          response_evaluation_id: responsePolicy.evaluation_id,
          resume: true,
          original_machine_decision: record.decision,
          final_decision: 'ALLOW',
          __response_content: responseContent,
        },
      });

      if (!audited.ok && this.deps.config.failClosedOnAuditError) {
        return fail('INTERNAL_ERROR', { errors: { audit: 'write_failed' } });
      }

      return {
        httpStatus: 200,
        body: {
          request_id: requestId,
          correlation_id: correlationId,
          status: 'approved',
          model: execution.model_id,
          response: {
            message: { role: 'assistant', content: responseContent },
          },
          usage: execution.usage,
          integrity: {
            response_hash: audited.event?.response_hash ?? '',
            event_hash: audited.event?.event_hash ?? '',
            prev_event_hash: audited.event?.prev_event_hash ?? '',
          },
          governance: {
            policy_decision: 'ALLOW',
            input_transformation: inputTransformation,
            response_transformation: responseTransformation,
            ...(tokenizedInput ? { tokenized_input: tokenizedInput } : {}),
            ...(tokenizedOutput ? { tokenized_output: tokenizedOutput } : {}),
          },
        },
        audit_id: audited.event?.audit_id,
      };
    } catch (err) {
      const mapped = gatewayErrorFromUnknown(err);
      return fail(mapped?.reasonCode ?? 'INTERNAL_ERROR');
    }
  }

  private async findClaimableClientCommit(opts: {
    applicationId: string;
    userId: string;
    operation: string;
    content: string;
    toolId?: string;
    agentId?: string;
    purpose?: string;
    authorizationContext?: string;
    action?: {
      kind: string;
      target_id?: string;
      attributes?: Record<string, unknown>;
    };
  }): Promise<PolicyEvaluationRecord | null> {
    if (!this.deps.policyRepository?.listEvaluations) return null;
    const needle = opts.content.trim();
    if (!needle) return null;
    const rows = await Promise.resolve(
      this.deps.policyRepository.listEvaluations({ limit: 80 }),
    );
    for (const row of rows) {
      if (String(row.decision ?? '').toUpperCase() !== 'REVIEW') continue;
      const hr = row.human_resolution;
      if (
        !hr ||
        hr.resolution_status !== 'RESOLVED' ||
        hr.human_disposition !== 'AUTHORIZE' ||
        hr.final_decision !== 'ALLOW'
      ) {
        continue;
      }
      if (row.execution?.status === 'RESUMED') continue;
      if (row.execution?.status === 'RESUME_IN_PROGRESS') continue;
      const held = row.held_request;
      if (!held || held.version !== 1) continue;
      const gov = held.governance_context as Record<string, unknown> | undefined;
      if (gov?.client_commit !== true) continue;
      if (held.application_id !== opts.applicationId) continue;
      if (held.user_id !== opts.userId) continue;
      if (held.operation !== opts.operation) continue;
      const heldContent = held.messages.map((m) => m.content).join('\n').trim();
      if (heldContent !== needle) continue;
      // Content matched — also require full action-context compatibility.
      if (
        this.clientCommitContextMismatch(held, {
          operation: opts.operation,
          toolId: opts.toolId,
          agentId: opts.agentId,
          purpose: opts.purpose,
          authorizationContext: opts.authorizationContext,
          action: opts.action,
        })
      ) {
        continue;
      }
      return row;
    }
    return null;
  }

  /**
   * Material action-context binding for client_commit resume.
   * Returns a reason_code when the retry is not the same governed action.
   *
   * Product 1.0 integrity: when the held Decision recorded a binding field,
   * the resume request MUST present the same value. Omitting a held field
   * (one-sided skip) is treated as CONTEXT_MISMATCH — clients cannot use
   * Evaluation A authorization to continue Action B by dropping identifiers.
   */
  private clientCommitContextMismatch(
    held: HeldRequestSnapshot,
    opts: {
      operation: string;
      toolId?: string;
      agentId?: string;
      purpose?: string;
      authorizationContext?: string;
      action?: {
        kind: string;
        target_id?: string;
        attributes?: Record<string, unknown>;
      };
    },
  ): string | null {
    const mustMatch = (
      heldVal: string | undefined | null,
      reqVal: string | undefined | null,
    ): boolean => {
      if (heldVal == null || heldVal === '') return true;
      if (reqVal == null || reqVal === '') return false;
      return heldVal === reqVal;
    };

    if (held.operation !== opts.operation) return 'CONTEXT_MISMATCH';
    if (!mustMatch(held.tool_id, opts.toolId)) return 'CONTEXT_MISMATCH';
    if (!mustMatch(held.agent_id, opts.agentId)) return 'CONTEXT_MISMATCH';
    if (!mustMatch(held.purpose, opts.purpose)) return 'CONTEXT_MISMATCH';
    if (!mustMatch(held.authorization_context, opts.authorizationContext)) {
      return 'CONTEXT_MISMATCH';
    }

    const gov = held.governance_context as Record<string, unknown> | undefined;
    const heldAction =
      gov?.action && typeof gov.action === 'object'
        ? (gov.action as {
            kind?: unknown;
            target_id?: unknown;
            attributes?: Record<string, unknown>;
          })
        : undefined;
    const heldKind =
      typeof heldAction?.kind === 'string' ? heldAction.kind : undefined;
    if (!mustMatch(heldKind, opts.action?.kind)) return 'CONTEXT_MISMATCH';
    const heldField =
      typeof heldAction?.attributes?.field === 'string'
        ? heldAction.attributes.field
        : undefined;
    const reqField =
      typeof opts.action?.attributes?.field === 'string'
        ? opts.action.attributes.field
        : undefined;
    if (!mustMatch(heldField, reqField)) return 'CONTEXT_MISMATCH';
    const heldTarget =
      typeof heldAction?.target_id === 'string' ? heldAction.target_id : undefined;
    if (!mustMatch(heldTarget, opts.action?.target_id)) return 'CONTEXT_MISMATCH';
    return null;
  }

  /**
   * Resume a specific AUTHORIZE'd client_commit Decision.
   * Does not create a new policy Decision. Does not grant standing write permission.
   */
  private async claimAuthorizedClientCommit(opts: {
    evaluationId: string;
    applicationId: string;
    userId: string;
    operation: string;
    toolId?: string;
    agentId?: string;
    purpose?: string;
    authorizationContext?: string;
    action?: {
      kind: string;
      target_id?: string;
      attributes?: Record<string, unknown>;
    };
    requestId: string;
    correlationId: string;
    organizationId: string;
    mode: 'explicit_resume' | 'content_fallback';
  }): Promise<ActionResult> {
    const failClaim = (
      httpStatus: number,
      reason_code: string,
      message: string,
    ): ActionResult => ({
      httpStatus,
      body: {
        request_id: opts.requestId,
        correlation_id: opts.correlationId,
        status: 'blocked',
        reason_code,
        message,
        evaluation_id: opts.evaluationId,
      },
    });

    if (
      !this.deps.policyRepository?.getEvaluation ||
      !this.deps.policyRepository.saveExecution
    ) {
      return failClaim(503, 'RESUME_UNAVAILABLE', 'Resume unavailable.');
    }

    const {
      assertResumeEligible,
      ResumeEvaluationError,
      markResumeInProgress,
      markResumed,
      markResumeFailed,
    } = await import('../policy/enterprise/decision-resume.js');

    const record = await Promise.resolve(
      this.deps.policyRepository.getEvaluation(opts.evaluationId),
    );
    if (!record) {
      return failClaim(404, 'NOT_FOUND', 'evaluation not found');
    }

    // Machine DENY (or any non-REVIEW) cannot be continued as a write commit.
    if (String(record.decision ?? '').toUpperCase() === 'DENY') {
      return failClaim(
        403,
        'DENY_CANNOT_RESUME',
        'Denied evaluations cannot be resumed.',
      );
    }

    const held = record.held_request;
    const gov = held?.governance_context as Record<string, unknown> | undefined;
    if (!held || held.version !== 1 || gov?.client_commit !== true) {
      return failClaim(
        409,
        'NOT_RESUMABLE',
        'Evaluation is not a resumable governed write hold.',
      );
    }
    if (held.application_id !== opts.applicationId) {
      return failClaim(403, 'APPLICATION_MISMATCH', 'Request blocked by policy.');
    }
    if (held.user_id !== opts.userId) {
      return failClaim(403, 'USER_MISMATCH', 'Request blocked by policy.');
    }

    const mismatch = this.clientCommitContextMismatch(held, {
      operation: opts.operation,
      toolId: opts.toolId,
      agentId: opts.agentId,
      purpose: opts.purpose,
      authorizationContext: opts.authorizationContext,
      action: opts.action,
    });
    if (mismatch) {
      return failClaim(
        409,
        mismatch,
        'Resume does not match the original governed action context.',
      );
    }

    try {
      assertResumeEligible(record);
    } catch (err) {
      if (err instanceof ResumeEvaluationError) {
        // Single-use: an already resumed Decision is not a standing write grant.
        if (err.code === 'ALREADY_RESUMED') {
          return failClaim(
            409,
            'ALREADY_RESUMED',
            'This authorized Decision was already resumed.',
          );
        }
        return failClaim(
          err.code === 'NOT_AUTHORIZED' || err.code === 'NOT_REVIEW' ? 403 : 409,
          err.code,
          err.message,
        );
      }
      throw err;
    }

    const machineDecision = record.decision;
    const inProgress = markResumeInProgress(record.execution);
    let working =
      (await Promise.resolve(
        this.deps.policyRepository.saveExecution(opts.evaluationId, inProgress),
      )) ?? record;
    if (working.decision !== machineDecision) {
      return failClaim(500, 'INTERNAL_ERROR', 'Failed to persist resume state.');
    }

    const result = await this.resumeAuthorizedEvaluation(working);
    if (result.httpStatus === 200) {
      const done = markResumed(working.execution, result.audit_id ?? '');
      await Promise.resolve(
        this.deps.policyRepository.saveExecution(opts.evaluationId, done),
      );
      return {
        httpStatus: 200,
        body: {
          request_id: working.request_id ?? opts.requestId,
          correlation_id: held.correlation_id ?? opts.correlationId,
          status: 'approved',
          evaluation_id: opts.evaluationId,
          machine_decision: String(machineDecision),
          action: 'commit_allowed',
          enforcement_boundary: 'client_commit_required',
          resumed: true,
        },
      };
    }

    const failed = markResumeFailed(
      working.execution,
      'reason_code' in result.body ? result.body.reason_code : 'RESUME_FAILED',
    );
    await Promise.resolve(
      this.deps.policyRepository.saveExecution(opts.evaluationId, failed),
    );
    return failClaim(
      409,
      'reason_code' in result.body ? result.body.reason_code : 'RESUME_FAILED',
      'Request blocked by policy.',
    );
  }

  /**
   * Phase 4 / 4.1 — accept a client-reported execution Outcome for an authorized write.
   * Does not re-run PDP. Does not overwrite machine decision.
   * Atomically claims (deployment_id, execution_id) before sealing CLIENT_OUTCOME_RECEIPT.
   */
  async reportActionOutcome(
    rawKey: string | undefined,
    rawBody: unknown,
  ): Promise<ActionOutcomeResult> {
    const requestId = newRequestId();
    let correlationId = newCorrelationId();

    const fail = (
      httpStatus: number,
      reason_code: string,
      message: string,
      extra: Partial<ActionOutcomeBlocked> = {},
    ): ActionOutcomeResult => ({
      httpStatus,
      body: {
        request_id: requestId,
        correlation_id: correlationId,
        status: httpStatus === 409 ? 'conflict' : 'blocked',
        reason_code,
        message,
        ...extra,
      },
    });

    const forbidden = findForbiddenOverrides(rawBody);
    if (forbidden.length > 0) {
      return fail(400, 'VALIDATION_FAILED', 'Invalid outcome receipt.');
    }

    const parsed = actionOutcomeRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return fail(400, 'VALIDATION_FAILED', 'Invalid outcome receipt.');
    }
    const body: ActionOutcomeRequestBody = parsed.data;
    if (body.metadata?.correlation_id) {
      correlationId = body.metadata.correlation_id;
    }

    let principal;
    try {
      principal = await this.deps.identity.authenticateApiKey(rawKey);
    } catch {
      return fail(401, 'UNAUTHORIZED', 'Authentication required.');
    }

    if (body.application_id !== principal.application.application_id) {
      return fail(403, 'APPLICATION_MISMATCH', 'Request blocked by policy.');
    }

    if (!this.deps.policyRepository?.getEvaluation) {
      return fail(503, 'OUTCOME_UNAVAILABLE', 'Outcome store unavailable.');
    }
    const outcomeStore: ActionOutcomeStore | undefined = this.deps.outcomeStore;
    if (!outcomeStore) {
      return fail(503, 'OUTCOME_UNAVAILABLE', 'Outcome store unavailable.');
    }

    const deploymentId = this.deps.resolveDeploymentId
      ? await this.deps.resolveDeploymentId()
      : 'local-memory';

    const record = await Promise.resolve(
      this.deps.policyRepository.getEvaluation(body.evaluation_id),
    );
    if (!record) {
      return fail(404, 'NOT_FOUND', 'evaluation not found', {
        evaluation_id: body.evaluation_id,
        execution_id: body.execution_id,
      });
    }

    const machineDecision = String(record.decision ?? '').toUpperCase();
    if (machineDecision === 'DENY') {
      return fail(
        403,
        'OUTCOME_NOT_AUTHORIZED',
        'Denied evaluations cannot receive execution outcomes.',
        {
          evaluation_id: body.evaluation_id,
          execution_id: body.execution_id,
        },
      );
    }

    const events = await this.deps.audit.list();
    const authzAudit = findClientCommitAllowedAudit(
      body.evaluation_id,
      events,
    );
    if (!authzAudit) {
      return fail(
        403,
        'OUTCOME_NOT_AUTHORIZED',
        'No CLIENT_COMMIT_ALLOWED enforcement for this evaluation.',
        {
          evaluation_id: body.evaluation_id,
          execution_id: body.execution_id,
        },
      );
    }

    const evalApp =
      (typeof record.subject?.application_id === 'string'
        ? record.subject.application_id
        : undefined) ??
      record.held_request?.application_id ??
      authzAudit.application_id;
    if (evalApp && evalApp !== body.application_id) {
      return fail(403, 'APPLICATION_MISMATCH', 'Request blocked by policy.', {
        evaluation_id: body.evaluation_id,
        execution_id: body.execution_id,
      });
    }
    if (
      authzAudit.application_id &&
      authzAudit.application_id !== body.application_id
    ) {
      return fail(403, 'APPLICATION_MISMATCH', 'Request blocked by policy.', {
        evaluation_id: body.evaluation_id,
        execution_id: body.execution_id,
      });
    }

    const bound = deriveAuthorizedOutcomeContext({
      evaluation: record,
      authzAudit,
      applicationId: body.application_id,
    });

    const mismatch = clientOutcomeContextMismatch(bound, {
      user: body.user,
      agent_id: body.agent_id,
      tool_id: body.tool_id,
      operation: body.operation,
      purpose: body.purpose,
      authorization_context: body.authorization_context,
      action: body.action,
    });
    if (mismatch) {
      return fail(
        409,
        mismatch,
        'Outcome context does not match the authorized action.',
        {
          evaluation_id: body.evaluation_id,
          execution_id: body.execution_id,
        },
      );
    }

    const outcome = body.outcome as ClientOutcomeStatus;
    const receiptHash = computeOutcomeReceiptHash({
      deployment_id: deploymentId,
      evaluation_id: bound.evaluation_id,
      execution_id: body.execution_id,
      outcome,
      application_id: bound.application_id,
      user_id: bound.user_id,
      agent_id: bound.agent_id,
      tool_id: bound.tool_id,
      operation: bound.operation,
      purpose: bound.purpose,
      authorization_context: bound.authorization_context,
      action_kind: bound.action_kind,
      target_id: bound.target_id,
      action_field: bound.action_field,
      request_id: bound.request_id,
    });

    const successBody = (opts: {
      status: 'accepted' | 'idempotent';
      projection: {
        request_id?: string | null;
        evaluation_id: string;
        execution_id: string;
        outcome: string;
        audit_event_id: string;
      };
    }): ActionOutcomeResult => ({
      httpStatus: 200,
      body: {
        request_id: opts.projection.request_id ?? requestId,
        correlation_id: correlationId,
        status: opts.status,
        evaluation_id: opts.projection.evaluation_id,
        execution_id: opts.projection.execution_id,
        outcome: opts.projection.outcome,
        audit_id: opts.projection.audit_event_id,
        evidence_class: 'client_reported',
        machine_decision: String(record.decision),
        human_resolution: record.human_resolution?.human_disposition ?? null,
        enforcement: 'CLIENT_COMMIT_ALLOWED',
      },
    });

    const sealConflict = async (existingOutcome: string, existingAuditId: string) => {
      await this.writeAudit({
        audit_id: newAuditId(),
        timestamp: new Date().toISOString(),
        organization_id: principal.organization.organization_id,
        application_id: body.application_id,
        user_id: bound.user_id ?? undefined,
        request_id: requestId,
        correlation_id: correlationId,
        operation: 'action.outcome_conflict',
        policy_decision: String(record.decision),
        response_decision: 'BLOCK',
        reason_codes: [
          OUTCOME_REASON_CODES.CONFLICT,
          outcomeReasonCode(outcome),
        ],
        metadata: {
          evaluation_id: body.evaluation_id,
          execution_id: body.execution_id,
          deployment_id: deploymentId,
          outcome,
          existing_outcome: existingOutcome,
          existing_audit_event_id: existingAuditId,
          client_outcome_report: true,
          authoritative: false,
          evidence_class: 'client_reported',
          enforcement: 'CLIENT_COMMIT_ALLOWED',
          __response_content: '',
        },
      });
    };

    // Existing claim — compare without sealing another RECEIPT.
    const existing = await outcomeStore.getByExecutionId(
      deploymentId,
      body.execution_id,
    );
    if (existing) {
      if (existing.receipt_hash === receiptHash) {
        await this.ensureOutcomeReceiptSealed(existing, {
          organizationId: principal.organization.organization_id,
          correlationId,
          machineDecision: String(record.decision),
          humanResolution: record.human_resolution?.human_disposition ?? null,
          bound,
        });
        return successBody({ status: 'idempotent', projection: existing });
      }
      await sealConflict(existing.outcome, existing.audit_event_id);
      return fail(
        409,
        'OUTCOME_CONFLICT',
        'execution_id already recorded with a different outcome.',
        {
          evaluation_id: body.evaluation_id,
          execution_id: body.execution_id,
          existing_outcome: existing.outcome,
        },
      );
    }

    // Atomic claim BEFORE sealing CLIENT_OUTCOME_RECEIPT.
    const reportedAt = new Date().toISOString();
    const auditId = newAuditId();
    const projection = {
      deployment_id: deploymentId,
      execution_id: body.execution_id,
      evaluation_id: body.evaluation_id,
      application_id: body.application_id,
      outcome,
      receipt_hash: receiptHash,
      audit_event_id: auditId,
      request_id: bound.request_id,
      reported_at: reportedAt,
      user_id: bound.user_id,
      agent_id: bound.agent_id,
      tool_id: bound.tool_id,
      operation: bound.operation,
      purpose: bound.purpose,
      authorization_context: bound.authorization_context,
      action_kind: bound.action_kind,
      target_id: bound.target_id,
      action_field: bound.action_field,
      evidence_class: 'client_reported' as const,
    };

    const claimed = await outcomeStore.claimAuthoritative(projection);
    if (!claimed.created) {
      if (claimed.record.receipt_hash === receiptHash) {
        // Winner seals RECEIPT; do not heal-race here.
        return successBody({
          status: 'idempotent',
          projection: claimed.record,
        });
      }
      await sealConflict(claimed.record.outcome, claimed.record.audit_event_id);
      return fail(
        409,
        'OUTCOME_CONFLICT',
        'execution_id already recorded with a different outcome.',
        {
          evaluation_id: body.evaluation_id,
          execution_id: body.execution_id,
          existing_outcome: claimed.record.outcome,
        },
      );
    }

    // Winner only: seal authoritative RECEIPT with the pre-claimed audit_id.
    const audited = await this.writeAudit({
      audit_id: auditId,
      timestamp: reportedAt,
      organization_id: principal.organization.organization_id,
      application_id: body.application_id,
      user_id: bound.user_id ?? undefined,
      request_id: bound.request_id ?? requestId,
      correlation_id: correlationId,
      operation: 'action.outcome',
      policy_decision: String(record.decision),
      response_decision: 'RELEASE',
      reason_codes: [
        OUTCOME_REASON_CODES.RECEIPT,
        outcomeReasonCode(outcome),
      ],
      metadata: {
        evaluation_id: body.evaluation_id,
        execution_id: body.execution_id,
        deployment_id: deploymentId,
        outcome,
        client_outcome_report: true,
        authoritative: true,
        evidence_class: 'client_reported',
        enforcement: 'CLIENT_COMMIT_ALLOWED',
        machine_decision: record.decision,
        human_resolution: record.human_resolution?.human_disposition ?? null,
        agent_id: bound.agent_id,
        tool_id: bound.tool_id,
        operation: bound.operation,
        purpose: bound.purpose,
        authorization_context: bound.authorization_context,
        action: {
          kind: bound.action_kind,
          target_id: bound.target_id,
          ...(bound.action_field ? { attributes: { field: bound.action_field } } : {}),
        },
        receipt_hash: receiptHash,
        __response_content: '',
      },
    });

    if (!audited.ok || !audited.event) {
      return fail(500, 'INTERNAL_ERROR', 'Outcome audit write failed.', {
        evaluation_id: body.evaluation_id,
        execution_id: body.execution_id,
      });
    }

    return successBody({ status: 'accepted', projection });
  }

  /**
   * If a claim exists but the RECEIPT audit was lost (seal failed after claim),
   * seal once using the reserved audit_event_id. Never creates a second RECEIPT
   * when the event already exists.
   */
  private async ensureOutcomeReceiptSealed(
    projection: {
      audit_event_id: string;
      evaluation_id: string;
      execution_id: string;
      outcome: string;
      application_id: string;
      request_id?: string | null;
      receipt_hash: string;
      deployment_id: string;
      user_id?: string | null;
      agent_id?: string | null;
      tool_id?: string | null;
      operation?: string | null;
      purpose?: string | null;
      authorization_context?: string | null;
      action_kind?: string | null;
      target_id?: string | null;
      action_field?: string | null;
      reported_at: string;
    },
    opts: {
      organizationId: string;
      correlationId: string;
      machineDecision: string;
      humanResolution: string | null;
      bound: {
        evaluation_id: string;
      };
    },
  ): Promise<void> {
    const audit = this.deps.audit as {
      getById?: (id: string) => Promise<AuditEvent | null>;
      list: () => Promise<AuditEvent[]>;
    };
    let existingEvent: AuditEvent | null = null;
    if (typeof audit.getById === 'function') {
      existingEvent = await audit.getById(projection.audit_event_id);
    } else {
      const all = await audit.list();
      existingEvent =
        all.find((e) => e.audit_id === projection.audit_event_id) ?? null;
    }
    if (existingEvent) return;

    await this.writeAudit({
      audit_id: projection.audit_event_id,
      timestamp: projection.reported_at,
      organization_id: opts.organizationId,
      application_id: projection.application_id,
      user_id: projection.user_id ?? undefined,
      request_id: projection.request_id ?? newRequestId(),
      correlation_id: opts.correlationId,
      operation: 'action.outcome',
      policy_decision: opts.machineDecision,
      response_decision: 'RELEASE',
      reason_codes: [
        OUTCOME_REASON_CODES.RECEIPT,
        outcomeReasonCode(projection.outcome as ClientOutcomeStatus),
      ],
      metadata: {
        evaluation_id: opts.bound.evaluation_id,
        execution_id: projection.execution_id,
        deployment_id: projection.deployment_id,
        outcome: projection.outcome,
        client_outcome_report: true,
        authoritative: true,
        evidence_class: 'client_reported',
        enforcement: 'CLIENT_COMMIT_ALLOWED',
        machine_decision: opts.machineDecision,
        human_resolution: opts.humanResolution,
        agent_id: projection.agent_id ?? null,
        tool_id: projection.tool_id ?? null,
        receipt_hash: projection.receipt_hash,
        healed_receipt: true,
        __response_content: '',
      },
    });
  }

  private auditWriteTail: Promise<void> = Promise.resolve();

  private async writeAudit(
    event: AuditEvent,
  ): Promise<{ ok: boolean; event?: AuditEvent }> {
    // Serialize integrity-chain writes within this process (Phase 4.1 concurrency).
    const run = async (): Promise<{ ok: boolean; event?: AuditEvent }> => {
      try {
        const sealed = await this.deps.audit.record(
          await this.withDecisionBinding(event),
        );
        return { ok: true, event: sealed };
      } catch {
        return { ok: false };
      }
    };
    const queued = this.auditWriteTail.then(run, run);
    this.auditWriteTail = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }

  /**
   * Bind operational audit to the authoritative Decision fingerprint when known.
   * Resume events bind to the authorizing evaluation (not a response-phase eval).
   * Normal RELEASE prefers response evaluation when present.
   */
  private async withDecisionBinding(event: AuditEvent): Promise<AuditEvent> {
    if (event.evaluation_id && event.decision_hash) return event;

    const meta = event.metadata ?? {};
    const isResume = meta.resume === true;
    const responseEvalId =
      typeof meta.response_evaluation_id === 'string'
        ? meta.response_evaluation_id
        : undefined;
    const inputEvalId =
      typeof event.evaluation_id === 'string' && event.evaluation_id
        ? event.evaluation_id
        : typeof meta.evaluation_id === 'string'
          ? meta.evaluation_id
          : undefined;

    const preferred = isResume
      ? inputEvalId ?? responseEvalId
      : event.response_decision === 'RELEASE' && responseEvalId
        ? responseEvalId
        : inputEvalId ?? responseEvalId;

    if (!preferred) {
      return {
        ...event,
        evaluation_id: event.evaluation_id ?? null,
        decision_hash: event.decision_hash ?? null,
      };
    }

    const repo = this.deps.policyRepository;
    if (!repo?.getEvaluation) {
      return { ...event, evaluation_id: preferred, decision_hash: null };
    }

    try {
      const record = await Promise.resolve(repo.getEvaluation(preferred));
      if (!record) {
        return { ...event, evaluation_id: preferred, decision_hash: null };
      }
      const binding = decisionBindingFromRecord(record);
      return {
        ...event,
        evaluation_id: binding.evaluation_id,
        decision_hash: binding.decision_hash,
      };
    } catch {
      return { ...event, evaluation_id: preferred, decision_hash: null };
    }
  }
}

/** Prefer the latest CLIENT_COMMIT_ALLOWED enforcement audit (not Outcome receipts). */
function findClientCommitAllowedAudit(
  evaluationId: string,
  events: AuditEvent[],
): AuditEvent | null {
  const matching: AuditEvent[] = [];
  for (const e of events) {
    const codes = e.reason_codes ?? [];
    if (!codes.includes('CLIENT_COMMIT_ALLOWED')) continue;
    // Phase 4.1: Outcome / conflict events also stamp CLIENT_COMMIT_ALLOWED for
    // correlation — they must not replace the enforcement authz event.
    if (codes.includes(OUTCOME_REASON_CODES.RECEIPT)) continue;
    if (codes.includes(OUTCOME_REASON_CODES.CONFLICT)) continue;
    if (
      e.operation === 'action.outcome' ||
      e.operation === 'action.outcome_conflict'
    ) {
      continue;
    }
    if (e.metadata?.client_outcome_report === true) continue;

    if (e.evaluation_id === evaluationId) {
      matching.push(e);
      continue;
    }
    const meta = e.metadata ?? {};
    if (meta.evaluation_id === evaluationId) {
      matching.push(e);
    }
  }
  if (matching.length === 0) return null;
  matching.sort((a, b) =>
    String(a.timestamp) < String(b.timestamp) ? 1 : -1,
  );
  return matching[0] ?? null;
}
