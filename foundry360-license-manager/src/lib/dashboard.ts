import { prisma } from './prisma';

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
  ]);

  const graceOrExpired = await prisma.license.count({
    where: {
      status: 'ISSUED',
      validUntil: { lt: today },
    },
  });

  return {
    activeCustomers,
    activeDeployments,
    issuedLicenses,
    expiringSoon,
    graceOrExpired,
    recentEvents,
  };
}
