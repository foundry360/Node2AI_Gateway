import { adminFetch } from '@/lib/api';
import { AuditTable } from '@/components/AuditTable';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';

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
  }>;
};

type IntegrityResponse = {
  integrity: {
    ok: boolean;
    checked: number;
    broken_at_audit_id?: string;
    reason?: string;
  };
  note: string;
};

function formatIntegrityReason(reason?: string): string {
  if (!reason) return 'Unknown integrity failure';
  const known: Record<string, string> = {
    signature_invalid:
      'Signature invalid - audit signing key may have changed since this event was sealed',
    event_hash_mismatch: 'Event hash mismatch - event payload may have been altered',
    prev_hash_mismatch: 'Previous hash mismatch - chain order or linkage may be broken',
    missing_integrity_fields: 'Missing integrity fields on a sealed-chain event',
  };
  return known[reason] ?? reason.replace(/_/g, ' ');
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams?: { audit_id?: string; request_id?: string };
}) {
  let data: AuditResponse | null = null;
  let integrity: IntegrityResponse | null = null;
  let error: string | null = null;
  try {
    data = await adminFetch<AuditResponse>('/v1/admin/audit?limit=100');
    integrity = await adminFetch<IntegrityResponse>('/v1/admin/audit/integrity');
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load audit';
  }

  return (
    <div>
      <PageHeader
        title="Audit"
        lede="Tamper-evident operational trail. Select a row for identity, integrity hashes, and Decision binding."
      />
      {error ? <div className="error">{error}</div> : null}
      {integrity ? (
        <div className="settings-section" style={{ marginBottom: '1.25rem', paddingTop: 0 }}>
          <div className="settings-section-aside">
            <h2 className="settings-section-title">Integrity chain</h2>
            <p className="settings-section-explainer">
              Tamper-evident hash chain status for the audit trail on this appliance.
            </p>
          </div>
          <div className="settings-section-data">
            <table>
              <tbody>
                <tr>
                  <th>Status</th>
                  <td>
                    <StatusBadge
                      variant="badge"
                      status={integrity.integrity.ok ? 'valid' : 'broken'}
                    />
                  </td>
                </tr>
                <tr>
                  <th>Checked</th>
                  <td className="mono">{integrity.integrity.checked} events</td>
                </tr>
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
