import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { jsonError, jsonOk } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await requireSession();
    const { id } = await ctx.params;
    const deployment = await prisma.deployment.findUnique({
      where: { id },
      include: {
        customer: true,
        licenses: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!deployment) return jsonError(new Error('Deployment not found'));
    return jsonOk({ deployment });
  } catch (err) {
    return jsonError(err);
  }
}
