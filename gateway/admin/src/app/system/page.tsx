import { adminFetch } from '@/lib/api';

type SystemResponse = {
  deployment_mode: string;
  host: string;
  port: number;
  persistence?: string;
  ollama_base_url: string;
  external_provider_base_url: string;
  database: { ok: boolean; detail: string };
  cors_origins: string[];
  organizations: Array<{ organization_id: string; name: string; status: string }>;
  note: string;
};

export default async function SystemPage() {
  let data: SystemResponse | null = null;
  let error: string | null = null;
  try {
    data = await adminFetch<SystemResponse>('/v1/admin/system');
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load system';
  }

  return (
    <div>
      <h1 className="page-title">System</h1>
      <p className="page-lede">
        Appliance configuration, network endpoints, and organization status.
      </p>
      {error ? <div className="error">{error}</div> : null}
      {data ? (
        <div className="stack">
          <div className="panel">
            <div className="panel-header">Appliance</div>
            <table>
              <tbody>
                <tr>
                  <th>Deployment mode</th>
                  <td className="mono">{data.deployment_mode}</td>
                </tr>
                <tr>
                  <th>Persistence</th>
                  <td className="mono">{data.persistence ?? 'memory'}</td>
                </tr>
                <tr>
                  <th>Listen</th>
                  <td className="mono">
                    {data.host}:{data.port}
                  </td>
                </tr>
                <tr>
                  <th>Database</th>
                  <td>
                    <span className={`badge ${data.database.ok ? 'badge-ok' : 'badge-bad'}`}>
                      {data.database.detail}
                    </span>
                  </td>
                </tr>
                <tr>
                  <th>Ollama URL</th>
                  <td className="mono">{data.ollama_base_url}</td>
                </tr>
                <tr>
                  <th>External provider URL</th>
                  <td className="mono">{data.external_provider_base_url}</td>
                </tr>
                <tr>
                  <th>CORS origins</th>
                  <td className="mono">{data.cors_origins.join(', ')}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="panel">
            <div className="panel-header">Organizations</div>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>ID</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.organizations.map((o) => (
                  <tr key={o.organization_id}>
                    <td>{o.name}</td>
                    <td className="mono">{o.organization_id}</td>
                    <td>
                      <span className="badge badge-ok">{o.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">{data.note}</p>
        </div>
      ) : null}
    </div>
  );
}
