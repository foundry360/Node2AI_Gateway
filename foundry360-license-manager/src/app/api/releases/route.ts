import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, requireSession } from '@/lib/auth';
import { jsonError, jsonOk } from '@/lib/http';
import { releaseCreateSchema } from '@/lib/validators';
import {
  assertValidReleaseVersion,
  serializeRelease,
} from '@/lib/releases';

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const status = req.nextUrl.searchParams.get('status');
    const q = req.nextUrl.searchParams.get('q')?.trim();

    const releases = await prisma.enigmaRelease.findMany({
      where: {
        ...(status && ['DRAFT', 'APPROVED', 'DEPRECATED'].includes(status)
          ? { status: status as 'DRAFT' | 'APPROVED' | 'DEPRECATED' }
          : {}),
        ...(q
          ? {
              OR: [
                { version: { contains: q, mode: 'insensitive' } },
                { releaseNotes: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      include: { artifacts: true },
    });

    return jsonOk({
      releases: releases.map(serializeRelease),
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = releaseCreateSchema.parse(await req.json());
    const version = assertValidReleaseVersion(body.version);

    const dup = await prisma.enigmaRelease.findUnique({ where: { version } });
    if (dup) return jsonError(new Error('A release with this version already exists'));

    const release = await prisma.enigmaRelease.create({
      data: {
        version,
        releaseType: body.releaseType,
        releaseNotes: body.releaseNotes || null,
        status: 'DRAFT',
      },
      include: { artifacts: true },
    });

    return jsonOk({ release: serializeRelease(release) }, 201);
  } catch (err) {
    return jsonError(err);
  }
}
