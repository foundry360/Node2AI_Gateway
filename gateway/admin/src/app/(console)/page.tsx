import Link from 'next/link';
import { adminFetch } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { ConsoleTabs } from '@/components/ConsoleTabs';
import { ConsoleInsightsPanel } from '@/components/ConsoleInsightsPanel';
import { ConsoleTriagePanel } from '@/components/ConsoleTriagePanel';

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
};

type PacksResponse = {
  policies: Array<{ status: string }>;
  packs: Array<{ status: string; name: string; domain: string }>;
  engine_mode: string;
};

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
      />

      {error ? (
        <div className="error">{error}. Is the gateway running on GATEWAY_URL?</div>
      ) : null}

      {data ? (
        <ConsoleTabs
          overview={<ConsoleInsightsPanel activePoliciesFallback={activeEpa} />}
          posture={
            <div className="status-panel stack">
              <div className="status-top-grid">
                <div className="section-card">
                  <div className="section-card-header">
                    <h3>System posture</h3>
                    <StatusBadge
                      status={
                        data.gateway.status === 'ok' && dbHealthy && runtimeOk
                          ? 'healthy'
                          : 'attention'
                      }
                    />
                  </div>
                  <div className="status-kv">
                    <div className="status-kv-row">
                      <span className="status-kv-label">Persistence</span>
                      <span className="status-kv-value mono">
                        {data.persistence ?? 'memory'}
                      </span>
                    </div>
                    <div className="status-kv-row">
                      <span className="status-kv-label">Database</span>
                      <span className="status-kv-value mono">{data.database.detail}</span>
                    </div>
                    <div className="status-kv-row">
                      <span className="status-kv-label">Engine</span>
                      <span className="status-kv-value mono">
                        {packs?.engine_mode ?? '—'}
                      </span>
                    </div>
                    <div className="status-kv-row">
                      <span className="status-kv-label">Local runtime</span>
                      <span className="status-kv-value mono">
                        {data.models.local_runtime
                          ? data.models.local_runtime.active_runtime === 'ollama' ||
                            data.models.local_runtime.mode === 'ollama'
                            ? 'local llm'
                            : data.models.local_runtime.active_runtime
                          : '—'}
                      </span>
                    </div>
                    <div className="status-kv-row">
                      <span className="status-kv-label">Audit events</span>
                      <span className="status-kv-value">{data.totals.audit_events}</span>
                    </div>
                  </div>
                </div>
                <div className="section-card">
                  <div className="section-card-header">
                    <h3>Governance rollup</h3>
                    <Link href="/policies" className="table-link">
                      Policies
                    </Link>
                  </div>
                  <div className="status-kv">
                    <div className="status-kv-row">
                      <span className="status-kv-label">Active policies</span>
                      <span className="status-kv-value">{activeEpa}</span>
                    </div>
                    <div className="status-kv-row">
                      <span className="status-kv-label">Suspended / retired</span>
                      <span className="status-kv-value">{suspendedEpa}</span>
                    </div>
                    <div className="status-kv-row">
                      <span className="status-kv-label">Policy packs</span>
                      <span className="status-kv-value">{packs?.packs.length ?? '—'}</span>
                    </div>
                    <div className="status-kv-row">
                      <span className="status-kv-label">Active models</span>
                      <span className="status-kv-value">{data.models.active}</span>
                    </div>
                    <div className="status-kv-row">
                      <span className="status-kv-label">Applications</span>
                      <span className="status-kv-value">
                        {data.totals.applications}{' '}
                        <Link href="/applications" className="table-link">
                          view
                        </Link>
                      </span>
                    </div>
                    <div className="status-kv-row">
                      <span className="status-kv-label">Recent blocked</span>
                      <span className="status-kv-value">{data.security_events}</span>
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
                    <div className="status-pack-list">
                      {packs.packs.map((p) => (
                        <div className="status-pack-row" key={p.name + p.domain}>
                          <div className="status-pack-main">
                            <div className="status-pack-name">{p.name}</div>
                            <div className="status-pack-domain muted">
                              {p.domain
                                ? p.domain.charAt(0).toUpperCase() + p.domain.slice(1)
                                : '—'}
                            </div>
                          </div>
                          <div className="status-pack-status">
                            <StatusBadge showLabel status={p.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="section-card">
                  <div className="section-card-header">
                    <h3>Quick links</h3>
                  </div>
                  <nav className="status-quick-links" aria-label="Quick links">
                    <Link href="/applications">
                      <span>Manage applications</span>
                      <span aria-hidden>→</span>
                    </Link>
                    <Link href="/policies">
                      <span>Policy lifecycle</span>
                      <span aria-hidden>→</span>
                    </Link>
                    <Link href="/audit">
                      <span>Audit trail</span>
                      <span aria-hidden>→</span>
                    </Link>
                    <Link href="/system">
                      <span>System & database</span>
                      <span aria-hidden>→</span>
                    </Link>
                  </nav>
                </div>

                <div className="section-card">
                  <div className="section-card-header">
                    <h3>Health signals</h3>
                  </div>
                  <div className="leader-rows">
                    <div className="leader-row">
                      <span className="leader-label">Gateway</span>
                      <span className="leader-dots" aria-hidden />
                      <span className="leader-value">
                        <StatusBadge
                          variant="dot"
                          showLabel
                          status={data.gateway.status === 'ok' ? 'ok' : 'broken'}
                        />
                      </span>
                    </div>
                    <div className="leader-row">
                      <span className="leader-label">Database</span>
                      <span className="leader-dots" aria-hidden />
                      <span className="leader-value">
                        <StatusBadge
                          variant="dot"
                          showLabel
                          status={dbHealthy ? 'connected' : 'warn'}
                        />
                      </span>
                    </div>
                    <div className="leader-row">
                      <span className="leader-label">Runtime</span>
                      <span className="leader-dots" aria-hidden />
                      <span className="leader-value">
                        <StatusBadge
                          variant="dot"
                          showLabel
                          status={runtimeOk ? 'ok' : 'broken'}
                        />
                      </span>
                    </div>
                    <div className="leader-row">
                      <span className="leader-label">Models</span>
                      <span className="leader-dots" aria-hidden />
                      <span className="leader-value">
                        <StatusBadge variant="dot" showLabel status={data.models.status} />
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          }
          blocked={<ConsoleTriagePanel />}
        />
      ) : null}
    </div>
  );
}
