/**
 * Change evaluation orchestration.
 * Lifecycle decisions remain distinct from policy decisions.
 * Material / critical / unknown paths invoke the existing generic PDP.
 */

import { randomUUID } from 'node:crypto';
import type { Application, User } from '../../../identity/types.js';
import type { PolicyRequestContext } from '../../types.js';
import type { PackBackedEnterprisePdp } from '../pack-pdp.js';
import type { PolicyRepository } from '../pg-repository.js';
import type { PolicyDecision } from '../types.js';
import { createGovernanceBaseline, nextBaselineFromChange } from './baseline.js';
import { assessMateriality, lifecycleToPolicyHold } from './materiality.js';
import type { InMemoryChangeGovernanceRepository } from './repository.js';
import type {
  ChangeEvaluationResult,
  ChangeInput,
  ChangeReviewContext,
  GovernanceBaseline,
  NormalizedChange,
} from './types.js';

export interface EvaluateChangeOptions {
  repository: InMemoryChangeGovernanceRepository;
  input: ChangeInput;
  /** Existing generic PDP — required when re-evaluation / mandatory review. */
  pdp?: PackBackedEnterprisePdp;
  /** Policy evaluation store — used to persist lifecycle REVIEW holds on the same evaluation. */
  policy_repository?: PolicyRepository;
  /** Request context builder inputs for PDP invocation. */
  policy_context?: {
    user: User;
    application: Application;
    operation?: string;
    requestedModel?: string;
    availableModels?: string[];
    environment?: string;
    sensitivity?: string;
    regulatory_applicability?: string[];
    governance_context?: PolicyRequestContext['governance_context'];
    evaluation_phase?: 'input' | 'simulate';
    evaluation_as_of?: string;
  };
  /** When true, commit next baseline even if policy holds (records governed proposal). */
  commit_baseline_on_hold?: boolean;
}

function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function baselineToState(b: GovernanceBaseline): Record<string, unknown> {
  return {
    capabilities: structuredClone(b.capabilities),
    configuration: structuredClone(b.configuration),
    components: structuredClone(b.components),
    governance_context: b.governance_context
      ? structuredClone(b.governance_context)
      : undefined,
    applicable_authorities: b.applicable_authorities
      ? [...b.applicable_authorities]
      : undefined,
    write_capability: b.capabilities.write_capability,
    autonomy_level: b.capabilities.autonomy_level,
    tools: b.capabilities.tools,
    data_sources: b.capabilities.data_sources,
    model_id: b.capabilities.model_id,
    model_version: b.capabilities.model_version,
    model_provider: b.capabilities.model_provider,
    processing_location: b.capabilities.processing_location,
    system_prompt_hash: b.capabilities.system_prompt_hash,
    ui_label: b.configuration.ui_label,
  };
}

function buildPolicyContext(
  opts: EvaluateChangeOptions,
  change: NormalizedChange,
): PolicyRequestContext {
  const pc = opts.policy_context!;
  const proposed = change.proposed_state;
  const applicability =
    pc.regulatory_applicability ??
    (proposed.applicable_authorities as string[] | undefined) ??
    [];
  const reason_codes = [
    ...applicability.map((a) =>
      a.startsWith('REGULATORY_APPLICABILITY:')
        ? a
        : `REGULATORY_APPLICABILITY:${a}`,
    ),
    ...change.change_types.map((t) => `LIFECYCLE_CHANGE_TYPE:${t}`),
  ];
  const introducingWrite = change.change_types.includes('WRITE_CAPABILITY');
  // Capability grants that introduce write must be evaluated as WRITE actions so
  // policy packs can return ALLOW / ALLOW_WITH_CONTROLS / REQUIRE_APPROVAL / DENY.
  const operation = introducingWrite ? 'write' : (pc.operation ?? 'summarize');
  const allowedOperations = introducingWrite
    ? [...new Set([...pc.application.allowed_operations, 'write'])]
    : pc.application.allowed_operations;
  const sensitivity =
    (pc.sensitivity as PolicyRequestContext['classification']['sensitivity']) ??
    'INTERNAL';
  return {
    user: pc.user,
    application: {
      ...pc.application,
      allowed_operations: allowedOperations,
    },
    operation,
    requestedModel:
      pc.requestedModel ??
      (proposed.model_id as string | undefined) ??
      pc.application.allowed_models[0],
    availableModels: pc.availableModels ?? pc.application.allowed_models,
    environment: pc.environment ?? 'prod',
    classification: {
      sensitivity,
      confidence: 0.9,
      risk: introducingWrite && sensitivity === 'PHI' ? 'high' : 'medium',
      reason_codes,
    },
    deploymentMode: 'connected',
    governance_context:
      pc.governance_context ??
      (proposed.governance_context as PolicyRequestContext['governance_context']),
    processing_location: proposed.processing_location as string | undefined,
    evaluation_as_of: pc.evaluation_as_of,
    evaluation_phase: pc.evaluation_phase,
    request_id: change.request_id,
  };
}

