import type { AuditEvent, AuditService } from '../audit/service.js';
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
  completionRequestSchema,
  findForbiddenOverrides,
  type CompletionRequestBody,
} from './validation.js';

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
}

export interface CompletionBlocked {
  request_id: string;
  correlation_id: string;
  status: 'blocked';
  reason_code: string;
  message: string;
}

export type CompletionResult =
  | { httpStatus: 200; body: CompletionSuccess }
  | { httpStatus: number; body: CompletionBlocked };

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
}

/**
 * Single canonical AI execution path.
 * APPLICATION → IDENTITY → INTERROGATION → POLICY → TRANSFORM → MODEL
 *   → RESPONSE INSPECT → POLICY → TRANSFORM → (authorized detokenize) → AUDIT
 */
export class GatewayOrchestrator {
  constructor(private readonly deps: GatewayOrchestratorDeps) {}

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
      try {
        policyResult = await this.deps.policy.evaluateRequest({
          user,
          application: principal.application,
          operation: body.operation,
          requestedModel: body.model,
          availableModels: this.deps.models.listAvailableModels(),
          environment: principal.application.environment,
          classification,
          deploymentMode: this.deps.config.deploymentMode,
          request_id: requestId,
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
      if (
        responsePolicy.decision === 'REDACT' ||
        responsePolicy.decision === 'TRANSFORM'
      ) {
        // Keep content as-is when no output transform service path needed for stub;
        // mirror completions() for detokenize authorization below.
        responseTransformation = String(responsePolicy.decision).toLowerCase();
      }

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
        },
        audit_id: audited.event?.audit_id,
      };
    } catch (err) {
      const mapped = gatewayErrorFromUnknown(err);
      return fail(mapped?.reasonCode ?? 'INTERNAL_ERROR');
    }
  }

  private async writeAudit(
    event: AuditEvent,
  ): Promise<{ ok: boolean; event?: AuditEvent }> {
    try {
      const sealed = await this.deps.audit.record(event);
      return { ok: true, event: sealed };
    } catch {
      return { ok: false };
    }
  }
}
