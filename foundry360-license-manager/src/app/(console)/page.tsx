import Link from 'next/link';
import { requirePageSession } from '@/lib/page-auth';
import { getDashboardStats } from '@/lib/dashboard';
import { StatusBadge } from '@/components/StatusBadge';

export default async function DashboardPage() {
  await requirePageSession();
  const stats = await getDashboardStats();

  const cards = [
    { label: 'Active Customers', value: stats.activeCustomers },
    { label: 'Active Deployments', value: stats.activeDeployments },
    { label: 'Active Licenses', value: stats.issuedLicenses },
    { label: 'Expiring Soon (30d)', value: stats.expiringSoon },
    { label: 'Grace / Expired', value: stats.graceOrExpired },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">Dashboard</h1>
        </div>
        <Link href="/licenses/new" className="btn">
          Create License
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="card p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              {c.label}
            </div>
            <div className="mt-2 font-display text-3xl font-bold text-brand">{c.value}</div>
          </div>
        ))}
      </div>

      {stats.currentProductionRelease && (
        <section className="card p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Current Production Release
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Link
              href={`/releases/${stats.currentProductionRelease.id}`}
              className="font-display text-2xl font-bold text-brand hover:underline"
            >
              Enigma {stats.currentProductionRelease.version}
            </Link>
            <StatusBadge status={stats.currentProductionRelease.status} />
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted">
            <span>
              VPC Package:{' '}
              {stats.currentProductionRelease.hasVpc ? 'Available' : 'Missing'}
            </span>
            <span>
              Air-Gapped Package:{' '}
              {stats.currentProductionRelease.hasAirgap ? 'Available' : 'Missing'}
            </span>
          </div>
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="border-b border-line px-5 py-3">
          <h2 className="font-semibold text-ink">Recent activity</h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-5 py-2">Event</th>
              <th className="px-5 py-2">License</th>
              <th className="px-5 py-2">Actor</th>
              <th className="px-5 py-2">When</th>
            </tr>
          </thead>
          <tbody>
            {stats.recentEvents.length === 0 && (
              <tr>
                <td className="px-5 py-6 text-muted" colSpan={4}>
                  No license events yet.
                </td>
              </tr>
            )}
            {stats.recentEvents.map((e) => (
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
          </tbody>
        </table>
      </section>
    </div>
  );
}
