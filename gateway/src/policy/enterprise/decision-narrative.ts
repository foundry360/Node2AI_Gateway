/**
 * Product 1.0 — Deterministic Decision narrative for operator UX.
 * Built only from persisted evaluation / integrity facts. No LLM.
 */

import type { PolicyEvaluationRecord } from './evaluation-record.js';
import type { EnforcementIntegrity } from './enforcement-integrity.js';
import { reviewStateForRecord } from './decision-resolution.js';

export type DecisionNarrativeStatus = {
  decision: string;
  final_decision: string;
  enforcement: string;
  review: string;
  outcome: string;
};

export type DecisionNarrative = {
  /** One-line what happened. */
  headline: string;
  /** Deterministic why sentence(s). */
  reason: string;
  /** Compact status strip for the hero. */
  status: DecisionNarrativeStatus;
  actors: {
    application_id?: string | null;
    user_id?: string | null;
    agent_id?: string | null;
    agent_name?: string | null;
    tool_id?: string | null;
    tool_name?: string | null;
  };
  action: {
    operation?: string | null;
    category?: string | null;
    kind?: string | null;
    target_id?: string | null;
    field?: string | null;
    write_class?: string | null;
    purpose?: string | null;
    authorization?: string | null;
  };
  policy: {
    pack_ids: string[];
    policy_ids: string[];
    primary_rule_ids: string[];
    basis?: string | null;
  };
};

function str(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t || null;
}

function labelId(id: string | null | undefined, name?: string | null): string {
  if (name && id) return `${name} (${id})`;
  if (name) return name;
  if (id) return id;
  return 'unknown';
}

function decisionWord(d: string): string {
  const u = d.toUpperCase();
  if (u === 'ALLOW') return 'allowed';
  if (u === 'ALLOW_WITH_CONTROLS' || u === 'TOKENIZE' || u === 'REDACT' || u === 'TRANSFORM') {
    return 'allowed with controls';
  }
  if (u === 'REVIEW' || u === 'REQUIRE_APPROVAL') return 'held for review';
  if (u === 'DENY' || u === 'BLOCK' || u === 'BLOCK_OUTPUT') return 'denied';
  return d.toLowerCase() || 'recorded';
}

/**
 * Build a deterministic narrative from the authoritative evaluation snapshot.
 */
