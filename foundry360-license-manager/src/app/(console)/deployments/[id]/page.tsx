import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageSession } from '@/lib/page-auth';
import { prisma } from '@/lib/prisma';
import { IdentityBlock } from '@/components/IdentityBlock';
import { StatusBadge } from '@/components/StatusBadge';
import { resolveAvailablePackage } from '@/lib/releases';
import { PackageDownloadButton } from '@/components/PackageDownloadButton';
import { formatBytes } from '@/lib/format';

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
  const available = await resolveAvailablePackage(deployment.deploymentType);

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

      <section className="card space-y-4 p-5">
        <h2 className="font-semibold">Enigma Software</h2>
        {available ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-muted text-sm">Current Release</div>
              <div className="mono text-lg font-semibold">
                <Link className="text-brand hover:underline" href={`/releases/${available.releaseId}`}>
                  {available.version}
                </Link>
              </div>
            </div>
            <div>
              <div className="text-muted text-sm">Deployment Type</div>
              <div className="font-semibold">{deployment.deploymentType}</div>
            </div>
            <div className="sm:col-span-2">
              <div className="text-muted text-sm">Available Package</div>
              <div className="mono break-all">{available.artifact.fileName}</div>
              <div className="mt-1 text-xs text-muted">
                SHA-256 {available.artifact.sha256} · {formatBytes(available.artifact.sizeBytes)}
              </div>
            </div>
            <PackageDownloadButton
              releaseId={available.releaseId}
              artifactId={available.artifact.id}
              fileName={available.artifact.fileName}
              label="Download Deployment Package"
            />
          </div>
        ) : (
          <p className="text-sm text-muted">
            No approved Enigma release package is available for{' '}
            {deployment.deploymentType} deployments.
          </p>
        )}
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">Licensing</h2>
        {current ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-muted text-sm">License</div>
              <Link
                className="mono font-semibold text-brand hover:underline"
                href={`/licenses/${current.id}`}
              >
                {current.licenseId}
              </Link>
              <div className="mt-1">
                <StatusBadge status={current.status} />
              </div>
            </div>
            <Link href={`/licenses/${current.id}`} className="btn btn-secondary">
              View License
            </Link>
          </div>
        ) : (
          <p className="text-sm text-muted">No issued license for this deployment.</p>
        )}
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
