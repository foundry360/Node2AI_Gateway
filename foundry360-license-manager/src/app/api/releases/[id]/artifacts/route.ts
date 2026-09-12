import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, requireSession } from '@/lib/auth';
import { jsonError, jsonOk } from '@/lib/http';
import {
  assertDraftMutable,
  defaultPackageFileName,
  serializeArtifact,
  writeReleaseArtifactFile,
} from '@/lib/releases';
import { z } from 'zod';

type Ctx = { params: Promise<{ id: string }> };

const metaSchema = z.object({
  deploymentType: z.enum(['VPC', 'AIR_GAPPED']),
  artifactType: z.enum(['DEPLOYMENT_PACKAGE']).default('DEPLOYMENT_PACKAGE'),
});

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await requireSession();
    const { id } = await ctx.params;
    const artifacts = await prisma.enigmaReleaseArtifact.findMany({
      where: { releaseId: id },
      orderBy: { createdAt: 'asc' },
    });
    return jsonOk({ artifacts: artifacts.map(serializeArtifact) });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const release = await prisma.enigmaRelease.findUnique({ where: { id } });
    if (!release) return jsonError(new Error('Release not found'));
    assertDraftMutable(release.status);

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return jsonError(new Error('file is required (multipart field "file")'));
    }
    if (file.size <= 0) {
      return jsonError(new Error('Uploaded file is empty'));
    }

    const meta = metaSchema.parse({
      deploymentType: String(form.get('deploymentType') || ''),
      artifactType: String(form.get('artifactType') || 'DEPLOYMENT_PACKAGE'),
    });

    const existing = await prisma.enigmaReleaseArtifact.findUnique({
      where: {
        releaseId_deploymentType_artifactType: {
          releaseId: id,
          deploymentType: meta.deploymentType,
          artifactType: meta.artifactType,
        },
      },
    });
    if (existing) {
      return jsonError(
        new Error(
          `A ${meta.deploymentType} ${meta.artifactType} already exists for this draft; remove is not supported — create a new release if needed`,
        ),
      );
    }

    const fileName =
      defaultPackageFileName(release.version, meta.deploymentType) ||
      file.name ||
      'package.tar.gz';

    const bytes = Buffer.from(await file.arrayBuffer());
    const written = await writeReleaseArtifactFile({
      version: release.version,
      fileName,
      data: bytes,
    });

    const artifact = await prisma.enigmaReleaseArtifact.create({
      data: {
        releaseId: id,
        deploymentType: meta.deploymentType,
        artifactType: meta.artifactType,
        fileName,
        filePath: written.path,
        sha256: written.sha256,
        sizeBytes: BigInt(written.sizeBytes),
      },
    });

    return jsonOk({ artifact: serializeArtifact(artifact) }, 201);
  } catch (err) {
    return jsonError(err);
  }
}
