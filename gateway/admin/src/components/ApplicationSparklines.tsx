'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { proxyJson } from '@/lib/client-api';

type SparkBucket = {
  start: string;
  end: string;
  label: string;
  value: number;
};

type ActivityResponse = {
  series: {
    requests: {
      total: number;
      buckets: SparkBucket[];
    };
    allowed: {
      total: number;
      buckets: SparkBucket[];
    };
    blocked: {
      total: number;
      buckets: SparkBucket[];
    };
    tokenize: {
      total: number;
      buckets: SparkBucket[];
    };
  };
};

function formatHourRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  return `${start.toLocaleTimeString([], opts)} – ${end.toLocaleTimeString([], opts)}`;
}

function Sparkline({
  buckets,
  color = '#2697d9',
  emptyLabel = 'No data in the last 24 hours',
}: {
  buckets: SparkBucket[];
  color?: string;
  emptyLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 280;
  const height = 56;
  const padY = 4;
  const values = buckets.map((b) => b.value);
  const max = Math.max(1, ...values);
  const points = useMemo(() => {
    if (buckets.length === 0) return [];
    return buckets.map((b, i) => {
      const x = buckets.length === 1 ? width / 2 : (i / (buckets.length - 1)) * width;
      const y = height - padY - (b.value / max) * (height - padY * 2);
      return { x, y, bucket: b, index: i };
    });
  }, [buckets, max]);

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');
  const area =
    points.length > 0
      ? `${path} L${points[points.length - 1]!.x.toFixed(2)} ${height} L${points[0]!.x.toFixed(2)} ${height} Z`
      : '';

  const active = hover !== null ? points[hover] : null;

  return (
    <div className="sparkline">
      {buckets.length === 0 ? (
        <p className="muted sparkline-empty">{emptyLabel}</p>
      ) : (
        <>
          <svg
            className="sparkline-svg"
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            role="img"
            aria-label="24 hour sparkline"
            onMouseLeave={() => setHover(null)}
          >            <path d={area} fill={color} opacity={0.12} />
            <path
              d={path}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {points.map((p) => (
              <rect
                key={p.bucket.start}
                x={p.x - width / buckets.length / 2}
                y={0}
                width={Math.max(width / buckets.length, 8)}
                height={height}
                fill="transparent"
                onMouseEnter={() => setHover(p.index)}
              />
            ))}
            {active ? (
              <>
                <line
                  x1={active.x}
                  x2={active.x}
                  y1={0}
                  y2={height}
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  cx={active.x}
                  cy={active.y}
                  r={3.5}
                  fill={color}
                  stroke="#0d1017"
                  strokeWidth={1.5}
                />
              </>
            ) : null}
          </svg>
          {active ? (
            <div
              className="sparkline-tooltip"
              style={{
                left: `${(active.x / width) * 100}%`,
              }}
            >
              <div className="sparkline-tooltip-value">{active.bucket.value}</div>
              <div className="sparkline-tooltip-label">
                {formatHourRange(active.bucket.start, active.bucket.end)}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function SparkCard({
  title,
  subtitle,
  total,
  buckets,
  color,
}: {
  title: string;
  subtitle: string;
  total?: number;
  buckets?: SparkBucket[];
  color: string;
}) {
  return (
    <div className="spark-card">
      <div className="spark-card-head">
        <div>
          <div className="spark-card-title">{title}</div>
          <div className="spark-card-sub muted">{subtitle}</div>
        </div>
        {typeof total === 'number' ? (
          <div className="spark-card-total">{total}</div>
        ) : null}
      </div>
      <Sparkline buckets={buckets ?? []} color={color} />
    </div>
  );
}

export function ApplicationSparklines({ applicationId }: { applicationId: string }) {
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      try {
        setError(null);
        const res = (await proxyJson(
          `applications/${applicationId}/activity`,
          'GET',
        )) as ActivityResponse;
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load activity');
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [applicationId]);

  return (
    <div className="spark-grid spark-grid-4">
      <SparkCard
        title="Requests"
        subtitle="Rolling 24 hours"
        total={data?.series.requests.total}
        buckets={data?.series.requests.buckets}
        color="#2697d9"
      />
      <SparkCard
        title="Allowed"
        subtitle="Rolling 24 hours"
        total={data?.series.allowed.total}
        buckets={data?.series.allowed.buckets}
        color="#2697d9"
      />
      <SparkCard
        title="Blocked"
        subtitle="Rolling 24 hours"
        total={data?.series.blocked.total}
        buckets={data?.series.blocked.buckets}
        color="#2697d9"
      />
      <SparkCard
        title="Tokenize"
        subtitle="Rolling 24 hours"
        total={data?.series.tokenize.total}
        buckets={data?.series.tokenize.buckets}
        color="#2697d9"
      />
      {error ? <div className="error spark-grid-error">{error}</div> : null}
    </div>
  );
}
