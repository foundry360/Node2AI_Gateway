import { notFound } from 'next/navigation';
import { requirePageSession } from '@/lib/page-auth';
import { prisma } from '@/lib/prisma';
import { StatusBadge } from '@/components/StatusBadge';
import { ReleaseAdminActions } from '@/components/ReleaseAdminActions';
import { DeleteReleaseButton } from '@/components/DeleteReleaseButton';
import { PackageDownloadButton } from '@/components/PackageDownloadButton';
import { formatBytes } from '@/lib/format';

type Props = { params: Promise<{ id: string }> };

export default async function ReleaseDetailPage({ params }: Props) {
  const session = await requirePageSession();
  const { id } = await params;
  const release = await prisma.enigmaRelease.findUnique({
    where: { id },
    include: { artifacts: { orderBy: { deploymentType: 'asc' } } },
  });
  if (!release) notFound();

  const vpc = release.artifacts.find((a) => a.deploymentType === 'VPC');
  const air = release.artifacts.find((a) => a.deploymentType === 'AIR_GAPPED');
  const canDownload =
    release.status !== 'DRAFT' || session.role === 'ADMINISTRATOR';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Enigma {release.version}</h1>
      </div>

      <section className="card grid gap-4 p-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <div className="text-muted">Version</div>
          <div className="mono font-semibold">{release.version}</div>
        </div>
        <div>
          <div className="text-muted">Status</div>
          <div className="mt-1">
            <StatusBadge status={release.status} />
          </div>
        </div>
        <div>
          <div className="text-muted">Release type</div>
          <div className="font-semibold">{release.releaseType}</div>
        </div>
        <div>
          <div className="text-muted">Published</div>
          <div>
            {release.publishedAt
              ? new Date(release.publishedAt).toLocaleString()
              : '—'}
          </div>
        </div>
        <div>
          <div className="text-muted">Created</div>
          <div>{new Date(release.createdAt).toLocaleString()}</div>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <div className="text-muted">Release notes</div>
          <div className="mt-1 whitespace-pre-wrap">{release.releaseNotes || '—'}</div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold text-lg">Deployment Packages</h2>
        <p className="text-sm text-muted">
          Software packages are generic. Customer licenses are issued separately and are never
          embedded in these artifacts.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          {[
            { label: 'VPC', artifact: vpc },
            { label: 'Air-Gapped', artifact: air },
          ].map(({ label, artifact }) => (
            <div key={label} className="card space-y-3 p-5">
              <div className="font-semibold">{label}</div>
              {artifact ? (
                <>
                  <div className="mono text-sm break-all">{artifact.fileName}</div>
                  <dl className="grid gap-2 text-sm">
                    <div>
                      <dt className="text-muted">SHA-256</dt>
                      <dd className="mono break-all text-xs">{artifact.sha256}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Size</dt>
                      <dd>{formatBytes(Number(artifact.sizeBytes))}</dd>
                    </div>
                  </dl>
                  {canDownload && (
                    <PackageDownloadButton
                      releaseId={release.id}
                      artifactId={artifact.id}
                      fileName={artifact.fileName}
                      label="Download"
                    />
                  )}
                </>
              ) : (
                <p className="text-sm text-muted">No package uploaded.</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {session.role === 'ADMINISTRATOR' && (
        <div className="space-y-4">
          <ReleaseAdminActions
            releaseId={release.id}
            status={release.status}
            hasArtifacts={release.artifacts.length > 0}
          />
          <DeleteReleaseButton
            releaseId={release.id}
            version={release.version}
            redirectTo="/releases"
          />
        </div>
      )}
    </div>
  );
}
