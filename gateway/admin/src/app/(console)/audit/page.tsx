import { adminFetch } from '@/lib/api';
import { AuditTable } from '@/components/AuditTable';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDisplayDateTime } from '@/lib/display-datetime';

type AuditResponse = {
  events: Array<{
    audit_id: string;
    timestamp: string;
    request_id: string;
    correlation_id?: string;
    organization_id?: string;
    application_id?: string;
    user_id?: string;
    operation?: string;
    data_classification?: string;
    policy_decision?: string;
    response_decision?: string;
    model_selected?: string;
    provider?: string;
    input_transformation?: string;
    response_transformation?: string;
    reason_codes?: string[];
    latency_ms?: number;
    response_hash?: string;
    event_hash?: string;
    prev_event_hash?: string;
    evaluation_id?: string | null;
    decision_hash?: string | null;
    integrity_signature?: string;
    deployment_id?: string | null;
    sequence_number?: number | null;
    audit_canonical_version?: number | null;
    input_hash?: string | null;
  }>;
};

type IntegrityResponse = {
  integrity: {
    ok: boolean;
    checked: number;
    broken_at_audit_id?: string;
    reason?: string;
  };
  verification?: {
    status: 'VERIFIED' | 'WARNING' | 'FAILED' | 'NOT_VERIFIED';
    events_verified: number;
    last_checkpoint_at: string | null;
    last_verified_sequence: number | null;
    failure_codes?: string[];
  } | null;
  note: string;
};

type AnchorsResponse = {
  configured: boolean;
  status:
    | 'NOT_CONFIGURED'
    | 'PENDING'
    | 'RETRYING'
    | 'ANCHORED'
    | 'VERIFIED'
    | 'FAILED';
  provider?: string;
  durable_queue?: boolean;
  pending_count?: number;
  retrying_count?: number;
  failed_count?: number;
  last: {
    checkpoint_id: string;
    sequence_end: number;
    anchor_id?: string;
    anchor_status: string;
    anchor_type: string;
    anchor_uri?: string | null;
    anchored_at: string | null;
    recorded_at: string;
  } | null;
  job?: {
    job_id: string;
    status: string;
    attempt_count: number;
    last_error: string | null;
    next_attempt_at: string;
  } | null;
};

type LifecycleResponse = {
  uncheckpointed_events: number;
  pending_anchors: number;
  retrying_anchors: number;
  failed_anchors: number;
  oldest_unanchored_checkpoint: {
    checkpoint_id: string;
    sequence_end: number;
    created_at: string;
  } | null;
  last_checkpoint: {
    checkpoint_id: string;
    sequence_start: number;
    sequence_end: number;
    created_at: string;
    key_id: string;
  } | null;
  metrics?: {
    checkpoints_created_total?: number;
    anchors_anchored_total?: number;
  };
};

function formatIntegrityReason(reason?: string): string {
  if (!reason) return 'Unknown integrity failure';
  const known: Record<string, string> = {
    signature_invalid:
      'Signature invalid - audit signing key may have changed since this event was sealed',
    event_hash_mismatch: 'Event hash mismatch - event payload may have been altered',
    prev_hash_mismatch: 'Previous hash mismatch - chain order or linkage may be broken',
    missing_integrity_fields: 'Missing integrity fields on a sealed-chain event',
    CHAIN_BROKEN: 'Hash chain broken',
    EVENT_HASH_MISMATCH: 'Event hash mismatch',
    SEQUENCE_GAP: 'Sequence gap detected',
    DUPLICATE_SEQUENCE: 'Duplicate sequence number',
    CHECKPOINT_MISMATCH: 'Checkpoint root hash mismatch',
    INVALID_CHECKPOINT_SIGNATURE: 'Checkpoint signature invalid',
    UNKNOWN_SIGNING_KEY: 'Unknown checkpoint signing key',
    UNSUPPORTED_CANONICAL_VERSION: 'Unsupported canonical version',
    DEPLOYMENT_MISMATCH: 'Deployment binding mismatch',
  };
  return known[reason] ?? reason.replace(/_/g, ' ');
}

function integrityBadgeStatus(
  verification: IntegrityResponse['verification'],
  legacyOk: boolean,
): string {
  if (verification?.status === 'VERIFIED') return 'valid';
  if (verification?.status === 'FAILED') return 'broken';
  if (verification?.status === 'WARNING') return 'warning';
  return legacyOk ? 'valid' : 'broken';
}

