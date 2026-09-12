import { NextRequest, NextResponse } from 'next/server';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { prisma } from '@/lib/prisma';
import { AuthError, requireSession } from '@/lib/auth';
import { jsonError } from '@/lib/http';
import { fileExists } from '@/lib/releases';

type Ctx = { params: Promise<{ id: string; artifactId: string }> };

/**
 * Authenticated download of a release deployment package.
 * VIEWER + ADMINISTRATOR may download APPROVED/DEPRECATED packages.
 * DRAFT packages are administrator-only.
 * Never served as a public static file.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireSession();
    const { id, artifactId } = await ctx.params;

    const artifact = await prisma.enigmaReleaseArtifact.findFirst({
      where: { id: artifactId, releaseId: id },
      include: { release: true },
    });
    if (!artifact) return jsonError(new Error('Artifact not found'));

    if (artifact.release.status === 'DRAFT' && session.role !== 'ADMINISTRATOR') {
      throw new AuthError(
        403,
        'FORBIDDEN',
        'Draft release packages are only available to administrators',
      );
    }

    if (!fileExists(artifact.filePath)) {
      return jsonError(new Error('Artifact file is missing on disk'));
    }

    const nodeStream = createReadStream(artifact.filePath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="${artifact.fileName}"`,
        'Content-Length': String(artifact.sizeBytes),
        'X-Artifact-Sha256': artifact.sha256,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
