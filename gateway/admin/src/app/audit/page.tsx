import { adminFetch } from '@/lib/api';

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
      <h1 className="page-title">Audit</h1>
      <p className="page-lede">
        Tamper-evident decision trail. Released responses are hashed (SHA-256); events are
        hash-chained and HMAC-signed. Raw response text is not stored.
      </p>
      {error ? <div className="error">{error}</div> : null}
      {integrity ? (
        <div className="panel" style={{ marginBottom: '1rem' }}>
          <div className="panel-header">Integrity chain</div>
          <p>
            Status:{' '}
            <span className={`badge ${integrity.integrity.ok ? 'badge-ok' : 'badge-bad'}`}>
              {integrity.integrity.ok ? 'valid' : 'broken'}
            </span>{' '}
            · checked {integrity.integrity.checked} events
          </p>
          {!integrity.integrity.ok ? (
            <p className="error">
              {integrity.integrity.reason} at {integrity.integrity.broken_at_audit_id}
            </p>
          ) : null}
          <p className="muted">{integrity.note}</p>
        </div>
      ) : null}
      {data ? (
        <div className="panel">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>App / User</th>
                <th>Decisions</th>
                <th>Model</th>
                <th>Response hash</th>
                <th>Reasons</th>
              </tr>
            </thead>
            <tbody>
              {data.events.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    No audit events yet.
                  </td>
                </tr>
              ) : (
                data.events.map((e) => (
                  <tr key={e.audit_id}>
                    <td className="mono">{e.timestamp}</td>
                    <td>
                      <div className="mono">{e.application_id ?? '—'}</div>
                      <div className="muted mono">{e.user_id ?? ''}</div>
                    </td>
                    <td>
                      <div>
                        req:{' '}
                        <span
                          className={`badge ${
                            e.policy_decision === 'BLOCK' ? 'badge-bad' : 'badge-neutral'
                          }`}
                        >
                          {e.policy_decision ?? '—'}
                        </span>
                      </div>
                      <div style={{ marginTop: '0.25rem' }}>
                        res:{' '}
                        <span
                          className={`badge ${
                            e.response_decision === 'BLOCK' ? 'badge-bad' : 'badge-ok'
                          }`}
                        >
                          {e.response_decision ?? '—'}
                        </span>
                      </div>
                    </td>
                    <td className="mono">
                      {e.model_selected ?? '—'}
                      <div className="muted">{e.provider ?? ''}</div>
                    </td>
                    <td className="mono" title={e.response_hash}>
                      {e.response_hash ? `${e.response_hash.slice(0, 16)}…` : '—'}
                      <div className="muted" title={e.event_hash}>
                        evt {e.event_hash ? `${e.event_hash.slice(0, 12)}…` : '—'}
                      </div>
                    </td>
                    <td className="mono">{(e.reason_codes ?? []).join(', ')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
