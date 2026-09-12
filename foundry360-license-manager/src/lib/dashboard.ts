import { prisma } from './prisma';
import { resolveAvailablePackage } from './releases';

export async function getDashboardStats() {
  const now = new Date();
  const soon = new Date(now);
  soon.setUTCDate(soon.getUTCDate() + 30);
  const soonStr = soon.toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  const [
    activeCustomers,
    activeDeployments,
    issuedLicenses,
    expiringSoon,
    recentEvents,
    currentRelease,
  ] = await Promise.all([
    prisma.customer.count({ where: { status: 'ACTIVE' } }),
    prisma.deployment.count({ where: { status: 'ACTIVE' } }),
    prisma.license.count({ where: { status: 'ISSUED' } }),
    prisma.license.count({
      where: {
        status: 'ISSUED',
        validUntil: { gte: today, lte: soonStr },
      },
    }),
    prisma.licenseEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 15,
    }),
    prisma.enigmaRelease.findFirst({
      where: { status: 'APPROVED', releaseType: 'PRODUCTION' },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      include: { artifacts: true },
    }),
  ]);

  const graceOrExpired = await prisma.license.count({
    where: {
      status: 'ISSUED',
      validUntil: { lt: today },
    },
  });

  const vpcPkg = await resolveAvailablePackage('VPC');
  const airPkg = await resolveAvailablePackage('AIR_GAPPED');

  return {
    activeCustomers,
    activeDeployments,
    issuedLicenses,
    expiringSoon,
    graceOrExpired,
    recentEvents,
    currentProductionRelease: currentRelease
      ? {
          id: currentRelease.id,
          version: currentRelease.version,
          status: currentRelease.status,
          hasVpc: Boolean(vpcPkg),
          hasAirgap: Boolean(airPkg),
        }
      : null,
  };
}
