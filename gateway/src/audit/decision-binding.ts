/**
 * Cryptographic binding between authoritative policy_evaluations Decisions
 * and operational audit_events.
 *
 * decision_hash is derived ONLY from the persisted Decision record — never from
 * Audit rows or UI presentation fields.
 */

import { createHash } from 'node:crypto';
import type { PolicyEvaluationRecord } from '../policy/enterprise/evaluation-record.js';

/** Stable JSON for hashing: sorted object keys, arrays preserved in order after element normalize. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortValue);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    out[key] = sortValue(obj[key]);
  }
  return out;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v)).filter((s) => s.length > 0);
}

function policyIdentities(applicable: unknown[]): Array<{
  policy_id: string;
  version: number | null;
  pack_id: string | null;
}> {
  const rows: Array<{
    policy_id: string;
    version: number | null;
    pack_id: string | null;
  }> = [];
  for (const item of applicable) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const policy_id = o.policy_id != null ? String(o.policy_id) : '';
    if (!policy_id) continue;
    rows.push({
      policy_id,
      version: typeof o.version === 'number' ? o.version : null,
      pack_id: o.pack_id != null ? String(o.pack_id) : null,
    });
  }
  rows.sort((a, b) => {
    const p = a.policy_id.localeCompare(b.policy_id);
    if (p !== 0) return p;
    return String(a.pack_id ?? '').localeCompare(String(b.pack_id ?? ''));
  });
  return rows;
}

function obligationCodes(obligations: unknown[]): string[] {
  const codes: string[] = [];
  for (const o of obligations) {
    if (typeof o === 'string') {
      codes.push(o);
      continue;
    }
    if (o && typeof o === 'object' && 'code' in o) {
      codes.push(String((o as { code: unknown }).code));
    }
  }
  return [...new Set(codes)].sort();
}

/**
 * Canonical Decision Evidence Payload — authoritative Decision fields only.
 * Excludes operator narrative, UI labels, free-text resolution reasons, actors.
 */
export function buildDecisionEvidencePayload(
  record: PolicyEvaluationRecord,
): Record<string, unknown> {
  const explanation = record.explanation ?? ({} as PolicyEvaluationRecord['explanation']);
  const provenance = explanation.provenance;
  const resolution = explanation.resolution;
  const matched = provenance?.matched_rules ?? [];
  const rule_ids = [...new Set(matched.map((r) => r.rule_id).filter(Boolean))].sort();
  const source_ids = [
    ...new Set(matched.flatMap((r) => r.source_ids ?? []).map(String)),
  ].sort();
  const citation_ids = [
    ...new Set(matched.flatMap((r) => r.citations ?? []).map(String)),
  ].sort();

  const evidence = record.evidence_in ?? {};
  const ctx = record.context ?? {};
  const resource = record.resource ?? {};

  const reason_codes = [
    ...new Set(
      asStringList(
        record.reason_codes ??
          (evidence as { decision_reason_codes?: unknown }).decision_reason_codes,
      ),
    ),
  ].sort();

  const classification =
    (typeof evidence.classification === 'string' && evidence.classification) ||
    (typeof resource.classification === 'string' && resource.classification) ||
    null;

  const human = record.human_resolution;
  const human_resolution = human
    ? {
        resolution_status: human.resolution_status,
        original_decision: human.original_decision,
        human_disposition: human.human_disposition,
        final_decision: human.final_decision,
      }
    : null;

  return {
    evaluation_id: record.evaluation_id,
    request_id: record.request_id ?? null,
    phase: record.phase,
    created_at: record.created_at,
    machine_decision: record.decision,
    reason_codes,
    applicable_policies: policyIdentities(
      Array.isArray(record.applicable_policies) ? record.applicable_policies : [],
    ),
    obligations: obligationCodes(
      Array.isArray(record.obligations) ? record.obligations : [],
    ),
    provenance: {
      rule_ids,
      source_ids,
      citations: citation_ids,
    },
    resolution: resolution
      ? {
          category: resolution.category ?? null,
          basis: resolution.basis ?? null,
          contributing_pack_ids: [
            ...new Set(asStringList(resolution.contributing_pack_ids)),
          ].sort(),
        }
      : null,
    human_resolution,
    request_context: {
      action: record.action ?? null,
      purpose: typeof ctx.purpose === 'string' ? ctx.purpose : null,
      classification,
      recipient: typeof ctx.recipient === 'string' ? ctx.recipient : null,
      environment: typeof ctx.environment === 'string' ? ctx.environment : null,
      deployment_mode:
        typeof ctx.deployment_mode === 'string' ? ctx.deployment_mode : null,
    },
  };
}

export function canonicalDecisionEvidence(record: PolicyEvaluationRecord): string {
  return stableStringify(buildDecisionEvidencePayload(record));
}

/** SHA-256 hex of the canonical Decision Evidence Payload. */
export function computeDecisionHash(record: PolicyEvaluationRecord): string {
  return createHash('sha256')
    .update(canonicalDecisionEvidence(record), 'utf8')
    .digest('hex');
}

export type DecisionAuditBinding = {
  evaluation_id: string;
  decision_hash: string;
};

export function decisionBindingFromRecord(
  record: PolicyEvaluationRecord,
): DecisionAuditBinding {
  return {
    evaluation_id: record.evaluation_id,
    decision_hash: computeDecisionHash(record),
  };
}
