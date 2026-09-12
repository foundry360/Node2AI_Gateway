import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageSession } from '@/lib/page-auth';
import { prisma } from '@/lib/prisma';
import { IdentityBlock } from '@/components/IdentityBlock';
import { StatusBadge } from '@/components/StatusBadge';

type Props = { params: Promise<{ id: string }> };

export default async function DeploymentDetailPage({ params }: Props) {
  const session = await requirePageSession();
  const { id } = await params;
  const deployment = await prisma.deployment.findUnique({
    where: { id },
    include: {
      customer: true,
      licenses: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!deployment) notFound();
  const current = deployment.licenses.find((l) => l.status === 'ISSUED') || null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">
            {deployment.description || 'Deployment'}
          </h1>
        </div>
        {session.role === 'ADMINISTRATOR' && (
          <Link
            href={`/licenses/new?deploymentId=${deployment.id}&customerId=${deployment.customerId}`}
            className="btn"
          >
            Create License
          </Link>
        )}
      </div>

      <IdentityBlock
        customer={deployment.customer.name}
        deploymentId={deployment.deploymentId}
        licenseId={current?.licenseId}
        status={deployment.status}
      />

      <section className="card grid gap-4 p-5 text-sm sm:grid-cols-2">
        <div>
          <div className="text-muted">Deployment type</div>
          <div className="font-semibold">{deployment.deploymentType}</div>
        </div>
        <div>
          <div className="text-muted">Environment</div>
          <div className="font-semibold">{deployment.environment}</div>
        </div>
        <div>
          <div className="text-muted">Registered</div>
          <div>{new Date(deployment.firstRegisteredAt).toLocaleString()}</div>
        </div>
        <div>
          <div className="text-muted">Last updated</div>
          <div>{new Date(deployment.lastUpdatedAt).toLocaleString()}</div>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-line px-5 py-3 font-semibold">Licenses</div>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-muted">
            <tr>
              <th className="px-5 py-2">License ID</th>
              <th className="px-5 py-2">Valid</th>
              <th className="px-5 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {deployment.licenses.map((l) => (
              <tr key={l.id} className="border-t border-line">
                <td className="px-5 py-3">
                  <Link className="mono text-brand hover:underline" href={`/licenses/${l.id}`}>
                    {l.licenseId}
                  </Link>
                </td>
                <td className="px-5 py-3">
                  {l.validFrom} → {l.validUntil}
                </td>
                <td className="px-5 py-3">
                  <StatusBadge status={l.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
