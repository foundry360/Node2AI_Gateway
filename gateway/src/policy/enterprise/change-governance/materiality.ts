/**
 * Explainable materiality classification — governance impact, not a risk score.
 */

import type {
  ChangeInput,
  GovernanceBaselineCapabilities,
  GovernanceChangeType,
  GovernanceImpactDimension,
  MaterialityAssessment,
  MaterialityClass,
  LifecycleDecision,
} from './types.js';

const IMPACT_BY_CHANGE: Record<string, GovernanceImpactDimension[]> = {
  MODEL_VERSION: ['MODEL_GOVERNANCE', 'SAFETY', 'REGULATORY'],
  MODEL_PROVIDER: ['MODEL_GOVERNANCE', 'SECURITY', 'REGULATORY'],
  MODEL_CONFIGURATION: ['MODEL_GOVERNANCE', 'SAFETY'],
  SYSTEM_PROMPT: ['MODEL_GOVERNANCE', 'SAFETY', 'SECURITY'],
  AGENT_INSTRUCTION: ['MODEL_GOVERNANCE', 'SAFETY', 'HUMAN_OVERSIGHT'],
  TOOL_ADDED: ['SECURITY', 'AUTONOMY', 'EXTERNAL_ACTION'],
  TOOL_REMOVED: ['SECURITY', 'AUTONOMY'],
  TOOL_PERMISSION: ['ACCESS_CONTROL', 'SECURITY', 'AUTONOMY'],
  DATA_SOURCE_ADDED: ['PRIVACY', 'DATA_GOVERNANCE'],
  DATA_SOURCE_REMOVED: ['PRIVACY', 'DATA_GOVERNANCE'],
  DATA_SOURCE_CHANGED: ['PRIVACY', 'DATA_GOVERNANCE', 'SECURITY'],
  KNOWLEDGE_SOURCE: ['KNOWLEDGE', 'DATA_GOVERNANCE', 'PRIVACY'],
  RETRIEVAL_CONFIGURATION: ['KNOWLEDGE', 'SECURITY'],
  ACCESS_CHANGE: ['ACCESS_CONTROL', 'SECURITY'],
  WRITE_CAPABILITY: ['ACCESS_CONTROL', 'AUTONOMY', 'EXTERNAL_ACTION', 'SAFETY', 'SECURITY'],
  DEPLOYMENT_CONTEXT: ['SECURITY', 'REGULATORY'],
  PROCESSING_LOCATION: ['PRIVACY', 'REGULATORY', 'DATA_GOVERNANCE', 'PROCESSING_LOCATION'],
  GOVERNANCE_CONTEXT: ['REGULATORY', 'HUMAN_OVERSIGHT'],
  POLICY_CONFIGURATION: ['REGULATORY', 'MODEL_GOVERNANCE'],
  APPLICATION_CONFIGURATION: ['MODEL_GOVERNANCE'],
  AUTONOMY_LEVEL: ['AUTONOMY', 'HUMAN_OVERSIGHT', 'EXTERNAL_ACTION', 'SAFETY'],
  UI_LABEL: [],
};

const NON_MATERIAL = new Set<string>(['UI_LABEL']);

/**
 * Change types that are always CRITICAL / MANDATORY_REVIEW by themselves.
 * WRITE_CAPABILITY is intentionally excluded: write raises the importance of
 * policy evaluation but must not force human approval by materiality alone.
 * Autonomy escalation to AUTONOMOUS remains CRITICAL via autonomyEscalationCritical().
 */
const CRITICAL = new Set<string>([]);

function uniq<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function asCaps(state: Record<string, unknown> | undefined): GovernanceBaselineCapabilities {
  if (!state) return {};
  const caps = (state.capabilities as GovernanceBaselineCapabilities | undefined) ?? {};
  return {
    ...caps,
    write_capability:
      caps.write_capability === true || state.write_capability === true
        ? true
        : caps.write_capability,
    autonomy_level:
      caps.autonomy_level ??
      (state.autonomy_level as GovernanceBaselineCapabilities['autonomy_level']),
    tools: caps.tools ?? (state.tools as GovernanceBaselineCapabilities['tools']),
    data_sources:
      caps.data_sources ?? (state.data_sources as string[] | undefined),
    model_version: caps.model_version ?? (state.model_version as string | undefined),
    model_id: caps.model_id ?? (state.model_id as string | undefined),
    model_provider: caps.model_provider ?? (state.model_provider as string | undefined),
    processing_location:
      caps.processing_location ?? (state.processing_location as string | undefined),
    system_prompt_hash:
      caps.system_prompt_hash ?? (state.system_prompt_hash as string | undefined),
  };
}

