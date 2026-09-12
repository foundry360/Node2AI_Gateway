import Link from 'next/link';
import { requirePageSession } from '@/lib/page-auth';
import { prisma } from '@/lib/prisma';
import { StatusBadge } from '@/components/StatusBadge';

export default async function LicensesPage() {
  const session = await requirePageSession();
  const licenses = await prisma.license.findMany({
    orderBy: { createdAt: 'desc' },
    include: { customer: true },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Licenses</h1>
        </div>
        {session.role === 'ADMINISTRATOR' && (
          <Link href="/licenses/new" className="btn">
            Create License
          </Link>
        )}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-5 py-2">License ID</th>
              <th className="px-5 py-2">Customer</th>
              <th className="px-5 py-2">Deployment ID</th>
              <th className="px-5 py-2">Valid Until</th>
              <th className="px-5 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {licenses.map((l) => (
              <tr key={l.id} className="border-t border-line">
                <td className="px-5 py-3">
                  <Link className="mono font-semibold text-brand hover:underline" href={`/licenses/${l.id}`}>
                    {l.licenseId}
                  </Link>
                </td>
                <td className="px-5 py-3">{l.customer.name}</td>
                <td className="mono px-5 py-3 text-xs">{l.deploymentId}</td>
                <td className="px-5 py-3">{l.validUntil}</td>
                <td className="px-5 py-3">
                  <StatusBadge status={l.status} />
                </td>
              </tr>
            ))}
            {licenses.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-muted">
                  No licenses yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
