'use client';

import { useEffect, useState, useTransition } from 'react';
import { RefreshCw } from 'lucide-react';
import { proxyJson } from '@/lib/client-api';
import { enqueueInsightLlm } from '@/lib/insight-llm-queue';
import { useConsoleTimeframe } from '@/components/ConsoleTabs';

type RiskLevel = 'high' | 'medium' | 'low' | 'undetermined';

type RiskResponse = {
  summary: string;
  total: number;
  counts: Record<RiskLevel, number>;
  source: 'local_model' | 'heuristic';
};

const RISK_META: Array<{ key: RiskLevel; label: string; color: string }> = [
  { key: 'high', label: 'High', color: '#d92626' },
  { key: 'medium', label: 'Medium', color: '#e0c952' },
  { key: 'low', label: 'Low', color: '#1fad6d' },
  { key: 'undetermined', label: 'Undetermined', color: '#6b7280' },
];

function DonutChart({
  counts,
  total,
}: {
  counts: Record<RiskLevel, number>;
  total: number;
}) {
  const size = 188;
  const stroke = 22;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const raw =
    total === 0
      ? []
      : RISK_META.map((meta) => ({
          ...meta,
          value: counts[meta.key] ?? 0,
        })).filter((s) => s.value > 0);

  const gap = raw.length > 1 ? 3 : 0;
  const usable = circumference - gap * raw.length;

  let offset = 0;
  const segments = raw.map((s) => {
    const length = (s.value / total) * usable;
    const segment = {
      ...s,
      length,
      dashoffset: -offset,
    };
    offset += length + gap;
    return segment;
  });

  return (
    <div className="risk-donut" aria-hidden={total === 0}>
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
            key={s.key}
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
        <div className="risk-donut-total">{total}</div>
        <div className="risk-donut-label">Applications</div>
      </div>
    </div>
  );
}

export function RiskClassificationCard() {
  const days = useConsoleTimeframe();
  const [data, setData] = useState<RiskResponse | null>(null);
  const [enhancing, setEnhancing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = (enhance: boolean) => {
    startTransition(async () => {
      try {
        setError(null);
        const fast = (await proxyJson(
          `insights/risk-classification?days=${days}&llm=0`,
          'GET',
        )) as RiskResponse;
        setData(fast);
        if (!enhance) return;
        setEnhancing(true);
        try {
          const full = await enqueueInsightLlm(
            () =>
              proxyJson(
                `insights/risk-classification?days=${days}&llm=1`,
                'GET',
              ) as Promise<RiskResponse>,
          );
          setData(full);
        } finally {
          setEnhancing(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to classify risk');
      }
    });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setError(null);
        const fast = (await proxyJson(
          `insights/risk-classification?days=${days}&llm=0`,
          'GET',
        )) as RiskResponse;
        if (!cancelled) setData(fast);
        if (cancelled) return;
        setEnhancing(true);
        try {
          const full = await enqueueInsightLlm(
            () =>
              proxyJson(
                `insights/risk-classification?days=${days}&llm=1`,
                'GET',
              ) as Promise<RiskResponse>,
          );
          if (!cancelled) setData(full);
        } finally {
          if (!cancelled) setEnhancing(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to classify risk');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [days]);

  const counts = data?.counts ?? {
    high: 0,
    medium: 0,
    low: 0,
    undetermined: 0,
  };
  const total = data?.total ?? 0;

  return (
    <section className="risk-card">
      <div className="action-items-head">
        <div>
          <h3 className="action-items-title">Risk classification</h3>
          <p className="action-items-lede muted">
            Analyzed and classified application risk from live console signals.
          </p>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Refresh risk classification"
          title="Refresh risk classification"
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
          <DonutChart counts={counts} total={total} />
          <ul className="risk-legend">
            {RISK_META.map((meta) => (
              <li key={meta.key} className="risk-legend-item">
                <span
                  className="risk-legend-swatch"
                  style={{ background: meta.color }}
                  aria-hidden
                />
                <span className="risk-legend-label">{meta.label}</span>
                <span className="risk-legend-count">{counts[meta.key] ?? 0}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
