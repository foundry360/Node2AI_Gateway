import type { PolicyEvaluationRecord } from '../evaluation-record.js';
import type { InMemoryChangeGovernanceRepository } from './repository.js';
import { nextBaselineFromChange } from './baseline.js';
import type {
  GovernanceBaseline,
  GovernanceBaselineTargetType,
} from './types.js';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** True when this evaluation is a governance lifecycle hold (not a runtime AI request). */
export function isLifecycleHoldEvaluation(
  record: PolicyEvaluationRecord,
): boolean {
  const evidence = asRecord(record.evidence_in);
  if (evidence?.lifecycle_hold === true) return true;
  if (asRecord(evidence?.change_review)) return true;
  const op = String(record.held_request?.operation ?? '').toLowerCase();
  return op === 'lifecycle_change' || op.includes('lifecycle');
}

/**
 * After human AUTHORIZE on a lifecycle hold, commit the proposed baseline.
 * DENY leaves the previous baseline in force.
 */
export function commitAuthorizedLifecycleChange(opts: {
  record: PolicyEvaluationRecord;
  repository: InMemoryChangeGovernanceRepository;
  now?: string;
}): GovernanceBaseline | null {
  if (!isLifecycleHoldEvaluation(opts.record)) return null;

  const evidence = asRecord(opts.record.evidence_in) ?? {};
  const proposed = asRecord(evidence.proposed_state);
  if (!proposed) return null;

  const targetType = (optionalString(evidence.target_type) ||
    'application') as GovernanceBaselineTargetType;
  const targetId = optionalString(evidence.target_id);
  if (!targetId) return null;

  const previousId = optionalString(evidence.previous_baseline_id);
  const previous =
    (previousId ? opts.repository.getBaseline(previousId) : undefined) ??
    opts.repository.latestBaseline(targetType, targetId);
  if (!previous) return null;

  const changeId =
    optionalString(evidence.change_id) ?? opts.record.evaluation_id;
  const next = nextBaselineFromChange({
    previous,
    proposed_state: proposed,
    change_id: changeId,
    created_at: opts.now ?? new Date().toISOString(),
  });
  return opts.repository.saveBaseline(next);
}
