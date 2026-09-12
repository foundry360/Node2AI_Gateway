import Link from 'next/link';
import { requirePageSession } from '@/lib/page-auth';
import { prisma } from '@/lib/prisma';
import { StatusBadge } from '@/components/StatusBadge';

export default async function CustomersPage() {
  const session = await requirePageSession();
  const customers = await prisma.customer.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { deployments: true } },
      licenses: { where: { status: 'ISSUED' }, select: { id: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Customers</h1>
        </div>
        {session.role === 'ADMINISTRATOR' && (
          <Link href="/customers/new" className="btn">
            Create Customer
          </Link>
        )}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-5 py-2">Customer</th>
              <th className="px-5 py-2">Deployments</th>
              <th className="px-5 py-2">Active Licenses</th>
              <th className="px-5 py-2">Status</th>
              <th className="px-5 py-2" />
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-t border-line">
                <td className="px-5 py-3 font-semibold">{c.name}</td>
                <td className="px-5 py-3">{c._count.deployments}</td>
                <td className="px-5 py-3">{c.licenses.length}</td>
                <td className="px-5 py-3">
                  <StatusBadge status={c.status} />
                </td>
                <td className="px-5 py-3 text-right">
                  <Link className="text-brand font-semibold hover:underline" href={`/customers/${c.id}`}>
                    View
                  </Link>
                  {session.role === 'ADMINISTRATOR' && (
                    <>
                      {' · '}
                      <Link
                        className="text-brand font-semibold hover:underline"
                        href={`/deployments/new?customerId=${c.id}`}
                      >
                        Create Deployment
                      </Link>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-muted">
                  No customers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