/** Infer change types from previous → proposed capability/config delta. */
export function inferChangeTypes(
  previous_state?: Record<string, unknown>,
  proposed_state?: Record<string, unknown>,
): GovernanceChangeType[] {
  if (!previous_state || !proposed_state) return [];

  // Cosmetic-only delta: do not invent capability regressions from sparse proposed_state.
  const proposedKeys = Object.keys(proposed_state);
  if (
    proposedKeys.length > 0 &&
    proposedKeys.every((k) => k === 'ui_label' || k === 'configuration')
  ) {
    const prevLabel =
      previous_state.ui_label ??
      (previous_state.configuration as Record<string, unknown> | undefined)?.ui_label;
    const nextLabel =
      proposed_state.ui_label ??
      (proposed_state.configuration as Record<string, unknown> | undefined)?.ui_label;
    if (prevLabel !== nextLabel) return ['UI_LABEL'];
    return [];
  }

  const prev = asCaps(previous_state);
  const next = asCaps(proposed_state);
  const types: GovernanceChangeType[] = [];

  const modelTouched =
    'model_version' in proposed_state ||
    'model_id' in proposed_state ||
    'capabilities' in proposed_state;
  if (
    modelTouched &&
    ((prev.model_version ?? null) !== (next.model_version ?? null) ||
      (prev.model_id ?? null) !== (next.model_id ?? null))
  ) {
    types.push('MODEL_VERSION');
  }
  if (
    ('model_provider' in proposed_state || 'capabilities' in proposed_state) &&
    (prev.model_provider ?? null) !== (next.model_provider ?? null)
  ) {
    types.push('MODEL_PROVIDER');
  }
  if (
    ('system_prompt_hash' in proposed_state || 'capabilities' in proposed_state) &&
    (prev.system_prompt_hash ?? null) !== (next.system_prompt_hash ?? null)
  ) {
    types.push('SYSTEM_PROMPT');
  }
  if (
    ('agent_instruction_hash' in proposed_state || 'capabilities' in proposed_state) &&
    (prev.agent_instruction_hash ?? null) !== (next.agent_instruction_hash ?? null)
  ) {
    types.push('AGENT_INSTRUCTION');
  }
  if (
    ('processing_location' in proposed_state || 'capabilities' in proposed_state) &&
    (prev.processing_location ?? null) !== (next.processing_location ?? null)
  ) {
    types.push('PROCESSING_LOCATION');
  }
  if (
    ('deployment_context' in proposed_state || 'capabilities' in proposed_state) &&
    (prev.deployment_context ?? null) !== (next.deployment_context ?? null)
  ) {
    types.push('DEPLOYMENT_CONTEXT');
  }
  if (
    ('write_capability' in proposed_state || 'capabilities' in proposed_state) &&
    !!prev.write_capability !== !!next.write_capability &&
    next.write_capability
  ) {
    types.push('WRITE_CAPABILITY');
  }
  if (
    ('autonomy_level' in proposed_state || 'capabilities' in proposed_state) &&
    (prev.autonomy_level ?? 'ASSISTIVE') !== (next.autonomy_level ?? 'ASSISTIVE')
  ) {
    types.push('AUTONOMY_LEVEL');
  }

  if ('tools' in proposed_state || 'capabilities' in proposed_state) {
    const prevTools = new Map((prev.tools ?? []).map((t) => [t.id, t]));
    const nextTools = next.tools ?? [];
    for (const t of nextTools) {
      const before = prevTools.get(t.id);
      if (!before) {
        types.push('TOOL_ADDED');
        if (t.write) types.push('WRITE_CAPABILITY');
      } else if (
        before.write !== t.write ||
        (before.permission ?? '') !== (t.permission ?? '')
      ) {
        types.push('TOOL_PERMISSION');
        if (t.write && !before.write) types.push('WRITE_CAPABILITY');
      }
    }
    for (const id of prevTools.keys()) {
      if (!nextTools.some((t) => t.id === id)) types.push('TOOL_REMOVED');
    }
  }

  if ('data_sources' in proposed_state || 'capabilities' in proposed_state) {
    const prevSources = new Set(prev.data_sources ?? []);
    const nextSources = new Set(next.data_sources ?? []);
    for (const s of nextSources) {
      if (!prevSources.has(s)) types.push('DATA_SOURCE_ADDED');
    }
    for (const s of prevSources) {
      if (!nextSources.has(s)) types.push('DATA_SOURCE_REMOVED');
    }
  }

  if (previous_state.ui_label !== undefined || proposed_state.ui_label !== undefined) {
    if (previous_state.ui_label !== proposed_state.ui_label && types.length === 0) {
      types.push('UI_LABEL');
    }
  }

  return uniq(types);
}

