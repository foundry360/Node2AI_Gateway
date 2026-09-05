'use client';

import { useEffect, useState, useTransition } from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import { TopActionItemsCard } from '@/components/TopActionItemsCard';
import { RiskClassificationCard } from '@/components/RiskClassificationCard';
import { ComplianceScoreCard } from '@/components/ComplianceScoreCard';
import { useConsoleTimeframe } from '@/components/ConsoleTabs';
import { proxyJson } from '@/lib/client-api';

type Overview = {
  gateway: { status: string; mode: string };
  models: {
    status: string;
    active: number;
    local_runtime?: {
      mode: string;
      active_runtime: string;
      available: boolean;
    };
  };
  database: { ok: boolean; detail: string };
  security_events: number;
  totals: { applications: number };
  policy: { active_policies: number };
};

function postureLabel(ok: boolean, detail?: string): string {
  if (!ok) return 'degraded';
  if (detail === 'not_configured') return 'memory';
  return 'healthy';
}

function runtimeDisplayLabel(runtime?: {
  mode: string;
  active_runtime: string;
}): string {
  if (!runtime) return 'Ready';
  if (runtime.active_runtime === 'ollama' || runtime.mode === 'ollama') {
    return 'Local LLM';
  }
  return runtime.active_runtime;
}

export function ConsoleInsightsPanel({
  activePoliciesFallback = 0,
}: {
  activePoliciesFallback?: number;
}) {
  const days = useConsoleTimeframe();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      try {
        setError(null);
        const res = (await proxyJson(`overview?days=${days}`, 'GET')) as Overview;
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load insights');
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [days]);

  if (error) {
    return <div className="error">{error}</div>;
  }

  if (!data) {
    return <p className="muted">Loading insights…</p>;
  }

  const runtimeOk = data.models.local_runtime?.available !== false;
  const activeEpa = data.policy.active_policies || activePoliciesFallback;

  return (
    <div className={`console-banner${pending ? ' is-refreshing' : ''}`}>
      <div className="console-banner-top">
        <div className="metrics metrics-2x4">
          <div className="metric">
            <div className="metric-label">Gateway</div>
            <div className="metric-value">
              <StatusBadge
                showLabel
                status={data.gateway.status === 'ok' ? 'healthy' : 'degraded'}
              />
            </div>
          </div>
          <div className="metric">
            <div className="metric-label">Database</div>
            <div className="metric-value">
              <StatusBadge
                showLabel
                status={postureLabel(data.database.ok, data.database.detail)}
              />
            </div>
          </div>
          <div className="metric">
            <div className="metric-label">Mode</div>
            <div className="metric-value mono">{data.gateway.mode}</div>
          </div>
          <div className="metric">
            <div className="metric-label">Runtime</div>
            <div className="metric-value">
              <StatusBadge
                showLabel
                status={runtimeOk ? 'ready' : 'unavailable'}
                label={
                  runtimeOk
                    ? runtimeDisplayLabel(data.models.local_runtime)
                    : 'Unavailable'
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
        <div className="console-banner-scores">
          <RiskClassificationCard />
          <ComplianceScoreCard />
        </div>
      </div>
      <div className="console-banner-bottom">
        <TopActionItemsCard />
      </div>
    </div>
  );
}