export function buildDecisionNarrative(input: {
  record: PolicyEvaluationRecord;
  enforcementIntegrity?: EnforcementIntegrity | null;
  outcomeIntegrityStatus?: string | null;
}): DecisionNarrative {
  const record = input.record;
  const ai = (record.ai_context ?? {}) as Record<string, unknown>;
  const runtime = (ai.runtime_actor ?? null) as {
    agent?: {
      id?: string;
      name?: string | null;
      authorized?: boolean;
    } | null;
    tool?: {
      id?: string;
      name?: string | null;
      authorized?: boolean;
      operation?: string | null;
    } | null;
    substrate?: { reason_codes?: string[] };
  } | null;
  const ag = (ai.action_governance ?? null) as {
    category?: string;
    operation?: string;
    kind?: string | null;
    target_id?: string | null;
    attributes?: Record<string, unknown>;
    write_governance_class?: string | null;
  } | null;

  const subject = (record.subject ?? {}) as Record<string, unknown>;
  const context = (record.context ?? {}) as Record<string, unknown>;
  const applicationId =
    str(subject.application_id) ??
    str((context as { application_id?: string }).application_id);
  const userId = str(subject.user_id);
  const agentId = str(runtime?.agent?.id) ?? str(ai.agent_id) ?? str(subject.agent_id);
  const agentName = str(runtime?.agent?.name ?? null);
  const toolId = str(runtime?.tool?.id) ?? str(ai.tool_id);
  const toolName = str(runtime?.tool?.name ?? null);

  const operation =
    str(ag?.operation) ??
    str(runtime?.tool?.operation) ??
    str(record.action);
  const category = str(ag?.category);
  const kind = str(ag?.kind);
  const targetId = str(ag?.target_id);
  const field =
    typeof ag?.attributes?.field === 'string' ? ag.attributes.field : null;
  const writeClass = str(ag?.write_governance_class);
  const purpose = str(context.purpose);
  const authorization = str(
    (context as { authorization?: string }).authorization ??
      (context as { authorization_context?: string }).authorization_context,
  );

  const machine = String(record.decision ?? '').toUpperCase();
  const final = String(
    record.human_resolution?.final_decision ?? record.decision ?? '',
  ).toUpperCase();
  const reviewState = reviewStateForRecord(record);
  const boundary =
    input.enforcementIntegrity?.boundary_label ??
    input.enforcementIntegrity?.boundary ??
    'Unknown';
  const outcomeStatus = String(input.outcomeIntegrityStatus ?? 'NOT_APPLICABLE');

  const actorBits: string[] = [];
  if (agentId) actorBits.push(`Agent ${labelId(agentId, agentName)}`);
  else if (applicationId) actorBits.push(`Application ${applicationId}`);
  if (toolId) actorBits.push(`Tool ${labelId(toolId, toolName)}`);
  if (userId && !agentId) actorBits.push(`User ${userId}`);

  const actionBits: string[] = [];
  if (kind) actionBits.push(kind.replace(/_/g, ' '));
  else if (operation) actionBits.push(String(operation).replace(/_/g, ' '));
  else if (category) actionBits.push(category.toLowerCase());
  else actionBits.push('an AI attempt');
  if (field) actionBits.push(`on field ${field}`);
  if (targetId) actionBits.push(`for target ${targetId}`);

  const who =
    actorBits.length > 0 ? actorBits.join(' using ') : 'An AI caller';
  const what = actionBits.join(' ');
  const headline = `${who} attempted ${what}. Enigma ${decisionWord(final)}.`;

  const packIds =
    record.explanation?.resolution?.contributing_pack_ids ??
    record.explanation?.operator?.contributing_pack_ids ??
    [];
  const policyIds = (record.applicable_policies ?? []).map((p) =>
    String((p as { policy_id?: string }).policy_id ?? ''),
  ).filter(Boolean);
  const primaryRules = (record.explanation?.provenance?.matched_rules ?? [])
    .map((r) => String((r as { rule_id?: string }).rule_id ?? ''))
    .filter(Boolean)
    .slice(0, 5);
  const basis =
    record.explanation?.operator?.basis_label ??
    record.explanation?.resolution?.basis ??
    record.explanation?.final_reason ??
    record.reason ??
    null;

  const reasonCodes = [
    ...(record.reason_codes ?? []),
    ...(runtime?.substrate?.reason_codes ?? []),
  ];

  let reason: string;
  if (machine === 'DENY' || final === 'DENY') {
    if (reasonCodes.some((c) => String(c).includes('AGENT_UNAUTHORIZED'))) {
      reason =
        'The action was denied because the requesting Agent was not authorized for this Application binding.';
    } else if (reasonCodes.some((c) => String(c).includes('TOOL_UNAUTHORIZED'))) {
      reason =
        'The action was denied because the Tool or operation was not authorized for the Agent.';
    } else if (reasonCodes.some((c) => String(c).includes('REGISTRY'))) {
      reason =
        'The action was denied because required authorization registry facts could not be established (fail closed).';
    } else if (basis) {
      reason = `The action was denied. ${basis}`;
    } else if (reasonCodes[0]) {
      reason = `The action was denied (${reasonCodes.slice(0, 3).join(', ')}).`;
    } else {
      reason = 'The action was denied by policy evaluation.';
    }
  } else if (reviewState === 'pending' || machine === 'REVIEW') {
    const base = basis
      ? `The action requires human review. ${basis}`
      : 'The action requires human review before commit may be authorized.';
    reason = `${base} The requesting end user is not the approver.`;
  } else if (reviewState === 'resolved') {
    const disp = record.human_resolution?.human_disposition ?? 'resolved';
    const by = record.human_resolution?.resolved_by;
    reason = by
      ? `Machine decision ${machine}; authorized approver ${by} recorded ${disp}. Final decision is ${final}.`
      : `Machine decision ${machine}; human resolution recorded ${disp}. Final decision is ${final}.`;
  } else if (
    machine === 'ALLOW' ||
    machine === 'ALLOW_WITH_CONTROLS' ||
    machine === 'TOKENIZE' ||
    machine === 'REDACT' ||
    machine === 'TRANSFORM'
  ) {
    if (input.enforcementIntegrity?.boundary === 'CLIENT_COMMIT_REQUIRED') {
      reason =
        'The action was allowed. Enigma authorized client commit; the integrating system performs the external side effect. Enigma did not execute external DML.';
    } else if (basis) {
      reason = `The action was allowed. ${basis}`;
    } else {
      reason =
        'The action was allowed because applicable policy conditions were satisfied for this request context.';
    }
  } else {
    reason = basis ?? record.reason ?? 'Decision recorded from policy evaluation.';
  }

  return {
    headline,
    reason,
    status: {
      decision: machine || '-',
      final_decision: final || machine || '-',
      enforcement: String(boundary),
      review:
        reviewState === 'pending'
          ? 'Pending'
          : reviewState === 'resolved'
            ? 'Resolved'
            : 'Not required',
      outcome:
        outcomeStatus === 'NOT_APPLICABLE'
          ? 'Not applicable'
          : outcomeStatus === 'NOT_REPORTED'
            ? 'Not reported'
            : outcomeStatus,
    },
    actors: {
      application_id: applicationId,
      user_id: userId,
      agent_id: agentId,
      agent_name: agentName,
      tool_id: toolId,
      tool_name: toolName,
    },
    action: {
      operation,
      category,
      kind,
      target_id: targetId,
      field,
      write_class: writeClass,
      purpose,
      authorization,
    },
    policy: {
      pack_ids: packIds,
      policy_ids: policyIds,
      primary_rule_ids: primaryRules,
      basis: basis ? String(basis) : null,
    },
  };
}
