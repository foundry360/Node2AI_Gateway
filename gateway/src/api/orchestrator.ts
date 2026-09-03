import type { AuditEvent, AuditService } from '../audit/service.js';
import type { IdentityService } from '../identity/service.js';
import type { DataInterrogator } from '../interrogation/types.js';
import { selectEligibleModel } from '../models/router.js';
import type { ModelGateway, ModelMessage } from '../models/types.js';
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
            errors: { message: ge.message },
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
          errors: { message: mapped.message },
          reason_codes: [mapped.reasonCode],
        });
      }
      if (isGatewayError(err)) {
        return block(err.httpStatus, err.reasonCode, 'Request blocked by policy.', {
          errors: { message: err.message },
        });
      }
      return block(403, 'INTERNAL_ERROR', 'Request blocked by policy.', {
        errors: { message: err instanceof Error ? err.message : 'unknown' },
      });
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
