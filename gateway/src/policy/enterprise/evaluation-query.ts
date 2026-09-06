/**
 * Policy evaluation list summaries and decision-payload projection.
 * Pack-agnostic — policy_evaluations is the authority for historical decisions.
 */

import type { AuditEvent } from '../../audit/service.js';
import type { PolicyEvaluationRecord } from './evaluation-record.js';
import type { PolicyExplanation } from './types.js';
import { withOperatorExplanation } from './decision-explanation.js';
import type { PolicyDecision } from './types.js';
import {
  expectedActionFromDecision,
  projectEnforcementResult,
  type EnforcementProjection,
  type ExpectedActionCode,
} from './enforcement-projection.js';
import {
  reviewStateForRecord,
  type HumanResolution,
  type ReviewState,
} from './decision-resolution.js';

export interface PolicyEvaluationListItem {
  evaluation_id: string;
  created_at: string;
  /** Original machine decision (immutable). */
  decision: string;
  /** Final enforceable decision after human resolution, if any. */
  final_decision?: string;
  phase: string;
  /** Recorded evaluation status (distinct from policy lifecycle status). */
  status: 'recorded';
  request_id?: string;
  action?: string;
  resolution_category?: string;
  contributing_pack_ids: string[];
  policy_ids: string[];
  reason?: string;
  /** Expected action derived from effective decision — not verified enforcement. */
  action_summary: string;
  expected_action: ExpectedActionCode;
  /** @deprecated Prefer expected_action / enforcement.status */
  enforcement_result: string;
  /** True when pending human review (not yet resolved). */
  requires_review: boolean;
  controls_applied: boolean;
  review_state: ReviewState;
  human_resolution?: HumanResolution;
  /** Verified Gateway enforcement when an audit record can be joined. */
  enforcement: EnforcementProjection;
}

export interface DecisionConsequence {
  /** Human-readable expected action (what should happen). */
  action_summary: string;
  /** Machine expected action code. */
  expected_action: ExpectedActionCode;
  /**
   * @deprecated Not verified enforcement. Prefer expected_action.
   * Kept briefly for older clients; mirrors expected_action label.
   */
  enforcement_result: string;
  requires_review: boolean;
  /** Whether the decision requires Gateway controls (expected, not verified). */
  controls_applied: boolean;
}

/**
 * Derive expected action from a decision.
 * Does NOT claim Gateway enforcement occurred.
 */
export function deriveDecisionConsequence(
  decision: string,
  explanation?: PolicyExplanation | null,
  obligations?: unknown[],
): DecisionConsequence {
  const d = String(decision ?? '').toUpperCase();
  const expected = expectedActionFromDecision(decision, explanation, obligations);
  const controlsApplied = expected === 'APPLY_CONTROLS';

  if (d === 'DENY' || d === 'BLOCK' || d === 'BLOCK_OUTPUT') {
    return {
      action_summary: 'Block request via Gateway',
      expected_action: 'BLOCK',
      enforcement_result: 'BLOCK (expected)',
      requires_review: false,
      controls_applied: false,
    };
  }

  if (d === 'REVIEW') {
    return {
      action_summary: 'Hold for human review',
      expected_action: 'HOLD',
      enforcement_result: 'HOLD (expected)',
      requires_review: true,
      controls_applied: controlsApplied,
    };
  }

  if (d === 'TOKENIZE' || d === 'REDACT' || d === 'MASK' || d === 'TRANSFORM') {
    return {
      action_summary: 'Apply Gateway controls before model execution',
      expected_action: 'APPLY_CONTROLS',
      enforcement_result: 'APPLY_CONTROLS (expected)',
      requires_review: false,
      controls_applied: true,
    };
  }

  if (controlsApplied || d === 'ALLOW') {
    return {
      action_summary: controlsApplied
        ? 'Route through Gateway with controls'
        : 'Allow request through Gateway',
      expected_action: controlsApplied ? 'APPLY_CONTROLS' : 'ALLOW',
      enforcement_result: controlsApplied
        ? 'APPLY_CONTROLS (expected)'
        : 'ALLOW (expected)',
      requires_review: false,
      controls_applied: controlsApplied,
    };
  }

  return {
    action_summary: 'Process through Gateway',
    expected_action: 'PROCESS',
    enforcement_result: 'PROCESS (expected)',
    requires_review: false,
    controls_applied: false,
  };
}

