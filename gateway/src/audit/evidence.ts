import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AuditEvent } from './service.js';
import type { AuditCheckpoint, CheckpointVerifier } from './checkpoint.js';
import { verifyFullAuditIntegrity } from './verify.js';

export type EvidenceManifest = {
  deployment_id: string;
  enigma_software_version: string;
  canonical_version: number;
  first_sequence: number | null;
  last_sequence: number | null;
  event_count: number;
  first_event_id: string | null;
  last_event_id: string | null;
  root_hash: string | null;
  checkpoint_id: string | null;
  checkpoint_signature: string | null;
  key_id: string | null;
  generated_at: string;
};

export type EvidencePackage = {
  manifest: EvidenceManifest;
  events: AuditEvent[];
  checkpoints: AuditCheckpoint[];
  anchors: Array<{
    checkpoint_id: string;
    anchor_id?: string;
    anchor_status: string;
    anchor_type: string;
    anchor_reference: string | null;
    sequence_end: number;
    deployment_id?: string;
    sequence_start?: number;
    root_hash?: string;
    key_id?: string;
  }>;
  /** Sanitized events for export (no metadata secrets). */
  exportEvents: Array<Record<string, unknown>>;
};

function sanitizeEvent(e: AuditEvent): Record<string, unknown> {
  const meta = e.metadata ?? {};
  const safeMeta: Record<string, unknown> = {};
  for (const key of [
    'evaluation_id',
    'execution_id',
    'outcome',
    'enforcement',
    'client_outcome_report',
    'evidence_class',
    'machine_decision',
    'human_resolution',
    'agent_id',
    'tool_id',
    'receipt_hash',
    'client_commit',
    'resume',
    'existing_outcome',
  ] as const) {
    if (meta[key] !== undefined) safeMeta[key] = meta[key];
  }
  if (meta.action && typeof meta.action === 'object') {
    const action = meta.action as Record<string, unknown>;
    safeMeta.action = {
      kind: action.kind ?? null,
      target_id: action.target_id ?? null,
      // Omit attributes (may contain clinical note bodies / PHI).
    };
  }
  return {
    audit_id: e.audit_id,
    timestamp: e.timestamp,
    request_id: e.request_id,
    correlation_id: e.correlation_id,
    organization_id: e.organization_id ?? null,
    application_id: e.application_id ?? null,
    user_id: e.user_id ?? null,
    operation: e.operation ?? null,
    policy_decision: e.policy_decision ?? null,
    response_decision: e.response_decision ?? null,
    model_selected: e.model_selected ?? null,
    provider: e.provider ?? null,
    reason_codes: e.reason_codes ?? [],
    evaluation_id: e.evaluation_id ?? null,
    decision_hash: e.decision_hash ?? null,
    response_hash: e.response_hash ?? null,
    prev_event_hash: e.prev_event_hash ?? null,
    event_hash: e.event_hash ?? null,
    integrity_signature: e.integrity_signature ?? null,
    deployment_id: e.deployment_id ?? null,
    sequence_number: e.sequence_number ?? null,
    audit_canonical_version: e.audit_canonical_version ?? null,
    input_hash: e.input_hash ?? null,
    ...(Object.keys(safeMeta).length > 0 ? { metadata: safeMeta } : {}),
  };
}

export function buildEvidencePackage(input: {
  deploymentId: string;
  events: AuditEvent[];
  checkpoints: AuditCheckpoint[];
  anchors?: Array<{
    checkpoint_id: string;
    anchor_id?: string;
    anchor_status: string;
    anchor_type: string;
    anchor_uri?: string | null;
    sequence_end: number;
    deployment_id?: string;
    sequence_start?: number;
    root_hash?: string;
    key_id?: string;
  }>;
  softwareVersion?: string;
}): EvidencePackage {
  const events = input.events.filter(
    (e) => !e.deployment_id || e.deployment_id === input.deploymentId,
  );
  const sequenced = events
    .filter((e) => typeof e.sequence_number === 'number')
    .sort((a, b) => (a.sequence_number ?? 0) - (b.sequence_number ?? 0));
  const first = sequenced[0];
  const last = sequenced[sequenced.length - 1] ?? events[events.length - 1];
  const cps = input.checkpoints
    .filter((c) => c.deployment_id === input.deploymentId)
    .sort((a, b) => a.sequence_end - b.sequence_end);
  const lastCp = cps[cps.length - 1] ?? null;

  const manifest: EvidenceManifest = {
    deployment_id: input.deploymentId,
    enigma_software_version: input.softwareVersion ?? '0.1.0-ship',
    canonical_version: 1,
    first_sequence: first?.sequence_number ?? null,
    last_sequence: last?.sequence_number ?? null,
    event_count: events.length,
    first_event_id: first?.audit_id ?? events[0]?.audit_id ?? null,
    last_event_id: last?.audit_id ?? null,
    root_hash: last?.event_hash ?? null,
    checkpoint_id: lastCp?.checkpoint_id ?? null,
    checkpoint_signature: lastCp?.signature ?? null,
    key_id: lastCp?.key_id ?? null,
    generated_at: new Date().toISOString(),
  };

  const anchors = (input.anchors ?? []).map((a) => ({
    checkpoint_id: a.checkpoint_id,
    anchor_id: a.anchor_id,
    anchor_status: a.anchor_status,
    anchor_type: a.anchor_type,
    anchor_reference: a.anchor_uri ?? null,
    sequence_end: a.sequence_end,
    deployment_id: a.deployment_id,
    sequence_start: a.sequence_start,
    root_hash: a.root_hash,
    key_id: a.key_id,
  }));

  return {
    manifest,
    events,
    checkpoints: cps,
    anchors,
    exportEvents: events.map(sanitizeEvent),
  };
}

export function writeEvidencePackage(
  dir: string,
  pkg: EvidencePackage,
): void {
  mkdirSync(join(dir, 'signatures'), { recursive: true });
  mkdirSync(join(dir, 'verification'), { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(pkg.manifest, null, 2));
  writeFileSync(
    join(dir, 'audit-events.jsonl'),
    pkg.exportEvents.map((e) => JSON.stringify(e)).join('\n') + (pkg.exportEvents.length ? '\n' : ''),
  );
  writeFileSync(
    join(dir, 'checkpoints.json'),
    JSON.stringify(pkg.checkpoints, null, 2),
  );
  writeFileSync(join(dir, 'anchors.json'), JSON.stringify(pkg.anchors, null, 2));
  // policy-evaluations.jsonl is optional Phase 1 placeholder (hashes/refs only)
  writeFileSync(join(dir, 'policy-evaluations.jsonl'), '');
  if (pkg.manifest.checkpoint_signature) {
    writeFileSync(
      join(dir, 'signatures', 'latest-checkpoint.jws'),
      pkg.manifest.checkpoint_signature,
    );
  }
}

export async function verifyEvidencePackage(input: {
  pkg: EvidencePackage;
  hmacSigningKey: string;
  checkpointVerifier: CheckpointVerifier | null;
}): Promise<ReturnType<typeof verifyFullAuditIntegrity>> {
  const result = await verifyFullAuditIntegrity({
    deploymentId: input.pkg.manifest.deployment_id,
    events: input.pkg.events,
    checkpoints: input.pkg.checkpoints,
    hmacSigningKey: input.hmacSigningKey,
    checkpointVerifier: input.checkpointVerifier,
  });
  return result;
}