/** Decisions that hold execution pending human authorization (compat: REVIEW ≈ REQUIRE_APPROVAL). */
function isApprovalHoldDecision(decision: PolicyDecision | undefined): boolean {
  const d = String(decision?.decision ?? '').toUpperCase();
  return d === 'REVIEW' || d === 'REQUIRE_APPROVAL';
}

/**
 * Force a REVIEW hold for mandatory lifecycle review without weakening DENY/BLOCK.
 * Preserves pack contributions / reason codes from the PDP result when present.
 * Prefer REQUIRE_APPROVAL when the PDP already returned it (explicit approval semantics).
 */
export function applyLifecycleReviewHold(
  decision: PolicyDecision,
  reasons: string[],
): PolicyDecision {
  const d = String(decision.decision).toUpperCase();
  if (d === 'DENY' || d === 'BLOCK' || d === 'BLOCK_OUTPUT') {
    return {
      ...decision,
      reason_codes: [...reasons, ...(decision.reason_codes ?? [])],
    };
  }
  if (d === 'REQUIRE_APPROVAL') {
    return {
      ...decision,
      decision: 'REQUIRE_APPROVAL',
      reason_codes: [...reasons, ...(decision.reason_codes ?? [])],
      restrictions: {
        ...decision.restrictions,
        eligible_models: [],
      },
    };
  }
  return {
    ...decision,
    decision: 'REVIEW',
    reason_codes: [...reasons, ...(decision.reason_codes ?? [])],
    restrictions: {
      ...decision.restrictions,
      eligible_models: [],
    },
  };
}

async function persistLifecycleHold(
  policyRepo: PolicyRepository | undefined,
  decision: PolicyDecision,
  change: NormalizedChange,
  policyContext: EvaluateChangeOptions['policy_context'],
): Promise<void> {
  if (!policyRepo || !decision.evaluation_id || !policyRepo.getEvaluation) return;
  const existing = await Promise.resolve(
    policyRepo.getEvaluation(decision.evaluation_id),
  );
  if (!existing) return;

  const approvalHold = isApprovalHoldDecision(decision);
  const held_request =
    approvalHold && policyContext
      ? {
          version: 1 as const,
          application_id: policyContext.application.application_id,
          organization_id: policyContext.application.organization_id,
          user_id: policyContext.user.user_id,
          operation: policyContext.operation ?? 'lifecycle_change',
          model: policyContext.requestedModel ?? policyContext.application.allowed_models[0],
          messages: buildLifecycleReviewMessages(change),
          correlation_id: change.correlation_id ?? change.request_id ?? change.change_id,
          classification: {
            sensitivity: policyContext.sensitivity ?? 'INTERNAL',
            confidence: 0.9,
            risk: 'high' as const,
            reason_codes: [
              String(decision.decision).toUpperCase() === 'REQUIRE_APPROVAL'
                ? 'POLICY_REQUIRE_APPROVAL'
                : 'LIFECYCLE_MANDATORY_REVIEW',
              ...change.materiality_reasons,
            ],
          },
          allowed_models: [...policyContext.application.allowed_models],
          available_models: [
            ...(policyContext.availableModels ?? policyContext.application.allowed_models),
          ],
        }
      : existing.held_request;

  const change_review = buildLifecycleChangeInventory(change);

  // Prefer evidence.requester_prompt (caller or synthesized) in review_context
  // so reloads always have a prompt even if held_request is missing.
  const review_context = {
    ...(change.review_context ?? {}),
    ...(change_review.evidence.requester_prompt
      ? { requester_prompt: change_review.evidence.requester_prompt }
      : {}),
  };

  if (!policyRepo.recordEvaluation) return;
  await Promise.resolve(
    policyRepo.recordEvaluation({
      ...existing,
      decision: decision.decision,
      reason_codes: decision.reason_codes,
      evidence_in: {
        ...existing.evidence_in,
        lifecycle_hold: true,
        change_id: change.change_id,
        materiality: change.materiality,
        lifecycle_decision: change.lifecycle_decision,
        governance_impacts: change.governance_impacts,
        decision_reason_codes: decision.reason_codes,
        proposed_state: change.proposed_state,
        previous_state: change.previous_state,
        change_types: change.change_types,
        target_type: change.target_type,
        target_id: change.target_id,
        ...(change.previous_baseline_id
          ? { previous_baseline_id: change.previous_baseline_id }
          : {}),
        ...(change.actor ? { actor: change.actor } : {}),
        ...(change.source ? { source: change.source } : {}),
        materiality_reasons: change.materiality_reasons,
        authorization_mode: 'HUMAN_AUTHORIZATION',
        review_context,
        change_review,
      },
      held_request,
    }),
  );

  // Dedicated held_request write (covers older schemas / async race on insert).
  if (
    held_request &&
    approvalHold &&
    typeof policyRepo.attachHeldRequest === 'function'
  ) {
    await Promise.resolve(
      policyRepo.attachHeldRequest(decision.evaluation_id, held_request),
    );
  }
}

