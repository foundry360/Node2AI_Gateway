/**
 * Policy evaluation list summaries and decision-payload projection.
 * Pack-agnostic — policy_evaluations is the authority for historical decisions.
 */

import type { AuditEvent } from '../../audit/service.js';
import type { PolicyEvaluationRecord } from './evaluation-record.js';
import type { PolicyExplanation } from './types.js';
import { withOperatorExplanation } from './decision-explanation.js';
import type { PolicyDecision } from './types.js';
import type { GovernanceContext } from '../types.js';
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
import {
  buildLifecycleChangeInventory,
  type ChangeReviewPreview,
} from './change-governance/evaluate.js';
import type {
  ChangeReviewContext,
  GovernanceBaselineTargetType,
  GovernanceChangeType,
  GovernanceImpactDimension,
  LifecycleDecision,
  MaterialityClass,
} from './change-governance/types.js';
import {
  buildActionReviewPresentation,
  type ActionReviewPresentation,
} from './action-review-presentation.js';

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
  governance?: GovernanceContext;
  source?: string;
  processing_location?: string;
  regulatory_applicability?: string[];
  evaluation_as_of?: string;
  environment?: string;
  deployment_mode?: string;
  risk_level?: string;
  application_id?: string;
  organization_id?: string;
  model?: string;
  intent?: string;
}

/** Review-safe request payload for Decision → Request Review tab. */
export interface HeldRequestPreview {
  operation: string;
  model?: string;
  application_id: string;
  organization_id: string;
  user_id: string;
  correlation_id: string;
  messages: Array<{ role: string; content: string }>;
  classification: {
    sensitivity: string;
    confidence: number;
    intent?: string;
    risk: 'low' | 'medium' | 'high';
    reason_codes: string[];
    entities?: Array<{
      type: string;
      start: number;
      end: number;
      preview?: string;
    }>;
  };
  /** True when original messages were retained (held snapshot). */
  retained: boolean;
  /** Structured change inventory for lifecycle / capability REVIEW holds. */
  change_review?: ChangeReviewPreview;
  /** Human-readable Request Review presentation (application-agnostic). */
  action_review: ActionReviewPresentation;
}

export type { ChangeReviewPreview, ActionReviewPresentation };

/**
 * Always project a Request Review payload for the Decision page tab.
 * Prefers held_request; otherwise reconstructs from the evaluation record.
 */
function isChangeReviewPreview(value: unknown): value is ChangeReviewPreview {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.change_id === 'string' &&
    typeof row.target_type === 'string' &&
    typeof row.target_id === 'string' &&
    Array.isArray(row.items)
  );
}

function asReviewContext(value: unknown): ChangeReviewContext | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const row = value as Record<string, unknown>;
  const conversation = Array.isArray(row.conversation)
    ? row.conversation
        .filter((t) => t && typeof t === 'object')
        .map((t) => {
          const turn = t as Record<string, unknown>;
          return {
            role: String(turn.role ?? 'user'),
            content: String(turn.content ?? ''),
          };
        })
        .filter((t) => t.content.trim().length > 0)
    : undefined;
  const ctx: ChangeReviewContext = {};
  if (typeof row.title === 'string' && row.title.trim()) ctx.title = row.title;
  if (typeof row.summary === 'string' && row.summary.trim()) ctx.summary = row.summary;
  if (typeof row.requester_prompt === 'string' && row.requester_prompt.trim()) {
    ctx.requester_prompt = row.requester_prompt;
  }
  if (typeof row.rationale === 'string' && row.rationale.trim()) {
    ctx.rationale = row.rationale;
  } else if (typeof row.agent_rationale === 'string' && row.agent_rationale.trim()) {
    ctx.rationale = row.agent_rationale;
  }
  if (typeof row.intended_outcome === 'string' && row.intended_outcome.trim()) {
    ctx.intended_outcome = row.intended_outcome;
  }
  if (conversation?.length) ctx.conversation = conversation;
  return Object.keys(ctx).length > 0 ? ctx : undefined;
}

