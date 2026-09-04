import { adminFetch } from '@/lib/api';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';

type SystemResponse = {
  deployment_mode: string;
  host: string;
  port: number;
  persistence?: string;
  ollama_base_url: string;
  ollama_model?: string;
  local_runtime?: {
    mode: string;
    active_runtime: string;
    available: boolean;
    airgap: boolean;
  };
  external_provider_base_url: string;
  airgap?: {
    enabled: boolean;
    external_providers: string;
    local_models_only: boolean;
    require_ollama: boolean;
  };
  database: {
    ok: boolean;
    detail: string;
    stats?: {
      size_bytes: number;
      size_pretty: string;
      connections_active: number;
      connections_max: number | null;
      cache_hit_pct: number | null;
      deadlocks: number;
      xact_commit: number;
      server_version: string | null;
    };
  };
  cors_origins: string[];
  organizations: Array<{ organization_id: string; name: string; status: string }>;
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
      <PageHeader title="System" />
      {error ? <div className="error">{error}</div> : null}
      {data ? (
        <div className="settings-sections">
          <section className="settings-section">
            <div className="settings-section-aside">
              <h2 className="settings-section-title">Database</h2>
              <p className="settings-section-explainer">
                Persistence backend for applications, policies, audit, and vault. Connection status,
                size, and activity metrics from Postgres when configured.
              </p>
            </div>
            <div className="settings-section-data">
              <table>
                <tbody>
                  <tr>
                    <th>Connection</th>
                    <td>
                      <StatusBadge
                        status={
                          data.database.ok
                            ? data.database.detail === 'not_configured'
                              ? 'warn'
                              : 'connected'
                            : 'broken'
                        }
                      />
                    </td>
                  </tr>
                  <tr>
                    <th>Persistence</th>
                    <td className="mono">{data.persistence ?? 'memory'}</td>
                  </tr>
                  {data.database.stats ? (
                    <>
                      <tr>
                        <th>Size</th>
                        <td className="mono">{data.database.stats.size_pretty}</td>
                      </tr>
                      <tr>
                        <th>Connections</th>
                        <td className="mono">
                          {data.database.stats.connections_active}
                          {data.database.stats.connections_max !== null
                            ? ` / ${data.database.stats.connections_max}`
                            : ''}
                        </td>
                      </tr>
                      <tr>
                        <th>Cache hit</th>
                        <td className="mono">
                          {data.database.stats.cache_hit_pct === null
                            ? '—'
                            : `${data.database.stats.cache_hit_pct}%`}
                        </td>
                      </tr>
                      <tr>
                        <th>Commits</th>
                        <td className="mono">{data.database.stats.xact_commit.toLocaleString()}</td>
                      </tr>
                      <tr>
                        <th>Deadlocks</th>
                        <td className="mono">{data.database.stats.deadlocks}</td>
                      </tr>
                      {data.database.stats.server_version ? (
                        <tr>
                          <th>Version</th>
                          <td className="mono muted">{data.database.stats.server_version}</td>
                        </tr>
                      ) : null}
                    </>
                  ) : null}
                  <tr>
                    <th>Mode</th>
                    <td className="muted">
                      {data.persistence === 'postgres'
                        ? 'PostgreSQL — applications, policies, audit, and vault persist across restarts.'
                        : 'In-memory — data resets when the gateway process restarts. Set DATABASE_URL to connect Postgres.'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-aside">
              <h2 className="settings-section-title">Appliance</h2>
              <p className="settings-section-explainer">
                Deployment mode, listen address, local inference runtime, and network configuration for
                this appliance.
              </p>
            </div>
            <div className="settings-section-data">
              <table>
                <tbody>
                  <tr>
                    <th>Deployment mode</th>
                    <td className="mono">{data.deployment_mode}</td>
                  </tr>
                  <tr>
                    <th>Listen</th>
                    <td className="mono">
                      {data.host}:{data.port}
                    </td>
                  </tr>
                  <tr>
                    <th>Local runtime</th>
                    <td>
                      <StatusBadge
                        status={
                          data.local_runtime?.available !== false
                            ? data.local_runtime?.active_runtime ?? 'unknown'
                            : 'unavailable'
                        }
                      />
                      {data.local_runtime ? (
                        <span className="muted"> ({data.local_runtime.mode})</span>
                      ) : null}
                    </td>
                  </tr>
                  <tr>
                    <th>Ollama URL</th>
                    <td className="mono">{data.ollama_base_url}</td>
                  </tr>
                  <tr>
                    <th>Ollama model</th>
                    <td className="mono">{data.ollama_model ?? 'llama3.2'}</td>
                  </tr>
                  <tr>
                    <th>External provider URL</th>
                    <td className="mono">{data.external_provider_base_url || '—'}</td>
                  </tr>
                  <tr>
                    <th>Air-gap require Ollama</th>
                    <td className="mono">{data.airgap?.require_ollama ? 'yes' : 'no'}</td>
                  </tr>
                  <tr>
                    <th>CORS origins</th>
                    <td className="mono">{data.cors_origins.join(', ') || '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-aside">
              <h2 className="settings-section-title">Organizations</h2>
              <p className="settings-section-explainer">
                Tenants registered on this gateway. Organization status gates application and policy
                operations.
              </p>
            </div>
            <div className="settings-section-data">
              {data.organizations.length === 0 ? (
                <EmptyState title="No organizations" />
              ) : (
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
                          <StatusBadge status={o.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
