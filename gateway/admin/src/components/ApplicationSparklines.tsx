'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { proxyJson } from '@/lib/client-api';

type SparkBucket = {
  start: string;
  end: string;
  label: string;
  value: number;
};

type ActivityGranularity = 'hour' | 'day';

type ActivityResponse = {
  window_granularity?: ActivityGranularity;
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

function formatBucketRange(
  startIso: string,
  endIso: string,
  granularity: ActivityGranularity,
): string {
  const start = new Date(startIso);
  if (granularity === 'day') {
    return start.toLocaleDateString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }
  const end = new Date(endIso);
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  return `${start.toLocaleTimeString([], opts)} to ${end.toLocaleTimeString([], opts)}`;
}

function Sparkline({
  buckets,
  granularity,
  color = '#2697d9',
  emptyLabel = 'No data in this period',
  hoverIndex = null,
  onHoverIndex,
}: {
  buckets: SparkBucket[];
  granularity: ActivityGranularity;
  color?: string;
  emptyLabel?: string;
  /** Shared hover bucket index across sibling sparklines (null = none). */
  hoverIndex?: number | null;
  onHoverIndex?: (index: number | null) => void;
}) {
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

  // Exact bucket width keeps hover targets from overlapping on dense (90-day) series.
  const bucketWidth = buckets.length > 0 ? width / buckets.length : width;

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');
  const area =
    points.length > 0
      ? `${path} L${points[points.length - 1]!.x.toFixed(2)} ${height} L${points[0]!.x.toFixed(2)} ${height} Z`
      : '';

  const active =
    hoverIndex !== null && hoverIndex >= 0 && hoverIndex < points.length
      ? points[hoverIndex]
      : null;

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
            aria-label={
              granularity === 'day' ? 'Daily activity sparkline' : '24 hour sparkline'
            }
          >
            <path d={area} fill={color} opacity={0.12} />
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
                x={p.x - bucketWidth / 2}
                y={0}
                width={bucketWidth}
                height={height}
                fill="transparent"
                onMouseEnter={() => onHoverIndex?.(p.index)}
              />
            ))}
            {active ? (
              <>
                <line
                  x1={active.x}
                  x2={active.x}
                  y1={0}
                  y2={height}
                  stroke="var(--chart-track)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  cx={active.x}
                  cy={active.y}
                  r={3.5}
                  fill={color}
                  stroke="var(--panel)"
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
                {formatBucketRange(active.bucket.start, active.bucket.end, granularity)}
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
  emptyLabel,
  total,
  buckets,
  granularity,
  color,
  hoverIndex,
  onHoverIndex,
}: {
  title: string;
  subtitle: string;
  emptyLabel: string;
  total?: number;
  buckets?: SparkBucket[];
  granularity: ActivityGranularity;
  color: string;
  hoverIndex?: number | null;
  onHoverIndex?: (index: number | null) => void;
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
      <Sparkline
        buckets={buckets ?? []}
        granularity={granularity}
        emptyLabel={emptyLabel}
        color={color}
        hoverIndex={hoverIndex}
        onHoverIndex={onHoverIndex}
      />
    </div>
  );
}

export function ActivitySparklines({
  applicationId,
  className,
  days,
}: {
  /** When set, scopes series to one application; otherwise org-wide. */
  applicationId?: string;
  className?: string;
  /** Daily buckets over this many days; omit for the rolling 24-hour window. */
  days?: number;
}) {
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      try {
        setError(null);
        const base = applicationId
          ? `applications/${applicationId}/activity`
          : 'activity';
        const path = days ? `${base}?days=${days}` : base;
        const res = (await proxyJson(path, 'GET')) as ActivityResponse;
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
  }, [applicationId, days]);

  // Hover indexes point into the previous window's buckets until the refetch lands.
  useEffect(() => {
    setHoverIndex(null);
  }, [days]);

  const granularity: ActivityGranularity = days ? 'day' : 'hour';
  const subtitle = days ? `Last ${days} days` : 'Rolling 24 hours';
  const emptyLabel = days
    ? `No data in the last ${days} days`
    : 'No data in the last 24 hours';

  return (
    <div
      className={className ?? 'spark-grid spark-grid-4'}
      onMouseLeave={() => setHoverIndex(null)}
    >
      <SparkCard
        title="Requests"
        subtitle={subtitle}
        emptyLabel={emptyLabel}
        total={data?.series.requests.total}
        buckets={data?.series.requests.buckets}
        granularity={granularity}
        color="#2697d9"
        hoverIndex={hoverIndex}
        onHoverIndex={setHoverIndex}
      />
      <SparkCard
        title="Allowed"
        subtitle={subtitle}
        emptyLabel={emptyLabel}
        total={data?.series.allowed.total}
        buckets={data?.series.allowed.buckets}
        granularity={granularity}
        color="#2697d9"
        hoverIndex={hoverIndex}
        onHoverIndex={setHoverIndex}
      />
      <SparkCard
        title="Blocked"
        subtitle={subtitle}
        emptyLabel={emptyLabel}
        total={data?.series.blocked.total}
        buckets={data?.series.blocked.buckets}
        granularity={granularity}
        color="#2697d9"
        hoverIndex={hoverIndex}
        onHoverIndex={setHoverIndex}
      />
      <SparkCard
        title="Tokenize"
        subtitle={subtitle}
        emptyLabel={emptyLabel}
        total={data?.series.tokenize.total}
        buckets={data?.series.tokenize.buckets}
        granularity={granularity}
        color="#2697d9"
        hoverIndex={hoverIndex}
        onHoverIndex={setHoverIndex}
      />
      {error ? <div className="error spark-grid-error">{error}</div> : null}
    </div>
  );
}

export function ApplicationSparklines({ applicationId }: { applicationId: string }) {
  return <ActivitySparklines applicationId={applicationId} />;
}