/** Prefer stored inventory; rebuild from lifecycle evidence when needed. */
export function projectChangeReview(
  record: PolicyEvaluationRecord,
): ChangeReviewPreview | undefined {
  const evidence = (record.evidence_in ?? {}) as Record<string, unknown>;
  const reviewContext =
    asReviewContext(evidence.review_context) ??
    asReviewContext(
      isChangeReviewPreview(evidence.change_review)
        ? (evidence.change_review as { evidence?: unknown }).evidence
        : undefined,
    );

  if (isChangeReviewPreview(evidence.change_review)) {
    const stored = evidence.change_review;
    if (stored.evidence?.title && stored.evidence?.summary) {
      return stored;
    }
    // Older holds: rehydrate evidence from stored inventory + review_context.
    return buildLifecycleChangeInventory({
      change_id: stored.change_id,
      ...(stored.request_id ? { request_id: stored.request_id } : {}),
      ...(stored.correlation_id ? { correlation_id: stored.correlation_id } : {}),
      target_type: stored.target_type as GovernanceBaselineTargetType,
      target_id: stored.target_id,
      ...(stored.previous_baseline_id
        ? { previous_baseline_id: stored.previous_baseline_id }
        : {}),
      ...(stored.actor ? { actor: stored.actor } : {}),
      source: stored.source ?? 'unknown',
      previous_state:
        evidence.previous_state && typeof evidence.previous_state === 'object'
          ? (evidence.previous_state as Record<string, unknown>)
          : {},
      proposed_state:
        evidence.proposed_state && typeof evidence.proposed_state === 'object'
          ? (evidence.proposed_state as Record<string, unknown>)
          : {},
      change_types: stored.change_types as GovernanceChangeType[],
      materiality: stored.materiality as MaterialityClass,
      materiality_reasons: stored.materiality_reasons ?? [],
      governance_impacts:
        stored.governance_impacts as GovernanceImpactDimension[],
      lifecycle_decision: stored.lifecycle_decision as LifecycleDecision,
      detected_at: record.created_at,
      ...(reviewContext ? { review_context: reviewContext } : {}),
    });
  }
  if (evidence.lifecycle_hold !== true) return undefined;
  const proposed =
    evidence.proposed_state && typeof evidence.proposed_state === 'object'
      ? (evidence.proposed_state as Record<string, unknown>)
      : undefined;
  if (!proposed) return undefined;
  const previous =
    evidence.previous_state && typeof evidence.previous_state === 'object'
      ? (evidence.previous_state as Record<string, unknown>)
      : {};

  return buildLifecycleChangeInventory({
    change_id: optionalString(evidence.change_id) ?? record.evaluation_id,
    ...(optionalString(record.request_id)
      ? { request_id: optionalString(record.request_id) }
      : {}),
    ...(optionalString(evidence.correlation_id)
      ? { correlation_id: optionalString(evidence.correlation_id) }
      : {}),
    target_type: (optionalString(evidence.target_type) ??
      'application') as GovernanceBaselineTargetType,
    target_id:
      optionalString(evidence.target_id) ??
      optionalString(
        (record.subject as Record<string, unknown> | undefined)?.application_id,
      ) ??
      '—',
    ...(optionalString(evidence.previous_baseline_id)
      ? { previous_baseline_id: optionalString(evidence.previous_baseline_id) }
      : {}),
    ...(optionalString(evidence.actor)
      ? { actor: optionalString(evidence.actor) }
      : {}),
    source: optionalString(evidence.source) ?? 'unknown',
    previous_state: previous,
    proposed_state: proposed,
    change_types: Array.isArray(evidence.change_types)
      ? (evidence.change_types as GovernanceChangeType[])
      : [],
    materiality: (optionalString(evidence.materiality) ??
      'MATERIAL') as MaterialityClass,
    materiality_reasons: Array.isArray(evidence.materiality_reasons)
      ? (evidence.materiality_reasons as string[])
      : [],
    governance_impacts: Array.isArray(evidence.governance_impacts)
      ? (evidence.governance_impacts as GovernanceImpactDimension[])
      : [],
    lifecycle_decision: (optionalString(evidence.lifecycle_decision) ??
      'HUMAN_REVIEW_REQUIRED') as LifecycleDecision,
    detected_at: record.created_at,
    ...(reviewContext ? { review_context: reviewContext } : {}),
  });
}

function withActionReview(
  preview: Omit<HeldRequestPreview, 'action_review'>,
  record: PolicyEvaluationRecord,
): HeldRequestPreview {
  return {
    ...preview,
    action_review: buildActionReviewPresentation({
      operation: preview.operation,
      model: preview.model,
      application_id: preview.application_id,
      organization_id: preview.organization_id,
      user_id: preview.user_id,
      correlation_id: preview.correlation_id,
      messages: preview.messages,
      classification: preview.classification,
      retained: preview.retained,
      change_review: preview.change_review,
      machine_decision: record.decision,
      final_decision: record.human_resolution?.final_decision,
      human_disposition: record.human_resolution?.human_disposition,
    }),
  };
}