export interface ListEvaluationsOptions {
  policyId?: string;
  limit?: number;
}

function policyIdsFromRecord(record: PolicyEvaluationRecord): string[] {
  const ids: string[] = [];
  for (const p of record.applicable_policies ?? []) {
    if (p && typeof p === 'object' && 'policy_id' in p) {
      const id = String((p as { policy_id: unknown }).policy_id ?? '');
      if (id) ids.push(id);
    }
  }
  return ids;
}

export function recordMatchesPolicy(
  record: PolicyEvaluationRecord,
  policyId: string,
): boolean {
  return policyIdsFromRecord(record).includes(policyId);
}

/**
 * Project meaningful request/context fields from a stored evaluation.
 * Only includes fields that were actually persisted — missing stays absent
 * (never invents "unknown", false, or N/A placeholders).
 */
export type ExecutionMode = 'simulation' | 'live';

export interface ProjectedRequestContext {
  execution_mode: ExecutionMode;
  phase: string;
  request_id?: string;
  action?: string;
  resource_type?: string;
  classification?: string;
  purpose?: string;
  recipient?: string;
  authorization?: string;
  source?: string;
  processing_location?: string;
  regulatory_applicability?: string[];
  environment?: string;
  deployment_mode?: string;
  risk_level?: string;
  application_id?: string;
  organization_id?: string;
  model?: string;
  intent?: string;
}

function optionalString(value: unknown): string | undefined {
  if (value == null) return undefined;
  const s = String(value).trim();
  return s.length > 0 ? s : undefined;
}

function optionalStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.map((v) => String(v).trim()).filter(Boolean);
  return items.length > 0 ? items : undefined;
}

export function projectRequestContext(
  record: PolicyEvaluationRecord,
): ProjectedRequestContext {
  const ctx = (record.context ?? {}) as Record<string, unknown>;
  const resource = (record.resource ?? {}) as Record<string, unknown>;
  const subject = (record.subject ?? {}) as Record<string, unknown>;
  const ai = (record.ai_context ?? {}) as Record<string, unknown>;
  const evidence = (record.evidence_in ?? {}) as Record<string, unknown>;
  const provenance =
    evidence.classification_provenance &&
    typeof evidence.classification_provenance === 'object'
      ? (evidence.classification_provenance as Record<string, unknown>)
      : undefined;
  const applicability =
    provenance?.applicability && typeof provenance.applicability === 'object'
      ? (provenance.applicability as Record<string, unknown>)
      : undefined;

  const projected: ProjectedRequestContext = {
    execution_mode: record.phase === 'simulate' ? 'simulation' : 'live',
    phase: record.phase,
  };

  const requestId = optionalString(record.request_id);
  if (requestId) projected.request_id = requestId;

  const action = optionalString(record.action);
  if (action) projected.action = action;

  const resourceType = optionalString(resource.type);
  if (resourceType) projected.resource_type = resourceType;

  const classification =
    optionalString(evidence.classification) ??
    optionalString(resource.classification) ??
    optionalString(provenance?.classification);
  if (classification) projected.classification = classification;

  const purpose = optionalString(ctx.purpose);
  if (purpose) projected.purpose = purpose;

  const recipient = optionalString(ctx.recipient);
  if (recipient) projected.recipient = recipient;

  const authorization = optionalString(ctx.authorization);
  if (authorization) projected.authorization = authorization;

  const source = optionalString(ctx.source);
  if (source) projected.source = source;

  const processingLocation = optionalString(ctx.processing_location);
  if (processingLocation) projected.processing_location = processingLocation;

  const regulatory =
    optionalStringList(applicability?.packs) ??
    optionalStringList(
      (evidence.reason_codes as unknown[])
        ?.filter(
          (c) =>
            typeof c === 'string' &&
            c.startsWith('REGULATORY_APPLICABILITY:'),
        )
        .map((c) => String(c).replace('REGULATORY_APPLICABILITY:', '')),
    );
  if (regulatory) projected.regulatory_applicability = regulatory;

  const environment = optionalString(ctx.environment);
  if (environment) projected.environment = environment;

  const deploymentMode = optionalString(ctx.deployment_mode);
  if (deploymentMode) projected.deployment_mode = deploymentMode;

  const riskLevel = optionalString(ctx.risk_level) ?? optionalString(evidence.risk);
  if (riskLevel) projected.risk_level = riskLevel;

  const applicationId = optionalString(subject.application_id);
  if (applicationId) projected.application_id = applicationId;

  const organizationId =
    optionalString(record.organization_id) ??
    optionalString(subject.organization_id);
  if (organizationId) projected.organization_id = organizationId;

  const model =
    optionalString(ai.requested_model) ?? optionalString(ai.model_id);
  if (model) projected.model = model;

  const intent = optionalString(evidence.intent);
  if (intent) projected.intent = intent;

  return projected;
}