/** Structured change line for human Authorize / Deny. */
export type ChangeReviewAction = 'added' | 'removed' | 'updated' | 'modified';

export interface ChangeReviewItem {
  action: ChangeReviewAction;
  kind: string;
  /** Stable identifier the reviewer can cite (e.g. capability:write_capability, tool:update_clinical_notes). */
  id: string;
  label: string;
  before?: string;
  after?: string;
}

export interface ChangeReviewPreview {
  change_id: string;
  request_id?: string;
  correlation_id?: string;
  target_type: string;
  target_id: string;
  previous_baseline_id?: string;
  actor?: string;
  source?: string;
  materiality: string;
  lifecycle_decision: string;
  change_types: string[];
  governance_impacts: string[];
  materiality_reasons: string[];
  items: ChangeReviewItem[];
  /** Plain-language evidence for Authorize / Deny. */
  evidence: ChangeReviewEvidence;
}

/** Reviewer-facing narrative (prompt, rationale, consequences). */
export interface ChangeReviewEvidence {
  title: string;
  summary: string;
  requester_prompt?: string;
  rationale?: string;
  intended_outcome?: string;
  if_authorized: string;
  if_denied: string;
  conversation?: Array<{ role: string; content: string }>;
}

function clipText(value: string | undefined, max = 4000): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function sanitizeConversation(
  rows: ChangeReviewContext['conversation'] | undefined,
): Array<{ role: string; content: string }> | undefined {
  if (!Array.isArray(rows) || rows.length === 0) return undefined;
  const out: Array<{ role: string; content: string }> = [];
  for (const row of rows.slice(0, 20)) {
    if (!row || typeof row !== 'object') continue;
    const content = clipText(String(row.content ?? ''), 4000);
    if (!content) continue;
    out.push({
      role: String(row.role ?? 'user').trim() || 'user',
      content,
    });
  }
  return out.length > 0 ? out : undefined;
}

function synthesizeIfAuthorized(items: ChangeReviewItem[]): string {
  if (items.length === 0) {
    return 'If Authorize is chosen, the proposed capability/configuration change is accepted and a new governance baseline may be committed.';
  }
  const lines = items.map((item) => {
    if (item.action === 'added') {
      return `• Add ${item.label} (${item.id})${item.after ? `: ${item.after}` : ''}`;
    }
    if (item.action === 'removed') {
      return `• Remove ${item.label} (${item.id})${item.before ? `: was ${item.before}` : ''}`;
    }
    return `• Change ${item.label} (${item.id}): ${item.before ?? '—'} → ${item.after ?? '—'}`;
  });
  return ['If Authorize is chosen, Enigma will allow this change:', ...lines].join(
    '\n',
  );
}

function synthesizeIfDenied(): string {
  return 'If Deny is chosen, the current baseline remains in force. Write capability stays disabled and write tools stay unavailable until a new approved change.';
}

