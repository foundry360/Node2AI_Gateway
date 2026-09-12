import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageSession } from '@/lib/page-auth';
import { prisma } from '@/lib/prisma';
import { StatusBadge } from '@/components/StatusBadge';
import { IdentityBlock } from '@/components/IdentityBlock';
import { DeactivateCustomerButton } from '@/components/DeactivateCustomerButton';

type Props = { params: Promise<{ id: string }> };

export default async function CustomerDetailPage({ params }: Props) {
  const session = await requirePageSession();
  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      deployments: { orderBy: { createdAt: 'desc' } },
      licenses: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!customer) notFound();

  const events = await prisma.licenseEvent.findMany({
    where: { licenseId: { in: customer.licenses.map((l) => l.licenseId) } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">{customer.name}</h1>
        </div>
        <div className="flex gap-2">
          {session.role === 'ADMINISTRATOR' && (
            <>
              <Link href={`/deployments/new?customerId=${customer.id}`} className="btn">
                Register Deployment
              </Link>
              <DeactivateCustomerButton
                id={customer.id}
                status={customer.status}
              />
            </>
          )}
        </div>
      </div>

      <IdentityBlock customer={customer.name} status={customer.status} />

      <section className="card p-5">
        <h2 className="mb-3 font-semibold">Customer information</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">External reference</dt>
            <dd>{customer.externalReference || '—'}</dd>
          </div>
          <div>
            <dt className="text-muted">Contact</dt>
            <dd>
              {customer.contactName || '—'}
              {customer.contactEmail ? ` · ${customer.contactEmail}` : ''}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted">Notes</dt>
            <dd className="whitespace-pre-wrap">{customer.notes || '—'}</dd>
          </div>
        </dl>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-line px-5 py-3 font-semibold">Deployments</div>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-muted">
            <tr>
              <th className="px-5 py-2">Deployment ID</th>
              <th className="px-5 py-2">Type</th>
              <th className="px-5 py-2">Env</th>
              <th className="px-5 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {customer.deployments.map((d) => (
              <tr key={d.id} className="border-t border-line">
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
              </tr>
            ))}
            {customer.deployments.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-6 text-muted">
                  No deployments registered.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-line px-5 py-3 font-semibold">Licenses</div>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-muted">
            <tr>
              <th className="px-5 py-2">License ID</th>
              <th className="px-5 py-2">Valid Until</th>
              <th className="px-5 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {customer.licenses.map((l) => (
              <tr key={l.id} className="border-t border-line">
                <td className="px-5 py-3">
                  <Link className="mono text-brand hover:underline" href={`/licenses/${l.id}`}>
                    {l.licenseId}
                  </Link>
                </td>
                <td className="px-5 py-3">{l.validUntil}</td>
                <td className="px-5 py-3">
                  <StatusBadge status={l.status} />
                </td>
              </tr>
            ))}
            {customer.licenses.length === 0 && (
              <tr>
                <td colSpan={3} className="px-5 py-6 text-muted">
                  No licenses.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-line px-5 py-3 font-semibold">
          Recent license events
        </div>
        <table className="w-full text-left text-sm">
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-t border-line">
                <td className="px-5 py-3">
                  <StatusBadge status={e.eventType} />
                </td>
                <td className="mono px-5 py-3">{e.licenseId}</td>
                <td className="px-5 py-3">{e.actor}</td>
                <td className="px-5 py-3 text-muted">
                  {new Date(e.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td className="px-5 py-6 text-muted">No events.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