export function projectHeldRequestPreview(
  record: PolicyEvaluationRecord,
): HeldRequestPreview {
  const change_review = projectChangeReview(record);
  const held = record.held_request;
  if (
    held &&
    held.version === 1 &&
    held.operation &&
    Array.isArray(held.messages) &&
    held.messages.length > 0 &&
    held.application_id &&
    held.organization_id &&
    held.user_id
  ) {
    return withActionReview(
      {
        operation: held.operation,
        ...(held.model ? { model: held.model } : {}),
        application_id: held.application_id,
        organization_id: held.organization_id,
        user_id: held.user_id,
        correlation_id: held.correlation_id,
        messages: held.messages.map((m) => ({
          role: String(m.role ?? 'user'),
          content: String(m.content ?? ''),
        })),
        classification: {
          sensitivity: held.classification.sensitivity,
          confidence: held.classification.confidence,
          ...(held.classification.intent
            ? { intent: held.classification.intent }
            : {}),
          risk: held.classification.risk,
          reason_codes: [...(held.classification.reason_codes ?? [])],
          ...(held.classification.entities?.length
            ? {
                entities: held.classification.entities.map((e) => ({
                  type: e.type,
                  start: e.start,
                  end: e.end,
                  ...(e.preview ? { preview: e.preview } : {}),
                })),
              }
            : {}),
        },
        retained: true,
        ...(change_review ? { change_review } : {}),
      },
      record,
    );
  }

  const subject = (record.subject ?? {}) as Record<string, unknown>;
  const ai = (record.ai_context ?? {}) as Record<string, unknown>;
  const evidence = (record.evidence_in ?? {}) as Record<string, unknown>;
  const resource = (record.resource ?? {}) as Record<string, unknown>;

  const sensitivity =
    optionalString(evidence.classification) ??
    optionalString(resource.classification) ??
    'unknown';
  const riskRaw = optionalString(evidence.risk) ?? optionalString(ai.risk);
  const risk =
    riskRaw === 'low' || riskRaw === 'medium' || riskRaw === 'high'
      ? riskRaw
      : 'medium';
  const reasonCodes = Array.isArray(record.reason_codes)
    ? record.reason_codes.map(String)
    : Array.isArray(evidence.decision_reason_codes)
      ? (evidence.decision_reason_codes as unknown[]).map(String)
      : [];

  const operation =
    optionalString(record.action)?.toLowerCase() ??
    optionalString(ai.operation) ??
    '—';

  return withActionReview(
    {
      operation,
      ...(optionalString(ai.model) ? { model: optionalString(ai.model) } : {}),
      application_id:
        optionalString(subject.application_id) ??
        optionalString(ai.application_id) ??
        '—',
      organization_id:
        optionalString(record.organization_id) ??
        optionalString(subject.organization_id) ??
        '—',
      user_id:
        optionalString(subject.user_id) ?? optionalString(subject.id) ?? '—',
      correlation_id: optionalString(record.request_id) ?? record.evaluation_id,
      messages: [],
      classification: {
        sensitivity,
        confidence:
          typeof evidence.confidence === 'number' ? evidence.confidence : 0,
        ...(optionalString(evidence.intent) || optionalString(ai.intent)
          ? {
              intent:
                optionalString(evidence.intent) ?? optionalString(ai.intent),
            }
          : {}),
        risk,
        reason_codes: reasonCodes,
      },
      retained: false,
      ...(change_review ? { change_review } : {}),
    },
    record,
  );
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

  const governanceRaw = ctx.governance;
  if (governanceRaw && typeof governanceRaw === 'object') {
    const g = governanceRaw as Record<string, unknown>;
    const governance: NonNullable<ProjectedRequestContext['governance']> = {};
    if (typeof g.accountability_documented === 'boolean') {
      governance.accountability_documented = g.accountability_documented;
    }
    if (typeof g.system_context_documented === 'boolean') {
      governance.system_context_documented = g.system_context_documented;
    }
    if (typeof g.measurement_documented === 'boolean') {
      governance.measurement_documented = g.measurement_documented;
    }
    if (typeof g.risk_response_documented === 'boolean') {
      governance.risk_response_documented = g.risk_response_documented;
    }
    if (g.security_controls && typeof g.security_controls === 'object') {
      governance.security_controls = g.security_controls as NonNullable<
        GovernanceContext['security_controls']
      >;
    }
    if (g.regulatory && typeof g.regulatory === 'object') {
      governance.regulatory = g.regulatory as NonNullable<GovernanceContext['regulatory']>;
    }
    if (g.management_system && typeof g.management_system === 'object') {
      governance.management_system = g.management_system as NonNullable<
        GovernanceContext['management_system']
      >;
    }
    if (g.ai_risk && typeof g.ai_risk === 'object') {
      governance.ai_risk = g.ai_risk as NonNullable<GovernanceContext['ai_risk']>;
    }
    if (g.impact && typeof g.impact === 'object') {
      governance.impact = g.impact as NonNullable<GovernanceContext['impact']>;
    }
    if (g.assurance && typeof g.assurance === 'object') {
      governance.assurance = g.assurance as NonNullable<GovernanceContext['assurance']>;
    }
    if (g.cybersecurity && typeof g.cybersecurity === 'object') {
      governance.cybersecurity = g.cybersecurity as NonNullable<
        GovernanceContext['cybersecurity']
      >;
    }
    if (g.organizational_governance && typeof g.organizational_governance === 'object') {
      governance.organizational_governance = g.organizational_governance as NonNullable<
        GovernanceContext['organizational_governance']
      >;
    }
    if (g.information_security && typeof g.information_security === 'object') {
      governance.information_security = g.information_security as NonNullable<
        GovernanceContext['information_security']
      >;
    }
    if (g.privacy && typeof g.privacy === 'object') {
      governance.privacy = g.privacy as NonNullable<GovernanceContext['privacy']>;
    }
    if (Object.keys(governance).length > 0) projected.governance = governance;
  }

  const evaluationAsOf = optionalString(ctx.time);
  if (evaluationAsOf) projected.evaluation_as_of = evaluationAsOf;

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