/** Build plain-language evidence a reviewer can use to Authorize or Deny. */
export function buildChangeReviewEvidence(
  change: NormalizedChange,
  items: ChangeReviewItem[],
): ChangeReviewEvidence {
  const ctx = change.review_context;
  const title =
    clipText(ctx?.title) ??
    `Request to change ${change.target_type} “${change.target_id}”`;
  // requester_prompt = what the end user asked the agent to do (business ask).
  // Never invent write-capability / inventory text as a stand-in.
  const prompt = clipText(ctx?.requester_prompt);
  const defaultSummary = [
    `A ${change.materiality.toLowerCase()} governance change was submitted for ${change.target_type}/${change.target_id}.`,
    change.change_types.length
      ? `Detected change types: ${change.change_types.join(', ')}.`
      : null,
    `Lifecycle requires ${change.lifecycle_decision.replace(/_/g, ' ').toLowerCase()}.`,
  ]
    .filter(Boolean)
    .join(' ');

  const evidence: ChangeReviewEvidence = {
    title,
    summary: clipText(ctx?.summary) ?? defaultSummary,
    if_authorized: synthesizeIfAuthorized(items),
    if_denied: synthesizeIfDenied(),
  };
  if (prompt) evidence.requester_prompt = prompt;
  const rationale = clipText(ctx?.rationale ?? ctx?.agent_rationale);
  if (rationale) evidence.rationale = rationale;
  const intended = clipText(ctx?.intended_outcome);
  if (intended) evidence.intended_outcome = intended;
  const conversation = sanitizeConversation(ctx?.conversation);
  if (conversation) evidence.conversation = conversation;
  return evidence;
}

function capsFromState(state: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!state) return {};
  const nested = (state.capabilities as Record<string, unknown> | undefined) ?? {};
  return { ...nested, ...state };
}

/** True when proposed_state (or nested capabilities) explicitly mentions a key. */
function proposedTouches(
  proposed: Record<string, unknown> | undefined,
  key: string,
): boolean {
  if (!proposed) return false;
  if (key in proposed) return true;
  const caps = proposed.capabilities;
  return (
    !!caps &&
    typeof caps === 'object' &&
    key in (caps as Record<string, unknown>)
  );
}

function toolMap(value: unknown): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  if (!Array.isArray(value)) return map;
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const id = row.id != null ? String(row.id) : '';
    if (!id) continue;
    map.set(id, row);
  }
  return map;
}

function displayTool(row: Record<string, unknown> | undefined): string {
  if (!row) return '—';
  const parts = [`id=${String(row.id)}`];
  if (typeof row.write === 'boolean') parts.push(`write=${row.write}`);
  if (row.permission != null && String(row.permission)) {
    parts.push(`permission=${String(row.permission)}`);
  }
  return parts.join(', ');
}

