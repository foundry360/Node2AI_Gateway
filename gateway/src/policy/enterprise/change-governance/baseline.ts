/**
 * Immutable governance baselines — new state creates a new version.
 */

import { randomUUID } from 'node:crypto';
import type {
  GovernanceBaseline,
  GovernanceBaselineCapabilities,
  GovernanceBaselineTargetType,
} from './types.js';
import type { GovernanceContext } from '../../types.js';

export interface CreateBaselineInput {
  target_type: GovernanceBaselineTargetType;
  target_id: string;
  organization_id?: string;
  components?: Record<string, unknown>;
  configuration?: Record<string, unknown>;
  capabilities?: GovernanceBaselineCapabilities;
  governance_context?: GovernanceContext;
  applicable_authorities?: string[];
  created_at?: string;
  version?: number;
  supersedes_baseline_id?: string;
  change_id?: string;
  baseline_id?: string;
}

export function createGovernanceBaseline(input: CreateBaselineInput): GovernanceBaseline {
  return {
    baseline_id: input.baseline_id ?? `gbl_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
    version: input.version ?? 1,
    target_type: input.target_type,
    target_id: input.target_id,
    organization_id: input.organization_id,
    components: structuredClone(input.components ?? {}),
    configuration: structuredClone(input.configuration ?? {}),
    capabilities: structuredClone(input.capabilities ?? {}),
    governance_context: input.governance_context
      ? structuredClone(input.governance_context)
      : undefined,
    applicable_authorities: input.applicable_authorities
      ? [...input.applicable_authorities]
      : undefined,
    created_at: input.created_at ?? new Date().toISOString(),
    supersedes_baseline_id: input.supersedes_baseline_id,
    change_id: input.change_id,
  };
}

/** Derive next baseline from previous + proposed state capabilities/config. */
export function nextBaselineFromChange(opts: {
  previous: GovernanceBaseline;
  proposed_state: Record<string, unknown>;
  change_id: string;
  created_at?: string;
}): GovernanceBaseline {
  const proposedCaps =
    (opts.proposed_state.capabilities as GovernanceBaselineCapabilities | undefined) ??
    {};
  const mergedCaps: GovernanceBaselineCapabilities = {
    ...structuredClone(opts.previous.capabilities),
    ...structuredClone(proposedCaps),
  };
  // Allow top-level proposed fields to overlay capabilities
  for (const key of [
    'write_capability',
    'autonomy_level',
    'tools',
    'data_sources',
    'knowledge_sources',
    'model_id',
    'model_version',
    'model_provider',
    'processing_location',
    'system_prompt_hash',
    'agent_instruction_hash',
    'deployment_context',
  ] as const) {
    if (opts.proposed_state[key] !== undefined) {
      (mergedCaps as Record<string, unknown>)[key] = structuredClone(
        opts.proposed_state[key],
      );
    }
  }

  return createGovernanceBaseline({
    target_type: opts.previous.target_type,
    target_id: opts.previous.target_id,
    organization_id: opts.previous.organization_id,
    components: {
      ...opts.previous.components,
      ...((opts.proposed_state.components as Record<string, unknown>) ?? {}),
    },
    configuration: {
      ...opts.previous.configuration,
      ...((opts.proposed_state.configuration as Record<string, unknown>) ?? {}),
      ...(opts.proposed_state.ui_label !== undefined
        ? { ui_label: opts.proposed_state.ui_label }
        : {}),
    },
    capabilities: mergedCaps,
    governance_context:
      (opts.proposed_state.governance_context as GovernanceContext | undefined) ??
      opts.previous.governance_context,
    applicable_authorities:
      (opts.proposed_state.applicable_authorities as string[] | undefined) ??
      opts.previous.applicable_authorities,
    version: opts.previous.version + 1,
    supersedes_baseline_id: opts.previous.baseline_id,
    change_id: opts.change_id,
    created_at: opts.created_at,
  });
}
