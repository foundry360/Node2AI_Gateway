'use client';

import { useEffect, useState, useTransition } from 'react';
import { RefreshCw } from 'lucide-react';
import { proxyJson } from '@/lib/client-api';
import { enqueueInsightLlm } from '@/lib/insight-llm-queue';

type FrameworkRow = {
  framework_id: string;
  name: string;
  score: number;
  status: 'strong' | 'partial' | 'weak' | 'unknown';
  detail: string;
  compliant_controls: number;
  total_controls: number;
  high_priority_issues: number;
};

type ComplianceResponse = {
  summary: string;
  overall: number;
  frameworks: FrameworkRow[];
};

function scoreColor(score: number): string {
  if (score >= 80) return '#1fad6d';
  if (score >= 50) return '#e0c952';
  if (score > 0) return '#d92626';
  return '#6b7280';
}

function DonutChart({
  overall,
  frameworks,
}: {
  overall: number;
  frameworks: FrameworkRow[];
}) {
  const size = 188;
  const stroke = 22;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const clamped = Math.max(0, Math.min(100, overall));
  const count = frameworks.length;

  let offset = 0;
  const gap = count > 1 ? 3 : 0;
  const usable = circumference - gap * count;
  const segments =
    count === 0
      ? []
      : frameworks.map((f) => {
          const length = usable / count;
          const segment = {
            id: f.framework_id,
            color: scoreColor(f.score),
            length,
            dashoffset: -offset,
          };
          offset += length + gap;
          return segment;
        });

  return (
    <div className="risk-donut" aria-label={`Overall compliance ${clamped}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--chart-track)"
          strokeWidth={stroke}
        />
        {segments.map((s) => (
          <circle
            key={s.id}
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={s.color}
            strokeWidth={stroke}
            strokeDasharray={`${s.length} ${circumference - s.length}`}
            strokeDashoffset={s.dashoffset}
            strokeLinecap="butt"
            transform={`rotate(-90 ${center} ${center})`}
          />
        ))}
      </svg>
      <div className="risk-donut-center">
        <div className="risk-donut-total">{clamped}%</div>
        <div className="risk-donut-label">Compliance</div>
      </div>
    </div>
  );
}

export function ComplianceScoreCard() {
  const [data, setData] = useState<ComplianceResponse | null>(null);
  const [enhancing, setEnhancing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = (enhance: boolean) => {
    startTransition(async () => {
      try {
        setError(null);
        const fast = (await proxyJson(
          'insights/compliance-score?llm=0',
          'GET',
        )) as ComplianceResponse;
        setData(fast);
        if (!enhance) return;
        setEnhancing(true);
        try {
          const full = await enqueueInsightLlm(
            () =>
              proxyJson('insights/compliance-score?llm=1', 'GET') as Promise<ComplianceResponse>,
          );
          setData(full);
        } finally {
          setEnhancing(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to score compliance');
      }
    });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setError(null);
        const fast = (await proxyJson(
          'insights/compliance-score?llm=0',
          'GET',
        )) as ComplianceResponse;
        if (!cancelled) setData(fast);
        if (cancelled) return;
        setEnhancing(true);
        try {
          const full = await enqueueInsightLlm(
            () =>
              proxyJson('insights/compliance-score?llm=1', 'GET') as Promise<ComplianceResponse>,
          );
          if (!cancelled) setData(full);
        } finally {
          if (!cancelled) setEnhancing(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to score compliance');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="risk-card">
      <div className="action-items-head">
        <div>
          <h3 className="action-items-title">Compliance score</h3>
          <p className="action-items-lede muted">
            Scored priority framework compliance from live pack posture.
          </p>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Refresh compliance score"
          title="Refresh compliance score"
          disabled={pending || enhancing}
          onClick={() => load(true)}
        >
          <RefreshCw
            size={16}
            strokeWidth={1.75}
            className={pending || enhancing ? 'spin' : undefined}
          />
        </button>
      </div>

      {error ? <div className="error">{error}</div> : null}

      {!data && !error ? (
        <p className="muted action-items-loading">Loading signals…</p>
      ) : null}

      {data ? (
        <div className="risk-body">
          <DonutChart overall={data.overall} frameworks={data.frameworks} />
          <ul className="risk-legend compliance-legend">
            {data.frameworks.map((f) => (
              <li key={f.framework_id} className="risk-legend-item" title={f.detail}>
                <span
                  className="risk-legend-swatch"
                  style={{ background: scoreColor(f.score) }}
                  aria-hidden
                />
                <span className="risk-legend-label">{f.name}</span>
                <span className="risk-legend-count">{Math.max(0, Math.min(100, f.score))}%</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