/** Build reviewer-facing inventory of what changed (with stable IDs). */
export function buildLifecycleChangeInventory(
  change: NormalizedChange,
): ChangeReviewPreview {
  const prev = capsFromState(change.previous_state);
  const next = capsFromState(change.proposed_state);
  const items: ChangeReviewItem[] = [];

  const proposed = change.proposed_state;

  if (proposedTouches(proposed, 'write_capability')) {
    const writeBefore = prev.write_capability === true;
    const writeAfter = next.write_capability === true;
    if (writeBefore !== writeAfter) {
      items.push({
        action: 'updated',
        kind: 'capability',
        id: 'capability:write_capability',
        label: 'Write capability',
        before: String(writeBefore),
        after: String(writeAfter),
      });
    }
  }

  if (proposedTouches(proposed, 'autonomy_level')) {
    const autonomyBefore =
      prev.autonomy_level != null ? String(prev.autonomy_level) : undefined;
    const autonomyAfter =
      next.autonomy_level != null ? String(next.autonomy_level) : undefined;
    if (autonomyBefore !== autonomyAfter) {
      items.push({
        action:
          autonomyBefore == null
            ? 'added'
            : autonomyAfter == null
              ? 'removed'
              : 'updated',
        kind: 'capability',
        id: 'capability:autonomy_level',
        label: 'Autonomy level',
        before: autonomyBefore ?? '—',
        after: autonomyAfter ?? '—',
      });
    }
  }

  for (const field of [
    ['model_id', 'Model ID'],
    ['model_version', 'Model version'],
    ['model_provider', 'Model provider'],
    ['processing_location', 'Processing location'],
    ['deployment_context', 'Deployment context'],
    ['system_prompt_hash', 'System prompt'],
    ['agent_instruction_hash', 'Agent instruction'],
  ] as const) {
    const [key, label] = field;
    if (!proposedTouches(proposed, key)) continue;
    const before = prev[key] != null ? String(prev[key]) : undefined;
    const after = next[key] != null ? String(next[key]) : undefined;
    if (before === after) continue;
    items.push({
      action: before == null ? 'added' : after == null ? 'removed' : 'updated',
      kind: 'configuration',
      id: `config:${key}`,
      label,
      before: before ?? '—',
      after: after ?? '—',
    });
  }

  const prevTools = toolMap(prev.tools);
  const nextTools = toolMap(next.tools);
  if (proposedTouches(proposed, 'tools')) {
    for (const [id, afterRow] of nextTools) {
      const beforeRow = prevTools.get(id);
      if (!beforeRow) {
        items.push({
          action: 'added',
          kind: 'tool',
          id: `tool:${id}`,
          label: `Tool ${id}`,
          after: displayTool(afterRow),
        });
        continue;
      }
      const beforeWrite = beforeRow.write === true;
      const afterWrite = afterRow.write === true;
      const beforePerm =
        beforeRow.permission != null ? String(beforeRow.permission) : '';
      const afterPerm =
        afterRow.permission != null ? String(afterRow.permission) : '';
      if (beforeWrite !== afterWrite || beforePerm !== afterPerm) {
        items.push({
          action: 'modified',
          kind: 'tool',
          id: `tool:${id}`,
          label: `Tool ${id}`,
          before: displayTool(beforeRow),
          after: displayTool(afterRow),
        });
      }
    }
    for (const [id, beforeRow] of prevTools) {
      if (nextTools.has(id)) continue;
      items.push({
        action: 'removed',
        kind: 'tool',
        id: `tool:${id}`,
        label: `Tool ${id}`,
        before: displayTool(beforeRow),
      });
    }
  }

  const prevSources = new Set(
    Array.isArray(prev.data_sources) ? prev.data_sources.map(String) : [],
  );
  const nextSources = new Set(
    Array.isArray(next.data_sources) ? next.data_sources.map(String) : [],
  );
  if (proposedTouches(proposed, 'data_sources')) {
    for (const id of nextSources) {
      if (prevSources.has(id)) continue;
      items.push({
        action: 'added',
        kind: 'data_source',
        id: `data_source:${id}`,
        label: `Data source ${id}`,
        after: id,
      });
    }
    for (const id of prevSources) {
      if (nextSources.has(id)) continue;
      items.push({
        action: 'removed',
        kind: 'data_source',
        id: `data_source:${id}`,
        label: `Data source ${id}`,
        before: id,
      });
    }
  }

  const prevLabel =
    change.previous_state?.ui_label != null
      ? String(change.previous_state.ui_label)
      : change.previous_state?.configuration &&
          typeof change.previous_state.configuration === 'object' &&
          (change.previous_state.configuration as Record<string, unknown>)
            .ui_label != null
        ? String(
            (change.previous_state.configuration as Record<string, unknown>)
              .ui_label,
          )
        : undefined;
  const nextLabel =
    change.proposed_state?.ui_label != null
      ? String(change.proposed_state.ui_label)
      : change.proposed_state?.configuration &&
          typeof change.proposed_state.configuration === 'object' &&
          (change.proposed_state.configuration as Record<string, unknown>)
            .ui_label != null
        ? String(
            (change.proposed_state.configuration as Record<string, unknown>)
              .ui_label,
          )
        : undefined;
  if (
    (proposedTouches(proposed, 'ui_label') ||
      (proposed?.configuration &&
        typeof proposed.configuration === 'object' &&
        'ui_label' in (proposed.configuration as Record<string, unknown>))) &&
    prevLabel !== nextLabel
  ) {
    items.push({
      action:
        prevLabel == null ? 'added' : nextLabel == null ? 'removed' : 'updated',
      kind: 'configuration',
      id: 'config:ui_label',
      label: 'UI label',
      before: prevLabel ?? '—',
      after: nextLabel ?? '—',
    });
  }

  return {
    change_id: change.change_id,
    ...(change.request_id ? { request_id: change.request_id } : {}),
    ...(change.correlation_id ? { correlation_id: change.correlation_id } : {}),
    target_type: change.target_type,
    target_id: change.target_id,
    ...(change.previous_baseline_id
      ? { previous_baseline_id: change.previous_baseline_id }
      : {}),
    ...(change.actor ? { actor: change.actor } : {}),
    ...(change.source ? { source: change.source } : {}),
    materiality: change.materiality,
    lifecycle_decision: change.lifecycle_decision,
    change_types: [...change.change_types],
    governance_impacts: [...change.governance_impacts],
    materiality_reasons: [...change.materiality_reasons],
    items,
    evidence: buildChangeReviewEvidence(change, items),
  };
}

