import Link from 'next/link';
import { adminFetch } from '@/lib/api';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';

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
  persistence?: string;
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

type PacksResponse = {
  policies: Array<{ status: string }>;
  packs: Array<{ status: string; name: string; domain: string }>;
  engine_mode: string;
};

function postureLabel(ok: boolean, detail?: string): string {
  if (!ok) return 'degraded';
  if (detail === 'not_configured') return 'memory';
  return 'healthy';
}

export default async function OverviewPage() {
  let data: Overview | null = null;
  let packs: PacksResponse | null = null;
  let error: string | null = null;

  try {
    const [overview, packsRes] = await Promise.all([
      adminFetch<Overview>('/v1/admin/overview'),
      adminFetch<PacksResponse>('/v1/admin/policy-packs').catch(() => null),
    ]);
    data = overview;
    packs = packsRes;
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load console';
  }

  const activeEpa =
    packs?.policies.filter((p) => p.status === 'active').length ??
    data?.policy.active_policies ??
    0;
  const suspendedEpa =
    packs?.policies.filter((p) => p.status === 'suspended' || p.status === 'retired')
      .length ?? 0;
  const dbHealthy = !!data?.database.ok && data.database.detail !== 'not_configured';
  const runtimeOk = data?.models.local_runtime?.available !== false;

  return (
    <div>
      <PageHeader
        title="Console"
        lede="Gateway posture, policy readiness, and recent governance events."
        actions={
          <Link href="/applications" className="btn btn-secondary">
            Applications
          </Link>
        }
      />

      {error ? (
        <div className="error">{error}. Is the gateway running on GATEWAY_URL?</div>
      ) : null}

      {data ? (
        <div className="stack">
          <div className="metrics">
            <div className="metric">
              <div className="metric-label">Gateway</div>
              <div className="metric-value">
                <StatusBadge status={data.gateway.status === 'ok' ? 'healthy' : 'degraded'} />
              </div>
            </div>
            <div className="metric">
              <div className="metric-label">Mode</div>
              <div className="metric-value mono">{data.gateway.mode}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Database</div>
              <div className="metric-value">
                <StatusBadge
                  status={postureLabel(data.database.ok, data.database.detail)}
                />
              </div>
            </div>
            <div className="metric">
              <div className="metric-label">Runtime</div>
              <div className="metric-value">
                <StatusBadge
                  status={
                    runtimeOk
                      ? data.models.local_runtime?.active_runtime ?? 'ready'
                      : 'unavailable'
                  }
                />
              </div>
            </div>
            <div className="metric">
              <div className="metric-label">Policies</div>
              <div className="metric-value">{activeEpa}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Models</div>
              <div className="metric-value">{data.models.active}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Applications</div>
              <div className="metric-value">{data.totals.applications}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Blocked</div>
              <div className="metric-value">{data.security_events}</div>
            </div>
          </div>

          <div className="split-card">
            <div className="split-card-pane">
              <div className="split-card-title">
                <span>System posture</span>
                <StatusBadge
                  status={
                    data.gateway.status === 'ok' && dbHealthy && runtimeOk
                      ? 'healthy'
                      : 'attention'
                  }
                />
              </div>
              <div className="meta-rows">
                <div className="meta-row">
                  <span className="muted">Persistence</span>
                  <span className="mono">{data.persistence ?? 'memory'}</span>
                </div>
                <div className="meta-row">
                  <span className="muted">Database</span>
                  <span className="mono">{data.database.detail}</span>
                </div>
                <div className="meta-row">
                  <span className="muted">Engine</span>
                  <span className="mono">{packs?.engine_mode ?? '—'}</span>
                </div>
                <div className="meta-row">
                  <span className="muted">Local runtime</span>
                  <span className="mono">
                    {data.models.local_runtime
                      ? `${data.models.local_runtime.active_runtime} (${data.models.local_runtime.mode})`
                      : '—'}
                  </span>
                </div>
                <div className="meta-row">
                  <span className="muted">Audit events</span>
                  <span>{data.totals.audit_events}</span>
                </div>
              </div>
            </div>
            <div className="split-card-pane">
              <div className="split-card-title">
                <span>Governance rollup</span>
                <Link href="/policies" className="table-link">
                  Policies
                </Link>
              </div>
              <div className="meta-rows">
                <div className="meta-row">
                  <span className="muted">Active policies</span>
                  <span>{activeEpa}</span>
                </div>
                <div className="meta-row">
                  <span className="muted">Suspended / retired</span>
                  <span>{suspendedEpa}</span>
                </div>
                <div className="meta-row">
                  <span className="muted">Policy packs</span>
                  <span>{packs?.packs.length ?? '—'}</span>
                </div>
                <div className="meta-row">
                  <span className="muted">Active models</span>
                  <span>{data.models.active}</span>
                </div>
                <div className="meta-row">
                  <span className="muted">Applications</span>
                  <span>
                    {data.totals.applications}{' '}
                    <Link href="/applications" className="table-link">
                      view
                    </Link>
                  </span>
                </div>
                <div className="meta-row">
                  <span className="muted">Recent blocked</span>
                  <span>{data.security_events}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="triple-grid">
            <div className="section-card">
              <div className="section-card-header">
                <h3>Packs</h3>
                <span className="count">{packs?.packs.length ?? 0}</span>
              </div>
              {!packs || packs.packs.length === 0 ? (
                <p className="muted">No packs loaded.</p>
              ) : (
                packs.packs.map((p) => (
                  <div className="list-item" key={p.name + p.domain}>
                    <div>
                      <div>{p.name}</div>
                      <div className="muted">{p.domain}</div>
                    </div>
                    <StatusBadge status={p.status} />
                  </div>
                ))
              )}
            </div>

            <div className="section-card">
              <div className="section-card-header">
                <h3>Quick links</h3>
              </div>
              <div className="stack-tight">
                <Link href="/applications" className="table-link">
                  Manage applications →
                </Link>
                <Link href="/policies" className="table-link">
                  Policy lifecycle →
                </Link>
                <Link href="/audit" className="table-link">
                  Audit trail →
                </Link>
                <Link href="/system" className="table-link">
                  System & database →
                </Link>
              </div>
            </div>

            <div className="section-card">
              <div className="section-card-header">
                <h3>Health signals</h3>
              </div>
              <div className="meta-rows">
                <div className="meta-row">
                  <span className="muted">Gateway</span>
                  <StatusBadge status={data.gateway.status === 'ok' ? 'ok' : 'broken'} />
                </div>
                <div className="meta-row">
                  <span className="muted">Database</span>
                  <StatusBadge status={dbHealthy ? 'connected' : 'warn'} />
                </div>
                <div className="meta-row">
                  <span className="muted">Runtime</span>
                  <StatusBadge status={runtimeOk ? 'ok' : 'broken'} />
                </div>
                <div className="meta-row">
                  <span className="muted">Models</span>
                  <StatusBadge status={data.models.status} />
                </div>
              </div>
            </div>
          </div>

          <div>
            <h2 className="settings-section-title" style={{ marginBottom: '0.85rem' }}>
              Recent blocked
            </h2>
            {data.recent_blocked.length === 0 ? (
              <EmptyState
                title="No blocked events"
                description="Blocked completions will appear here for triage."
              />
            ) : (
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
                  {data.recent_blocked.map((e) => (
                    <tr key={e.request_id + e.timestamp}>
                      <td className="mono">{e.timestamp}</td>
                      <td className="mono">{e.request_id}</td>
                      <td>{e.application_id ?? '—'}</td>
                      <td className="mono">{(e.reason_codes ?? []).join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
