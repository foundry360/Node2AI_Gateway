import Link from 'next/link';
import { requirePageSession } from '@/lib/page-auth';
import { prisma } from '@/lib/prisma';
import { StatusBadge } from '@/components/StatusBadge';

export default async function DeploymentsPage() {
  const session = await requirePageSession();
  const deployments = await prisma.deployment.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      customer: true,
      licenses: {
        where: { status: 'ISSUED' },
        orderBy: { issuedAt: 'desc' },
        take: 1,
      },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Deployments</h1>
        </div>
        {session.role === 'ADMINISTRATOR' && (
          <Link href="/deployments/new" className="btn">
            Register Deployment
          </Link>
        )}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-5 py-2">Customer</th>
              <th className="px-5 py-2">Deployment ID</th>
              <th className="px-5 py-2">Type</th>
              <th className="px-5 py-2">Environment</th>
              <th className="px-5 py-2">Status</th>
              <th className="px-5 py-2">Active License</th>
              <th className="px-5 py-2">Expires</th>
            </tr>
          </thead>
          <tbody>
            {deployments.map((d) => {
              const lic = d.licenses[0];
              return (
                <tr key={d.id} className="border-t border-line">
                  <td className="px-5 py-3 font-semibold">{d.customer.name}</td>
                  <td className="px-5 py-3">
                    <Link className="mono text-brand hover:underline" href={`/deployments/${d.id}`}>
                      {d.deploymentId}
                    </Link>
                  </td>
                  <td className="px-5 py-3">{d.deploymentType}</td>
                  <td className="px-5 py-3">{d.environment}</td>
                  <td className="px-5 py-3">
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="mono px-5 py-3">{lic?.licenseId || '—'}</td>
                  <td className="px-5 py-3">{lic?.validUntil || '—'}</td>
                </tr>
              );
            })}
            {deployments.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-muted">
                  No deployments registered.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
