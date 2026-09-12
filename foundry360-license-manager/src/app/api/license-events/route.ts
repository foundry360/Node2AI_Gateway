import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { jsonError, jsonOk } from '@/lib/http';

export async function GET() {
  try {
    await requireSession();
    const events = await prisma.licenseEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return jsonOk({ events });
  } catch (err) {
    return jsonError(err);
  }
}
