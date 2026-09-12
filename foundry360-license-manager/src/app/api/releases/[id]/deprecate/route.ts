import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { jsonError, jsonOk } from '@/lib/http';
import { serializeRelease } from '@/lib/releases';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const release = await prisma.enigmaRelease.findUnique({
      where: { id },
      include: { artifacts: true },
    });
    if (!release) return jsonError(new Error('Release not found'));
    if (release.status !== 'APPROVED') {
      return jsonError(new Error('Only APPROVED releases can be deprecated'));
    }

    const updated = await prisma.enigmaRelease.update({
      where: { id },
      data: { status: 'DEPRECATED' },
      include: { artifacts: true },
    });

    return jsonOk({ release: serializeRelease(updated) });
  } catch (err) {
    return jsonError(err);
  }
}
