export function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  let cls = 'badge-neutral';
  if (['ACTIVE', 'ISSUED'].includes(s)) cls = 'badge-ok';
  else if (['DRAFT', 'GRACE', 'NON_PRODUCTION'].includes(s)) cls = 'badge-warn';
  else if (['REVOKED', 'INACTIVE', 'RETIRED', 'INVALID', 'DISABLED'].includes(s))
    cls = 'badge-bad';
  else if (['SUPERSEDED', 'DOWNLOADED'].includes(s)) cls = 'badge-info';
  return <span className={`badge ${cls}`}>{s.replace(/_/g, ' ')}</span>;
}