function providerLabel(provider?: string, anchorType?: string): string {
  const p = provider ?? anchorType ?? '';
  if (p === 'FILESYSTEM') return 'Customer-controlled evidence store (filesystem)';
  if (p === 'S3_OBJECT_LOCK') return 'Customer-controlled evidence store (object storage)';
  if (p === 'NONE' || !p) return 'Not configured';
  return p.replace(/_/g, ' ');
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams?: { audit_id?: string; request_id?: string };
}) {
  let data: AuditResponse | null = null;
  let integrity: IntegrityResponse | null = null;
  let anchors: AnchorsResponse | null = null;
  let lifecycle: LifecycleResponse | null = null;
  let error: string | null = null;
  try {
    data = await adminFetch<AuditResponse>('/v1/admin/audit?limit=100');
    integrity = await adminFetch<IntegrityResponse>('/v1/admin/audit/integrity');
    try {
      anchors = await adminFetch<AnchorsResponse>('/v1/admin/audit/anchors');
    } catch {
      anchors = { configured: false, status: 'NOT_CONFIGURED', last: null };
    }
    try {
      lifecycle = await adminFetch<LifecycleResponse>('/v1/admin/audit/lifecycle');
    } catch {
      lifecycle = null;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load audit';
  }

  const statusLabel =
    integrity?.verification?.status ??
    (integrity?.integrity.ok ? 'VERIFIED' : integrity ? 'FAILED' : 'NOT_VERIFIED');
  const eventsVerified =
    integrity?.verification?.events_verified ?? integrity?.integrity.checked ?? 0;

  return (
    <div className="page-fill">
      <PageHeader
        title="Audit"
        lede="Cryptographically verifiable evidence of AI governance activity."
        ledeClassName="page-lede-nowrap"
      />
      {error ? <div className="error">{error}</div> : null}
      {integrity ? (
        <div className="settings-section" style={{ marginBottom: '1.25rem', paddingTop: 0 }}>
          <div className="settings-section-aside">
            <h2 className="settings-section-title">Audit Integrity</h2>
            <p className="settings-section-explainer">
              Evidence generated and checkpoints signed inside Enigma.
            </p>
          </div>
          <div className="settings-section-data">
            <table>
              <tbody>
                <tr>
                  <th>Chain integrity</th>
                  <td>
                    <StatusBadge
                      variant="badge"
                      status={integrityBadgeStatus(
                        integrity.verification,
                        integrity.integrity.ok,
                      )}
                      label={statusLabel}
                    />
                  </td>
                </tr>
                <tr>
                  <th>Events verified</th>
                  <td className="mono">
                    {eventsVerified.toLocaleString()} events
                  </td>
                </tr>
                <tr>
                  <th>Latest checkpoint</th>
                  <td>
                    {lifecycle?.last_checkpoint ? (
                      <span className="mono">
                        seq {lifecycle.last_checkpoint.sequence_start}–
                        {lifecycle.last_checkpoint.sequence_end}
                        {' · '}
                        {formatDisplayDateTime(lifecycle.last_checkpoint.created_at)}
                      </span>
                    ) : integrity.verification?.last_checkpoint_at ? (
                      formatDisplayDateTime(integrity.verification.last_checkpoint_at)
                    ) : (
                      <span className="muted">No checkpoint yet</span>
                    )}
                  </td>
                </tr>
                {lifecycle ? (
                  <tr>
                    <th>Uncheckpointed events</th>
                    <td className="mono">{lifecycle.uncheckpointed_events}</td>
                  </tr>
                ) : null}
                {!integrity.integrity.ok ? (
                  <tr>
                    <th>Break</th>
                    <td className="error">
                      {formatIntegrityReason(integrity.integrity.reason)}
                      {integrity.integrity.broken_at_audit_id
                        ? ` (${integrity.integrity.broken_at_audit_id})`
                        : ''}
                    </td>
                  </tr>
                ) : null}
                <tr>
                  <th>Note</th>
                  <td className="muted">{integrity.note}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {anchors ? (
        <div className="settings-section" style={{ marginBottom: '1.25rem', paddingTop: 0 }}>
          <div className="settings-section-aside">
            <h2 className="settings-section-title">External Evidence</h2>
            <p className="settings-section-explainer">
              Customer-controlled durable storage for signed checkpoints. Separate from
              governance decisions.
            </p>
          </div>
          <div className="settings-section-data">
            <table>
              <tbody>
                <tr>
                  <th>External evidence anchored</th>
                  <td>
                    <StatusBadge
                      variant="badge"
                      status={
                        anchors.status === 'VERIFIED' || anchors.status === 'ANCHORED'
                          ? 'valid'
                          : anchors.status === 'FAILED'
                            ? 'broken'
                            : anchors.status === 'RETRYING'
                              ? 'warning'
                              : 'draft'
                      }
                      label={anchors.status.replace(/_/g, ' ')}
                    />
                  </td>
                </tr>
                <tr>
                  <th>Store</th>
                  <td>
                    {providerLabel(anchors.provider, anchors.last?.anchor_type)}
                  </td>
                </tr>
                {anchors.configured ? (
                  <>
                    <tr>
                      <th>Pending</th>
                      <td className="mono">
                        {anchors.pending_count ?? lifecycle?.pending_anchors ?? 0}
                      </td>
                    </tr>
                    <tr>
                      <th>Retrying</th>
                      <td className="mono">
                        {anchors.retrying_count ?? lifecycle?.retrying_anchors ?? 0}
                      </td>
                    </tr>
                    <tr>
                      <th>Failed</th>
                      <td className="mono">
                        {anchors.failed_count ?? lifecycle?.failed_anchors ?? 0}
                      </td>
                    </tr>
                  </>
                ) : null}
                {lifecycle?.oldest_unanchored_checkpoint ? (
                  <tr>
                    <th>Oldest unanchored</th>
                    <td className="mono">
                      seq {lifecycle.oldest_unanchored_checkpoint.sequence_end}
                      {' · '}
                      {formatDisplayDateTime(
                        lifecycle.oldest_unanchored_checkpoint.created_at,
                      )}
                    </td>
                  </tr>
                ) : null}
                {anchors.last ? (
                  <>
                    <tr>
                      <th>Last successful anchor</th>
                      <td className="mono">Sequence {anchors.last.sequence_end}</td>
                    </tr>
                    {anchors.last.anchor_uri ? (
                      <tr>
                        <th>Reference</th>
                        <td className="mono">{anchors.last.anchor_uri}</td>
                      </tr>
                    ) : null}
                  </>
                ) : (
                  <tr>
                    <th>Detail</th>
                    <td className="muted">
                      {anchors.configured
                        ? 'No anchors yet'
                        : 'External anchoring is not configured'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {data ? (
        <AuditTable
          events={data.events}
          focusAuditId={searchParams?.audit_id}
          focusRequestId={searchParams?.request_id}
        />
      ) : null}
    </div>
  );
}
