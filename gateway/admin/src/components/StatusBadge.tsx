import type { ReactNode } from 'react';
import { Grip, GripHorizontal, MoreHorizontal } from 'lucide-react';

function formatStatusLabel(status: string) {
  if (!status) return status;
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function badgeKind(status: string): string {
  const s = status.toLowerCase();
  if (
    s === 'healthy' ||
    s === 'active' ||
    s === 'ok' ||
    s === 'valid' ||
    s === 'approved' ||
    s === 'allow' ||
    s === 'connected' ||
    s === 'ready'
  ) {
    return 'badge-ok';
  }
  if (
    s === 'suspended' ||
    s === 'disabled' ||
    s === 'retired' ||
    s === 'broken' ||
    s === 'deny' ||
    s === 'block' ||
    s === 'blocked' ||
    s === 'unavailable' ||
    s === 'degraded'
  ) {
    return 'badge-bad';
  }
  if (
    s === 'draft' ||
    s === 'review' ||
    s === 'warn' ||
    s === 'attention' ||
    s === 'memory'
  ) {
    return 'badge-warn';
  }
  return 'badge-neutral';
}

function toneFromStatus(status: string): 'ok' | 'bad' | 'warn' | 'neutral' {
  const kind = badgeKind(status);
  if (kind === 'badge-ok') return 'ok';
  if (kind === 'badge-bad') return 'bad';
  if (kind === 'badge-warn') return 'warn';
  return 'neutral';
}

export function StatusBadge({
  status,
  label: labelOverride,
  showLabel = false,
  variant = 'icon',
}: {
  status: string;
  /** Optional display text when showLabel is true (defaults to formatted status). */
  label?: string;
  showLabel?: boolean;
  variant?: 'icon' | 'badge' | 'dot';
}) {
  if (variant === 'badge') {
    return <span className={`badge ${badgeKind(status)}`}>{status}</span>;
  }

  const label = labelOverride ?? formatStatusLabel(status);
  const tone = toneFromStatus(status);

  if (variant === 'dot') {
    const inlineTone =
      tone === 'ok'
        ? 'status-inline-active'
        : tone === 'bad'
          ? 'status-inline-bad'
          : tone === 'warn'
            ? 'status-inline-suspended'
            : '';
    const dotClass =
      tone === 'bad'
        ? 'status-dot bad'
        : tone === 'warn' || tone === 'neutral'
          ? 'status-dot warn'
          : 'status-dot';

    return (
      <span
        className={`status-inline ${inlineTone}`.trim()}
        title={status}
        aria-label={label}
      >
        <span className={dotClass} aria-hidden />
        {showLabel ? <span className="status-inline-text">{label}</span> : null}
      </span>
    );
  }

  let icon: ReactNode;
  let gripTone = 'status-grip-neutral';

  if (tone === 'ok') {
    gripTone = 'status-grip-ok';
    icon = <Grip size={16} strokeWidth={2} aria-hidden />;
  } else if (tone === 'bad' || tone === 'warn') {
    gripTone = 'status-grip-bad';
    icon = <GripHorizontal size={16} strokeWidth={2} aria-hidden />;
  } else {
    icon = <MoreHorizontal size={16} strokeWidth={2} aria-hidden />;
  }

  return (
    <span className={`status-grip-wrap ${gripTone}`} title={status} aria-label={label}>
      <span className="status-grip">{icon}</span>
      {showLabel ? <span className="status-grip-label">{label}</span> : null}
    </span>
  );
}
