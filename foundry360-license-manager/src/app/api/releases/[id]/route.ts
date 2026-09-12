import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { jsonError, jsonOk } from '@/lib/http';
import { serializeRelease } from '@/lib/releases';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await requireSession();
    const { id } = await ctx.params;
    const release = await prisma.enigmaRelease.findUnique({
      where: { id },
      include: { artifacts: { orderBy: { createdAt: 'asc' } } },
    });
    if (!release) return jsonError(new Error('Release not found'));
    return jsonOk({ release: serializeRelease(release) });
  } catch (err) {
    return jsonError(err);
  }
}
