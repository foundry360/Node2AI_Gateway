'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { ArrowDown, ArrowUp, Minus, RefreshCw } from 'lucide-react';
import { proxyJson } from '@/lib/client-api';
import { enqueueInsightLlm } from '@/lib/insight-llm-queue';
import { useConsoleTimeframe } from '@/components/ConsoleTabs';

type ActionItem = {
  priority: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  href?: string;
};

function PriorityIndicator({ priority }: { priority: ActionItem['priority'] }) {
  const label =
    priority === 'high' ? 'High priority' : priority === 'medium' ? 'Medium priority' : 'Low priority';
  const Icon = priority === 'high' ? ArrowUp : priority === 'low' ? ArrowDown : Minus;
  return (
    <span
      className={`action-priority action-priority-${priority}`}
      title={label}
      aria-label={label}
    >
      <Icon size={14} strokeWidth={2.25} aria-hidden />
    </span>
  );
}

type InsightsResponse = {
  summary: string;
  items: ActionItem[];
  source: 'local_model' | 'heuristic';
  model_id?: string;
  runtime?: {
    active_runtime: string;
    available: boolean;
  };
  generated_at: string;
};

export function TopActionItemsCard() {
  const days = useConsoleTimeframe();
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [enhancing, setEnhancing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = (enhance: boolean) => {
    startTransition(async () => {
      try {
        setError(null);
        const fast = (await proxyJson(
          `insights/action-items?days=${days}&llm=0`,
          'GET',
        )) as InsightsResponse;
        setData(fast);
        if (!enhance) return;
        setEnhancing(true);
        try {
          const full = await enqueueInsightLlm(
            () =>
              proxyJson(`insights/action-items?days=${days}&llm=1`, 'GET') as Promise<InsightsResponse>,
          );
          setData(full);
        } finally {
          setEnhancing(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to assess activity');
      }
    });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setError(null);
        const fast = (await proxyJson(
          `insights/action-items?days=${days}&llm=0`,
          'GET',
        )) as InsightsResponse;
        if (!cancelled) setData(fast);
        if (cancelled) return;
        setEnhancing(true);
        try {
          const full = await enqueueInsightLlm(
            () =>
              proxyJson(`insights/action-items?days=${days}&llm=1`, 'GET') as Promise<InsightsResponse>,
          );
          if (!cancelled) setData(full);
        } finally {
          if (!cancelled) setEnhancing(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to assess activity');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [days]);

  return (
    <section className="action-items-card">
      <div className="action-items-head">
        <div>
          <h3 className="action-items-title">Top action items</h3>
          <p className="action-items-lede muted">
            Assessed activity and performance from live console signals.
          </p>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Refresh analysis"
          title="Refresh analysis"
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
        <ul className="action-items-list">
          {data.items.slice(0, 6).map((item) => (
            <li key={item.title} className={`action-item action-item-${item.priority}`}>
              <div className="action-item-top">
                <PriorityIndicator priority={item.priority} />
                {item.href ? (
                  <Link href={item.href} className="action-item-title">
                    {item.title}
                  </Link>
                ) : (
                  <span className="action-item-title">{item.title}</span>
                )}
              </div>
              <p className="action-item-detail muted">{item.detail}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