/** Human-readable held messages for Request Review on lifecycle holds. */
export function buildLifecycleReviewMessages(
  change: NormalizedChange,
): Array<{ role: string; content: string }> {
  const inventory = buildLifecycleChangeInventory(change);
  const evidence = inventory.evidence;
  const messages: Array<{ role: string; content: string }> = [];

  if (evidence.conversation?.length) {
    for (const turn of evidence.conversation) {
      messages.push({ role: turn.role, content: turn.content });
    }
  }
  // Always retain a user prompt message for Authorize/Deny (caller or synthesized).
  const hasUser = messages.some((m) => m.role.toLowerCase() === 'user');
  if (!hasUser && evidence.requester_prompt) {
    messages.push({ role: 'user', content: evidence.requester_prompt });
  }

  const decisionBrief = [
    evidence.title,
    '',
    evidence.summary,
    evidence.requester_prompt
      ? `\nRequester prompt:\n${evidence.requester_prompt}`
      : null,
    evidence.rationale ? `\nRationale:\n${evidence.rationale}` : null,
    evidence.intended_outcome
      ? `\nIntended outcome:\n${evidence.intended_outcome}`
      : null,
    `\n${evidence.if_authorized}`,
    `\n${evidence.if_denied}`,
    '',
    `Change ID: ${inventory.change_id}`,
    inventory.request_id ? `Request ID: ${inventory.request_id}` : null,
    `Target: ${inventory.target_type} / ${inventory.target_id}`,
    `Materiality: ${inventory.materiality}`,
    `Lifecycle decision: ${inventory.lifecycle_decision}`,
  ]
    .filter((line) => line != null)
    .join('\n');

  messages.push({ role: 'system', content: decisionBrief });

  if (inventory.items.length > 0) {
    const lines = inventory.items.map((item) => {
      const delta =
        item.before != null || item.after != null
          ? ` | ${item.before ?? '—'} → ${item.after ?? '—'}`
          : '';
      return `${item.action.toUpperCase()} [${item.kind}] ${item.id} — ${item.label}${delta}`;
    });
    messages.push({
      role: 'assistant',
      content: ['Technical change inventory:', ...lines].join('\n'),
    });
  }

  return messages;
}

/**
 * Evaluate a governance change: normalize → materiality → optional PDP → baseline.
 */