export function toEvaluationListItem(
  record: PolicyEvaluationRecord,
  audit?: AuditEvent | null,
): PolicyEvaluationListItem {
  const explanation = record.explanation ?? ({} as PolicyExplanation);
  const reviewState = reviewStateForRecord(record);
  const effectiveDecision =
    record.human_resolution?.resolution_status === 'RESOLVED'
      ? record.human_resolution.final_decision
      : record.decision;
  const consequence = deriveDecisionConsequence(
    effectiveDecision,
    explanation,
    record.obligations,
  );
  // Pending REVIEW must keep HOLD / requires_review even if category is UNRESOLVED.
  if (reviewState === 'pending') {
    consequence.expected_action = 'HOLD';
    consequence.action_summary = 'Hold for human review';
    consequence.enforcement_result = 'HOLD (expected)';
    consequence.requires_review = true;
  }
  if (reviewState === 'resolved') {
    consequence.requires_review = false;
  }
  const enforcement = projectEnforcementResult(record, audit ?? null);
  return {
    evaluation_id: record.evaluation_id,
    created_at: record.created_at,
    decision: record.decision,
    final_decision: record.human_resolution?.final_decision,
    phase: record.phase,
    status: 'recorded',
    request_id: record.request_id,
    action: record.action,
    resolution_category: explanation.resolution?.category,
    contributing_pack_ids:
      explanation.resolution?.contributing_pack_ids ??
      explanation.operator?.contributing_pack_ids ??
      [],
    policy_ids: policyIdsFromRecord(record),
    reason: record.reason,
    action_summary: consequence.action_summary,
    expected_action: consequence.expected_action,
    enforcement_result: enforcement.status,
    requires_review: reviewState === 'pending',
    controls_applied: consequence.controls_applied,
    review_state: reviewState,
    human_resolution: record.human_resolution,
    enforcement,
  };
}

/**
 * Project a stored evaluation into the same decision shape Simulate uses
 * for DecisionExplanationView.
 */
