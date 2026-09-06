import type { ReactNode } from 'react';
import {
  Ban,
  Check,
  Clock,
  Grip,
  GripHorizontal,
  HelpCircle,
  MoreHorizontal,
  Shield,
  ShieldBan,
} from 'lucide-react';
import { formatFieldLabel } from '@/lib/field-label';

function badgeKind(status: string): string {
  const s = status.toLowerCase();
  if (
    s === 'healthy' ||
    s === 'active' ||
    s === 'ok' ||
    s === 'valid' ||
    s === 'approved' ||
    s === 'allow' ||
    s === 'allowed' ||
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
    s === 'degraded' ||
    s === 'failed'
  ) {
    return 'badge-bad';
  }
  if (
    s === 'draft' ||
    s === 'review' ||
    s === 'review_required' ||
    s === 'warn' ||
    s === 'attention' ||
    s === 'memory' ||
    s === 'unknown' ||
    s === 'not_executed' ||
    s === 'controls_applied'
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

function badgeIcon(status: string): ReactNode {
  const s = status.toLowerCase();
  const props = { size: 12, strokeWidth: 2.25, 'aria-hidden': true as const };

  if (
    s === 'allow' ||
    s === 'allowed' ||
    s === 'approved' ||
    s === 'ok' ||
    s === 'valid' ||
    s === 'healthy' ||
    s === 'active' ||
    s === 'connected' ||
    s === 'ready'
  ) {
    return <Check {...props} />;
  }
  if (s === 'deny' || s === 'block' || s === 'blocked') {
    return <ShieldBan {...props} />;
  }
  if (
    s === 'failed' ||
    s === 'broken' ||
    s === 'unavailable' ||
    s === 'degraded'
  ) {
    return <Ban {...props} />;
  }
  if (s === 'controls_applied') {
    return <Shield {...props} />;
  }
  if (s === 'review' || s === 'review_required' || s === 'attention' || s === 'warn') {
    return <Clock {...props} />;
  }
  return <HelpCircle {...props} />;
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
  const label = labelOverride ?? formatFieldLabel(status);

  if (variant === 'badge') {
    return (
      <span className={`badge ${badgeKind(status)}`} title={status}>
        <span className="badge-icon">{badgeIcon(status)}</span>
        {label}
      </span>
    );
  }

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