export async function evaluateGovernanceChange(
  opts: EvaluateChangeOptions,
): Promise<ChangeEvaluationResult> {
  const { repository, input } = opts;
  const change_id = newId('chg');
  const detected_at = input.detected_at ?? new Date().toISOString();
  const request_id = input.request_id ?? newId('req');
  const correlation_id = input.correlation_id ?? request_id;

  const previous = input.previous_baseline_id
    ? repository.getBaseline(input.previous_baseline_id)
    : repository.latestBaseline(input.target_type, input.target_id);

  const previous_state =
    input.previous_state ?? (previous ? baselineToState(previous) : undefined);
  const proposed_state = input.proposed_state;

  const assessment = assessMateriality({
    ...input,
    previous_state,
    proposed_state,
  });

  const change: NormalizedChange = {
    change_id,
    target_type: input.target_type,
    target_id: input.target_id,
    previous_baseline_id: previous?.baseline_id,
    previous_state: structuredClone(previous_state ?? {}),
    proposed_state: structuredClone(proposed_state ?? {}),
    change_types: assessment.change_types,
    source: input.source ?? 'api',
    detected_at,
    actor: input.actor,
    correlation_id,
    request_id,
    materiality: assessment.materiality,
    lifecycle_decision: assessment.lifecycle_decision,
    governance_impacts: assessment.governance_impacts,
    materiality_reasons: assessment.materiality_reasons,
    ...(input.review_context
      ? { review_context: structuredClone(input.review_context) }
      : {}),
  };

  let policy_decision: PolicyDecision | undefined;
  let pdp_invoked = false;
  let next_baseline: GovernanceBaseline | undefined;

  const needsPdp =
    assessment.lifecycle_decision === 'REEVALUATION_REQUIRED' ||
    assessment.lifecycle_decision === 'MANDATORY_REVIEW' ||
    assessment.lifecycle_decision === 'UNKNOWN';

  if (needsPdp) {
    if (!opts.pdp || !opts.policy_context) {
      change.materiality =
        change.materiality === 'NON_MATERIAL' ? 'UNKNOWN' : change.materiality;
      change.lifecycle_decision = 'UNKNOWN';
      change.materiality_reasons = [
        ...change.materiality_reasons,
        'LIFECYCLE_PDP_UNAVAILABLE',
      ];
    } else {
      pdp_invoked = true;
      const ctx = buildPolicyContext(opts, change);
      policy_decision = await opts.pdp.evaluateLegacyRequest(ctx);

      // Lifecycle MANDATORY_REVIEW / UNKNOWN / CRITICAL still force a hold.
      // MATERIAL write (and other re-eval paths) keep the PDP decision: ALLOW
      // executes automatically; REVIEW / REQUIRE_APPROVAL enter human review.
      if (lifecycleToPolicyHold(change.materiality, change.lifecycle_decision)) {
        policy_decision = applyLifecycleReviewHold(policy_decision, [
          'LIFECYCLE_MANDATORY_REVIEW',
          ...change.materiality_reasons,
        ]);
      }

      if (isApprovalHoldDecision(policy_decision)) {
        await persistLifecycleHold(
          opts.policy_repository,
          policy_decision,
          change,
          opts.policy_context,
        );
      } else if (
        opts.policy_repository &&
        policy_decision.evaluation_id &&
        opts.policy_repository.getEvaluation &&
        opts.policy_repository.recordEvaluation
      ) {
        // Automatic authorization evidence — do not create a human-review queue item.
        const existing = await Promise.resolve(
          opts.policy_repository.getEvaluation(policy_decision.evaluation_id),
        );
        if (existing) {
          await Promise.resolve(
            opts.policy_repository.recordEvaluation({
              ...existing,
              decision: policy_decision.decision,
              reason_codes: policy_decision.reason_codes,
              evidence_in: {
                ...existing.evidence_in,
                change_id: change.change_id,
                materiality: change.materiality,
                lifecycle_decision: change.lifecycle_decision,
                governance_impacts: change.governance_impacts,
                change_types: change.change_types,
                target_type: change.target_type,
                target_id: change.target_id,
                authorization_mode: 'AUTOMATICALLY_AUTHORIZED',
                lifecycle_hold: false,
              },
            }),
          );
        }
      }
    }
  }

  const decisionCode = String(policy_decision?.decision ?? '').toUpperCase();
  const held = [
    'REVIEW',
    'REQUIRE_APPROVAL',
    'DENY',
    'BLOCK',
    'BLOCK_OUTPUT',
  ].includes(decisionCode);

  const shouldCommitBaseline =
    !!proposed_state &&
    (assessment.lifecycle_decision === 'NO_REEVALUATION' ||
      opts.commit_baseline_on_hold === true ||
      (policy_decision && !held));

  if (previous && proposed_state && shouldCommitBaseline) {
    next_baseline = nextBaselineFromChange({
      previous,
      proposed_state,
      change_id,
      created_at: detected_at,
    });
    repository.saveBaseline(next_baseline);
    change.next_baseline_id = next_baseline.baseline_id;
  } else if (
    !previous &&
    proposed_state &&
    assessment.lifecycle_decision === 'NO_REEVALUATION'
  ) {
    next_baseline = createGovernanceBaseline({
      target_type: input.target_type,
      target_id: input.target_id,
      capabilities:
        (proposed_state.capabilities as GovernanceBaseline['capabilities']) ?? {},
      configuration: (proposed_state.configuration as Record<string, unknown>) ?? {
        ...(proposed_state.ui_label !== undefined
          ? { ui_label: proposed_state.ui_label }
          : {}),
      },
      change_id,
      created_at: detected_at,
    });
    repository.saveBaseline(next_baseline);
    change.next_baseline_id = next_baseline.baseline_id;
  }

  if (policy_decision?.evaluation_id) {
    change.evaluation_id = policy_decision.evaluation_id;
  }

  repository.saveChange(change);

  return {
    change,
    previous_baseline: previous,
    next_baseline,
    materiality: change.materiality,
    lifecycle_decision: change.lifecycle_decision,
    governance_impacts: change.governance_impacts,
    materiality_reasons: change.materiality_reasons,
    policy_decision,
    evaluation_id: change.evaluation_id,
    pdp_invoked,
  };
}
