export function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  let kind = 'badge-neutral';
  if (
    s === 'active' ||
    s === 'ok' ||
    s === 'valid' ||
    s === 'approved' ||
    s === 'allow' ||
    s === 'connected' ||
    s === 'healthy' ||
    s === 'ready'
  ) {
    kind = 'badge-ok';
  } else if (
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
    kind = 'badge-bad';
  } else if (
    s === 'draft' ||
    s === 'review' ||
    s === 'warn' ||
    s === 'attention' ||
    s === 'memory'
  ) {
    kind = 'badge-warn';
  }
  return <span className={`badge ${kind}`}>{status}</span>;
}