function autonomyEscalationCritical(
  previous_state?: Record<string, unknown>,
  proposed_state?: Record<string, unknown>,
): boolean {
  const prev = asCaps(previous_state).autonomy_level ?? 'ASSISTIVE';
  const next = asCaps(proposed_state).autonomy_level ?? 'ASSISTIVE';
  const rank = { ASSISTIVE: 0, HUMAN_APPROVED: 1, AUTONOMOUS: 2 } as const;
  return rank[next] > rank[prev] && next === 'AUTONOMOUS';
}

/**
 * Classify materiality from change types + state.
 * UNKNOWN when incomplete / insufficient information — never silently NON_MATERIAL.
 */
export function assessMateriality(input: ChangeInput): MaterialityAssessment {
  if (input.incomplete === true) {
    return {
      materiality: 'UNKNOWN',
      lifecycle_decision: 'UNKNOWN',
      governance_impacts: [],
      materiality_reasons: ['LIFECYCLE_INSUFFICIENT_CHANGE_INFORMATION'],
      change_types: input.change_types ?? [],
    };
  }

  const inferred = inferChangeTypes(input.previous_state, input.proposed_state);
  const change_types = uniq([...(input.change_types ?? []), ...inferred]);

  if (change_types.length === 0) {
    if (!input.previous_state || !input.proposed_state) {
      return {
        materiality: 'UNKNOWN',
        lifecycle_decision: 'UNKNOWN',
        governance_impacts: [],
        materiality_reasons: ['LIFECYCLE_MISSING_STATE_FOR_MATERIALITY'],
        change_types: [],
      };
    }
    return {
      materiality: 'NON_MATERIAL',
      lifecycle_decision: 'NO_REEVALUATION',
      governance_impacts: [],
      materiality_reasons: ['LIFECYCLE_NO_GOVERNANCE_DELTA'],
      change_types: [],
    };
  }

  const impacts = uniq(
    change_types.flatMap((t) => IMPACT_BY_CHANGE[t] ?? ['MODEL_GOVERNANCE']),
  );
  const reasons: string[] = change_types.map((t) => `LIFECYCLE_CHANGE_TYPE:${t}`);

  const onlyNonMaterial = change_types.every((t) => NON_MATERIAL.has(t));
  if (onlyNonMaterial) {
    return {
      materiality: 'NON_MATERIAL',
      lifecycle_decision: 'NO_REEVALUATION',
      governance_impacts: [],
      materiality_reasons: [...reasons, 'LIFECYCLE_NON_MATERIAL_UI_OR_COSMETIC'],
      change_types,
    };
  }

  if (change_types.includes('WRITE_CAPABILITY')) {
    reasons.push('LIFECYCLE_WRITE_CAPABILITY_INTRODUCED');
  }

  const critical =
    change_types.some((t) => CRITICAL.has(t)) ||
    autonomyEscalationCritical(input.previous_state, input.proposed_state);

  if (critical) {
    if (autonomyEscalationCritical(input.previous_state, input.proposed_state)) {
      reasons.push('LIFECYCLE_AUTONOMY_ESCALATION_TO_AUTONOMOUS');
    }
    return {
      materiality: 'CRITICAL',
      lifecycle_decision: 'MANDATORY_REVIEW',
      governance_impacts: impacts,
      materiality_reasons: [...reasons, 'LIFECYCLE_CRITICAL_GOVERNANCE_BOUNDARY'],
      change_types,
    };
  }

  return {
    materiality: 'MATERIAL',
    lifecycle_decision: 'REEVALUATION_REQUIRED',
    governance_impacts: impacts,
    materiality_reasons: [...reasons, 'LIFECYCLE_MATERIAL_GOVERNANCE_IMPACT'],
    change_types,
  };
}

export function lifecycleToPolicyHold(
  materiality: MaterialityClass,
  lifecycle: LifecycleDecision,
): boolean {
  return (
    lifecycle === 'MANDATORY_REVIEW' ||
    lifecycle === 'UNKNOWN' ||
    materiality === 'CRITICAL' ||
    materiality === 'UNKNOWN'
  );
}