export function evaluationRecordToDecisionPayload(
  record: PolicyEvaluationRecord,
): PolicyDecision {
  const explanation = record.explanation ?? {
    matched_conditions: [],
    rejected_conditions: [],
    final_reason: record.reason ?? record.decision,
  };

  const obligations = Array.isArray(record.obligations)
    ? record.obligations
        .map((o) => {
          if (o && typeof o === 'object' && 'code' in o) {
            return { code: String((o as { code: unknown }).code) };
          }
          return null;
        })
        .filter((o): o is { code: string } => o != null)
    : [];

  const applicable_policies = Array.isArray(record.applicable_policies)
    ? record.applicable_policies
        .map((p) => {
          if (!p || typeof p !== 'object') return null;
          const row = p as {
            policy_id?: unknown;
            version?: unknown;
            pack_id?: unknown;
            name?: unknown;
          };
          if (!row.policy_id) return null;
          return {
            policy_id: String(row.policy_id),
            version: Number(row.version ?? 0),
            pack_id: row.pack_id != null ? String(row.pack_id) : undefined,
            name: row.name != null ? String(row.name) : undefined,
          };
        })
        .filter((p): p is NonNullable<typeof p> => p != null)
    : [];

  const decision: PolicyDecision = {
    decision: record.decision as PolicyDecision['decision'],
    reason: record.reason ?? record.decision,
    reason_codes:
      record.reason_codes ??
      (Array.isArray(
        (record.evidence_in as { decision_reason_codes?: unknown })
          ?.decision_reason_codes,
      )
        ? (
            (record.evidence_in as { decision_reason_codes: unknown[] })
              .decision_reason_codes
          ).map(String)
        : []),
    applicable_policies,
    obligations: obligations as PolicyDecision['obligations'],
    transformations: [],
    restrictions: {},
    approval_requirements: [],
    conflicts: [],
    explanation,
    evidence: {
      classification: String(
        (record.evidence_in as { classification?: string })?.classification ??
          'Internal',
      ) as PolicyDecision['evidence']['classification'],
      confidence: 1,
      risk: 'medium',
      reason_codes: [],
    },
    evaluation_id: record.evaluation_id,
  };

  // Ensure operator view exists for historical records that predate operator projection.
  if (!decision.explanation.operator) {
    return withOperatorExplanation(decision);
  }
  return decision;
}

export function rowToEvaluationRecord(row: Record<string, unknown>): PolicyEvaluationRecord {
  const created =
    row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at ?? new Date().toISOString());
  const explanation = (row.explanation as PolicyExplanation) ?? {
    matched_conditions: [],
    rejected_conditions: [],
    final_reason: String(row.decision),
  };
  const fromColumn = row.human_resolution;
  const fromExplanation = (explanation as { human_resolution?: unknown }).human_resolution;
  const rawResolution = fromColumn ?? fromExplanation;
  let human_resolution: PolicyEvaluationRecord['human_resolution'];
  if (rawResolution && typeof rawResolution === 'object') {
    human_resolution = rawResolution as PolicyEvaluationRecord['human_resolution'];
  }
  const fromHeldCol = row.held_request;
  const fromHeldExpl = (explanation as { _enigma_held_request?: unknown })
    ._enigma_held_request;
  const rawHeld = fromHeldCol ?? fromHeldExpl;
  let held_request: PolicyEvaluationRecord['held_request'];
  if (rawHeld && typeof rawHeld === 'object') {
    held_request = rawHeld as PolicyEvaluationRecord['held_request'];
  }
  const fromExecCol = row.execution;
  const fromExecExpl = (explanation as { _enigma_execution?: unknown })
    ._enigma_execution;
  const rawExec = fromExecCol ?? fromExecExpl;
  let execution: PolicyEvaluationRecord['execution'];
  if (rawExec && typeof rawExec === 'object') {
    execution = rawExec as PolicyEvaluationRecord['execution'];
  }
  return {
    evaluation_id: String(row.evaluation_id),
    request_id: row.request_id != null ? String(row.request_id) : undefined,
    phase: (row.phase as PolicyEvaluationRecord['phase']) ?? 'input',
    organization_id:
      row.organization_id != null ? String(row.organization_id) : undefined,
    subject: (row.subject as Record<string, unknown>) ?? {},
    resource: (row.resource as Record<string, unknown>) ?? {},
    action: row.action != null ? String(row.action) : undefined,
    context: (row.context as Record<string, unknown>) ?? {},
    ai_context: (row.ai_context as Record<string, unknown>) ?? {},
    evidence_in: (row.evidence_in as Record<string, unknown>) ?? {},
    decision: String(row.decision),
    reason: row.reason != null ? String(row.reason) : undefined,
    reason_codes: Array.isArray(
      (row.evidence_in as { decision_reason_codes?: unknown })?.decision_reason_codes,
    )
      ? (
          (row.evidence_in as { decision_reason_codes: unknown[] })
            .decision_reason_codes
        ).map(String)
      : undefined,
    applicable_policies: Array.isArray(row.applicable_policies)
      ? row.applicable_policies
      : [],
    obligations: Array.isArray(row.obligations) ? row.obligations : [],
    explanation,
    created_at: created,
    human_resolution,
    held_request,
    execution,
  };
}
