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
  }>;
};

export default async function AuditPage() {
  let data: AuditResponse | null = null;
  let error: string | null = null;
  try {
    data = await adminFetch<AuditResponse>('/v1/admin/audit?limit=100');
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load audit';
  }

  return (
    <div>
      <h1 className="page-title">Audit</h1>
      <p className="page-lede">
        Decision trail for governed requests. Raw sensitive content is not stored by default.
      </p>
      {error ? <div className="error">{error}</div> : null}
      {data ? (
        <div className="panel">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>App / User</th>
                <th>Classification</th>
                <th>Decisions</th>
                <th>Model</th>
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
                    <td>{e.data_classification ?? '—'}</td>
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
