import { adminFetch } from '@/lib/api';

type Overview = {
  gateway: { status: string; mode: string };
  policy: { status: string; active_policies: number };
  models: {
    status: string;
    active: number;
    local_runtime?: {
      mode: string;
      active_runtime: string;
      available: boolean;
      airgap: boolean;
    };
  };
  database: { ok: boolean; detail: string };
  security_events: number;
  totals: { audit_events: number; applications: number; users: number };
  recent_blocked: Array<{
    request_id: string;
    timestamp: string;
    reason_codes?: string[];
    application_id?: string;
    response_decision?: string;
    policy_decision?: string;
  }>;
};

export default async function OverviewPage() {
  let data: Overview | null = null;
  let error: string | null = null;

  try {
    data = await adminFetch<Overview>('/v1/admin/overview');
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load overview';
  }

  return (
    <div>
      <h1 className="page-title">Overview</h1>
      <p className="page-lede">
        Gateway health, policy posture, and recent blocked requests.
      </p>

      {error ? (
        <div className="error">{error}. Is the gateway running on GATEWAY_URL?</div>
      ) : data ? (
        <>
          <div className="grid">
            <div className="stat">
              <div className="stat-label">Gateway</div>
              <div className="stat-value">{data.gateway.status}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Mode</div>
              <div className="stat-value">{data.gateway.mode}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Policies</div>
              <div className="stat-value">{data.policy.active_policies}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Models</div>
              <div className="stat-value">{data.models.active}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Local runtime</div>
              <div className="stat-value">
                <span
                  className={`badge ${
                    data.models.local_runtime?.available !== false ? 'badge-ok' : 'badge-bad'
                  }`}
                >
                  {data.models.local_runtime?.active_runtime ?? 'stub'}
                </span>
              </div>
            </div>
            <div className="stat">
              <div className="stat-label">Blocked (recent)</div>
              <div className="stat-value">{data.security_events}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Database</div>
              <div className="stat-value">
                <span className={`badge ${data.database.ok ? 'badge-ok' : 'badge-bad'}`}>
                  {data.database.detail}
                </span>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">Recent blocked</div>
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Request</th>
                  <th>Application</th>
                  <th>Reasons</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_blocked.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted">
                      No blocked events yet.
                    </td>
                  </tr>
                ) : (
                  data.recent_blocked.map((e) => (
                    <tr key={e.request_id + e.timestamp}>
                      <td className="mono">{e.timestamp}</td>
                      <td className="mono">{e.request_id}</td>
                      <td>{e.application_id ?? '—'}</td>
                      <td className="mono">{(e.reason_codes ?? []).join(', ')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
