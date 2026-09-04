import { adminFetch } from '@/lib/api';
import { AuditTable } from '@/components/AuditTable';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';

type AuditResponse = {
  events: Array<{
    audit_id: string;
    timestamp: string;
    request_id: string;
    application_id?: string;
    user_id?: string;
    operation?: string;
    data_classification?: string;
    policy_decision?: string;
    response_decision?: string;
    model_selected?: string;
    provider?: string;
    reason_codes?: string[];
    latency_ms?: number;
    response_hash?: string;
    event_hash?: string;
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

export default async function AuditPage() {
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
        lede="Tamper-evident decision trail. Released responses are hashed; events are hash-chained and HMAC-signed."
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
                    <StatusBadge status={integrity.integrity.ok ? 'valid' : 'broken'} />
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
                      {integrity.integrity.reason} at {integrity.integrity.broken_at_audit_id}
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
      {data ? <AuditTable events={data.events} /> : null}
    </div>
  );
}
