import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { LicenseInstallPanel } from '@/components/LicenseInstallPanel';
import {
  formatDaysRemainingLabel,
  formatLicenseDate,
  formatLicenseDeployment,
} from '@/lib/license-display';

export type SystemLicense = {
  license_id: string | null;
  customer_name: string | null;
  license_type?: string;
  deployment_type: string | null;
  start_date?: string | null;
  expiration_date?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
  status: string;
  reason?: string | null;
  reason_code?: string | null;
  deployment_bound?: boolean;
  days_remaining: number;
  grace_days_remaining?: number;
  grace_ends?: string | null;
  grace_ends_date?: string | null;
  key_id?: string | null;
  source?: string | null;
  mode?: string | null;
  operational?: boolean;
  renewal_band?: string;
  renewal_message?: string | null;
};

export type SystemResponse = {
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
  /** Installation-scoped identity — separate from license_id. */
  deployment?: { deployment_id: string } | null;
  /** Present when license configuration is valid; null when missing/invalid. */
  license?: SystemLicense | null;
};

export function SystemSettingsView({
  data,
  error,
}: {
  data: SystemResponse | null;
  error: string | null;
}) {
  return (
    <div>
      {error ? <div className="error">{error}</div> : null}
      {data ? (
        <div className="settings-sections">
          <section className="settings-section">
            <div className="settings-section-aside">
              <h2 className="settings-section-title">Deployment</h2>
              <p className="settings-section-explainer">
                Stable identity for this Enigma installation. Generated once and persisted with
                the installation. Distinct from the commercial License ID. Signed licenses must
                bind to this Deployment ID.
              </p>
            </div>
            <div className="settings-section-data">
              <table>
                <tbody>
                  <tr>
                    <th>Deployment ID</th>
                    <td className="mono">
                      {data.deployment?.deployment_id ?? '-'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-aside">
              <h2 className="settings-section-title">License & Subscription</h2>
              <p className="settings-section-explainer">
                Commercial license for this installation. Foundry360 issues a signed
                license bound to this Deployment ID. Administrators install the file here;
                Enigma verifies the signature and binding before activation. After the
                contractual end date, a signed grace period may keep AI available.
                Cryptographic or binding failures never receive grace.
              </p>
            </div>
            <div className="settings-section-data">
              {data.license ? (
                <table>
                  <tbody>
                    <tr>
                      <th>Status</th>
                      <td>
                        <StatusBadge
                          status={data.license.status}
                          label={data.license.status.toUpperCase()}
                          variant="badge"
                          showLabel
                        />
                        {data.license.renewal_message || data.license.reason ? (
                          <div
                            className={
                              ['disabled', 'grace', 'invalid'].includes(
                                data.license.status.toLowerCase(),
                              )
                                ? 'license-renewal-note license-renewal-note-expired'
                                : 'license-renewal-note'
                            }
                          >
                            {data.license.renewal_message || data.license.reason}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                    <tr>
                      <th>License ID</th>
                      <td className="mono">{data.license.license_id ?? '-'}</td>
                    </tr>
                    {data.license.customer_name ? (
                      <tr>
                        <th>Customer</th>
                        <td>{data.license.customer_name}</td>
                      </tr>
                    ) : null}
                    <tr>
                      <th>Deployment ID</th>
                      <td className="mono">
                        {data.deployment?.deployment_id ?? '-'}
                      </td>
                    </tr>
                    <tr>
                      <th>Source</th>
                      <td className="mono">{data.license.source ?? '-'}</td>
                    </tr>
                    <tr>
                      <th>Deployment Binding</th>
                      <td>
                        {data.license.deployment_bound === true
                          ? 'Bound'
                          : data.license.deployment_bound === false
                            ? 'Not bound'
                            : '-'}
                      </td>
                    </tr>
                    <tr>
                      <th>Deployment Type</th>
                      <td>{formatLicenseDeployment(data.license.deployment_type)}</td>
                    </tr>
                    <tr>
                      <th>Valid From</th>
                      <td>
                        {formatLicenseDate(
                          data.license.valid_from ?? data.license.start_date,
                        )}
                      </td>
                    </tr>
                    <tr>
                      <th>Valid Until</th>
                      <td>
                        {formatLicenseDate(
                          data.license.valid_until ?? data.license.expiration_date,
                        )}
                      </td>
                    </tr>
                    {(data.license.grace_ends || data.license.grace_ends_date) ? (
                      <tr>
                        <th>Grace Ends</th>
                        <td>
                          {formatLicenseDate(
                            data.license.grace_ends ?? data.license.grace_ends_date,
                          )}
                        </td>
                      </tr>
                    ) : null}
                    <tr>
                      <th>Signing Key ID</th>
                      <td className="mono">{data.license.key_id ?? '-'}</td>
                    </tr>
                    {data.license.reason_code ? (
                      <tr>
                        <th>Reason</th>
                        <td className="mono">{data.license.reason_code}</td>
                      </tr>
                    ) : null}
                    <tr>
                      <th>Days Remaining</th>
                      <td
                        className={
                          ['disabled', 'grace', 'invalid'].includes(
                            data.license.status.toLowerCase(),
                          )
                            ? 'license-days-expired'
                            : undefined
                        }
                      >
                        {formatDaysRemainingLabel(
                          data.license.days_remaining,
                          data.license.status,
                          data.license.grace_days_remaining ?? 0,
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <p className="muted">
                  No license installed. Upload a Foundry360-signed{' '}
                  <span className="mono">enigma.license</span> below.
                </p>
              )}
              <LicenseInstallPanel />
            </div>
          </section>

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
                            ? '-'
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
                        ? 'PostgreSQL - applications, policies, audit, and vault persist across restarts.'
                        : 'In-memory - data resets when the gateway process restarts. Set DATABASE_URL to connect Postgres.'}
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
                    <td className="mono">{data.external_provider_base_url || '-'}</td>
                  </tr>
                  <tr>
                    <th>Air-gap require Ollama</th>
                    <td className="mono">{data.airgap?.require_ollama ? 'yes' : 'no'}</td>
                  </tr>
                  <tr>
                    <th>CORS origins</th>
                    <td className="mono">{data.cors_origins.join(', ') || '-'}</td>
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
