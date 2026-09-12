import Link from 'next/link';
import { requirePageSession } from '@/lib/page-auth';
import { prisma } from '@/lib/prisma';
import { StatusBadge } from '@/components/StatusBadge';
import { ReleasesFilters } from '@/components/ReleasesFilters';

type Props = { searchParams: Promise<{ status?: string; q?: string }> };

export default async function ReleasesPage({ searchParams }: Props) {
  const session = await requirePageSession();
  const sp = await searchParams;
  const status = sp.status?.trim();
  const q = sp.q?.trim();

  const releases = await prisma.enigmaRelease.findMany({
    where: {
      ...(status && ['DRAFT', 'APPROVED', 'DEPRECATED'].includes(status)
        ? { status: status as 'DRAFT' | 'APPROVED' | 'DEPRECATED' }
        : {}),
      ...(q
        ? {
            OR: [
              { version: { contains: q, mode: 'insensitive' } },
              { releaseNotes: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    include: { artifacts: true },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Releases</h1>
        </div>
        {session.role === 'ADMINISTRATOR' && (
          <Link href="/releases/new" className="btn">
            Create Release
          </Link>
        )}
      </div>

      <ReleasesFilters status={status || ''} q={q || ''} />

      <div className="card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-5 py-2">Version</th>
              <th className="px-5 py-2">Status</th>
              <th className="px-5 py-2">VPC</th>
              <th className="px-5 py-2">Air-Gapped</th>
              <th className="px-5 py-2">Published</th>
            </tr>
          </thead>
          <tbody>
            {releases.map((r) => {
              const vpc = r.artifacts.some((a) => a.deploymentType === 'VPC');
              const air = r.artifacts.some((a) => a.deploymentType === 'AIR_GAPPED');
              return (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-5 py-3">
                    <Link
                      className="mono font-semibold text-brand hover:underline"
                      href={`/releases/${r.id}`}
                    >
                      {r.version}
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-5 py-3">{vpc ? 'Available' : '—'}</td>
                  <td className="px-5 py-3">{air ? 'Available' : '—'}</td>
                  <td className="px-5 py-3 text-muted">
                    {r.publishedAt
                      ? new Date(r.publishedAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                        })
                      : '—'}
                  </td>
                </tr>
              );
            })}
            {releases.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-muted">
                  No releases yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
