import { notFound } from 'next/navigation';
import { requirePageSession } from '@/lib/page-auth';
import { prisma } from '@/lib/prisma';
import { IdentityBlock } from '@/components/IdentityBlock';
import { StatusBadge } from '@/components/StatusBadge';
import { LicenseActions } from '@/components/LicenseActions';
import { buildEnigmaLicenseClaims } from '@/lib/signing';

type Props = { params: Promise<{ id: string }> };

export default async function LicenseDetailPage({ params }: Props) {
  const session = await requirePageSession();
  const { id } = await params;
  const license = await prisma.license.findUnique({
    where: { id },
    include: {
      customer: true,
      deployment: true,
      events: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!license) notFound();

  let claims = null;
  try {
    claims = buildEnigmaLicenseClaims({
      customer_name: license.customer.name,
      license_id: license.licenseId,
      deployment_id: license.deploymentId,
      deployment_type: license.deploymentType,
      valid_from: license.validFrom,
      valid_until: license.validUntil,
      grace_days: license.graceDays,
      key_id: license.keyId,
      issued_at: license.issuedAt
        ? license.issuedAt.toISOString().replace(/\.\d{3}Z$/, 'Z')
        : undefined,
    });
  } catch {
    claims = null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">License</h1>
      </div>

      <IdentityBlock
        customer={license.customer.name}
        deploymentId={license.deploymentId}
        licenseId={license.licenseId}
        status={license.status}
      />

      <LicenseActions
        dbId={license.id}
        licenseId={license.licenseId}
        status={license.status}
        customerName={license.customer.name}
        deploymentId={license.deploymentId}
        deploymentType={license.deploymentType}
        validFrom={license.validFrom}
        validUntil={license.validUntil}
        graceDays={license.graceDays}
        isAdmin={session.role === 'ADMINISTRATOR'}
      />

      <section className="card p-5">
        <h2 className="mb-3 font-semibold">Review license claims</h2>
        {claims ? (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {Object.entries(claims).map(([k, v]) => (
              <div key={k}>
                <dt className="text-muted">{k}</dt>
                <dd className="mono break-all font-medium">{String(v)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-muted">Unable to preview claims.</p>
        )}
        {license.artifactSha256 && (
          <p className="mt-4 text-xs text-muted">
            Artifact SHA-256: <span className="mono">{license.artifactSha256}</span>
          </p>
        )}
        {license.revocationReason && (
          <p className="mt-2 text-sm text-rose-800">
            Revocation reason: {license.revocationReason}
          </p>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-line px-5 py-3 font-semibold">History</div>
        <table className="w-full text-left text-sm">
          <tbody>
            {license.events.map((e) => (
              <tr key={e.id} className="border-t border-line">
                <td className="px-5 py-3">
                  <StatusBadge status={e.eventType} />
                </td>
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
