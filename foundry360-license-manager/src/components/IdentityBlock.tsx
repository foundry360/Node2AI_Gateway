import { StatusBadge } from './StatusBadge';

export function IdentityBlock({
  customer,
  deploymentId,
  licenseId,
  status,
}: {
  customer?: string | null;
  deploymentId?: string | null;
  licenseId?: string | null;
  status?: string | null;
}) {
  return (
    <div className="card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
      {customer != null && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            Customer
          </div>
          <div className="mt-1 font-display text-lg font-semibold text-ink">{customer}</div>
        </div>
      )}
      {deploymentId != null && (
        <div className="sm:col-span-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            Deployment ID
          </div>
          <div className="mono mt-1 break-all text-base font-medium text-ink">{deploymentId}</div>
        </div>
      )}
      {licenseId != null && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            License ID
          </div>
          <div className="mono mt-1 text-base font-semibold text-ink">{licenseId}</div>
        </div>
      )}
      {status != null && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            Status
          </div>
          <div className="mt-2">
            <StatusBadge status={status} />
          </div>
        </div>
      )}
    </div>
  );
}
