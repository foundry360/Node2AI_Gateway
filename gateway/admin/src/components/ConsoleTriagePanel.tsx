'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { useConsoleTimeframe, useTriageFilters } from '@/components/ConsoleTabs';
import { formatReasonCode, formatReasonCodes } from '@/lib/reason-codes';
import { proxyJson } from '@/lib/client-api';

type BlockedEvent = {
  request_id: string;
  timestamp: string;
  reason_codes?: string[];
  application_id?: string;
  application_name?: string;
  policy_decision?: string;
  response_decision?: string;
};

type Overview = {
  recent_blocked: BlockedEvent[];
};

function titleCaseAppName(value: string) {
  return value
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function formatApplicationLabel(e: BlockedEvent) {
  if (e.application_name?.trim()) return titleCaseAppName(e.application_name);
  if (!e.application_id) return '—';
  const raw = e.application_id.replace(/^app[_-]?/i, '');
  return titleCaseAppName(raw || e.application_id);
}

function applicationKey(e: BlockedEvent): string {
  return e.application_id?.trim() || e.application_name?.trim() || '__none__';
}

function formatStage(e: BlockedEvent): string {
  const response = (e.response_decision ?? '').toUpperCase();
  const policy = (e.policy_decision ?? '').toUpperCase();
  if (response === 'BLOCK') return 'Response';
  if (policy === 'BLOCK' || policy === 'DENY') return 'Policy';
  return '—';
}

function blockedDateKey(timestamp: string): string | null {
  const then = Date.parse(timestamp);
  if (Number.isNaN(then)) return null;
  const d = new Date(then);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatBlockedDateLabel(isoDay: string, nowMs = Date.now()): string {
  const then = Date.parse(`${isoDay}T00:00:00`);
  if (Number.isNaN(then)) return isoDay;
  const d = new Date(then);
  const sameYear = d.getFullYear() === new Date(nowMs).getFullYear();
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

export function ConsoleTriagePanel() {
  const days = useConsoleTimeframe();
  const {
    application,
    reason,
    blockedDate,
    setApplication,
    setReason,
    setBlockedDate,
    setFilterOptions,
  } = useTriageFilters();
  const [events, setEvents] = useState<BlockedEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      try {
        setError(null);
        const res = (await proxyJson(`overview?days=${days}`, 'GET')) as Overview;
        if (!cancelled) {
          setEvents(res.recent_blocked ?? []);
          setNowMs(Date.now());
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load blocked events');
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [days]);

  useEffect(() => {
    if (!events) return;

    const appMap = new Map<string, string>();
    const reasonMap = new Map<string, string>();
    const dateMap = new Map<string, string>();

    for (const e of events) {
      const app = applicationKey(e);
      if (!appMap.has(app)) appMap.set(app, formatApplicationLabel(e));

      for (const code of e.reason_codes ?? []) {
        const key = code.trim();
        if (!key || reasonMap.has(key)) continue;
        reasonMap.set(key, formatReasonCode(key));
      }

      const dayKey = blockedDateKey(e.timestamp);
      if (dayKey && !dateMap.has(dayKey)) {
        dateMap.set(dayKey, formatBlockedDateLabel(dayKey, nowMs));
      }
    }

    setFilterOptions({
      applicationOptions: [...appMap.entries()]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      reasonOptions: [...reasonMap.entries()]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      blockedDateOptions: [...dateMap.entries()]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => b.value.localeCompare(a.value)),
    });
  }, [events, nowMs, setFilterOptions]);

  useEffect(() => {
    if (!events) return;
    const apps = new Set(events.map(applicationKey));
    const reasons = new Set(
      events.flatMap((e) => (e.reason_codes ?? []).map((c) => c.trim()).filter(Boolean)),
    );
    const dates = new Set(
      events.map((e) => blockedDateKey(e.timestamp)).filter((d): d is string => Boolean(d)),
    );
    if (application && !apps.has(application)) setApplication('');
    if (reason && !reasons.has(reason)) setReason('');
    if (blockedDate && !dates.has(blockedDate)) setBlockedDate('');
  }, [events, application, reason, blockedDate, setApplication, setReason, setBlockedDate]);

  const filtered = useMemo(() => {
    if (!events) return [];
    return events.filter((e) => {
      if (application && applicationKey(e) !== application) return false;
      if (reason && !(e.reason_codes ?? []).includes(reason)) return false;
      if (blockedDate && blockedDateKey(e.timestamp) !== blockedDate) return false;
      return true;
    });
  }, [events, application, reason, blockedDate]);

  if (error) {
    return <div className="error">{error}</div>;
  }

  if (!events) {
    return <p className="muted">Loading blocked events…</p>;
  }

  if (events.length === 0) {
    return (
      <EmptyState
        title="No blocked events"
        description={`No blocked completions in the last ${days} days.`}
      />
    );
  }

  if (filtered.length === 0) {
    return (
      <EmptyState
        title="No matching events"
        description="No blocked completions match the selected filters."
      />
    );
  }

  return (
    <div className={pending ? 'is-refreshing' : undefined}>
      <table>
        <thead>
          <tr>
            <th>Request</th>
            <th>Application</th>
            <th>Reasons</th>
            <th>Stage</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((e) => (
            <tr key={e.request_id + e.timestamp}>
              <td className="mono">{e.request_id}</td>
              <td>{formatApplicationLabel(e)}</td>
              <td>{formatReasonCodes(e.reason_codes) || '—'}</td>
              <td>{formatStage(e)}</td>
              <td className="mono">{e.timestamp}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
