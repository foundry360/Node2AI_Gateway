import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, requireSession } from '@/lib/auth';
import { jsonError, clientIp } from '@/lib/http';
import { recordLicenseEvent } from '@/lib/events';
import { readLicenseArtifact } from '@/lib/signing';
import { existsSync } from 'node:fs';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    // Download is an administrative commercial action
    const actor = await requireAdmin();
    void requireSession;
    const { id } = await ctx.params;
    const license = await prisma.license.findUnique({ where: { id } });
    if (!license) return jsonError(new Error('License not found'));
    if (license.status !== 'ISSUED' && license.status !== 'SUPERSEDED') {
      return jsonError(new Error('License artifact is not available for download'));
    }
    if (!license.artifactPath || !existsSync(license.artifactPath)) {
      return jsonError(new Error('License artifact file is missing'));
    }

    const token = readLicenseArtifact(license.artifactPath);

    await recordLicenseEvent({
      licenseDbId: license.id,
      licenseId: license.licenseId,
      eventType: 'DOWNLOADED',
      actor: actor.username,
      metadata: {
        ip: clientIp(req),
        artifact_sha256: license.artifactSha256,
        deployment_id: license.deploymentId,
      },
    });

    return new NextResponse(token + '\n', {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="enigma.license"',
        'X-Artifact-Sha256': license.artifactSha256 || '',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
