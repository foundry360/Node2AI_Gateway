import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { jsonError, jsonOk, clientIp } from '@/lib/http';
import { recordLicenseEvent } from '@/lib/events';
import {
  buildEnigmaLicenseClaims,
  signEnigmaLicenseClaims,
  writeLicenseArtifact,
} from '@/lib/signing';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const actor = await requireAdmin();
    const { id } = await ctx.params;

    const license = await prisma.license.findUnique({
      where: { id },
      include: { customer: true, deployment: true },
    });
    if (!license) return jsonError(new Error('License not found'));
    if (license.status !== 'DRAFT') {
      return jsonError(new Error('Only DRAFT licenses can be issued'));
    }

    // Server constructs claims from DB — ignore any client body claims
    const claims = buildEnigmaLicenseClaims({
      customer_name: license.customer.name,
      license_id: license.licenseId,
      deployment_id: license.deploymentId,
      deployment_type: license.deploymentType,
      valid_from: license.validFrom,
      valid_until: license.validUntil,
      grace_days: license.graceDays,
      key_id: license.keyId,
    });

    const { token, sha256 } = await signEnigmaLicenseClaims(claims);
    const { path, filename } = writeLicenseArtifact(license.licenseId, token);
    const issuedAt = new Date(claims.issued_at);

    // Supersede other ISSUED licenses on the same deployment
    const previous = await prisma.license.findMany({
      where: {
        deploymentDbId: license.deploymentDbId,
        status: 'ISSUED',
        id: { not: license.id },
      },
    });

    await prisma.$transaction(async (tx) => {
      for (const prev of previous) {
        await tx.license.update({
          where: { id: prev.id },
          data: { status: 'SUPERSEDED', replacedById: license.id },
        });
        await tx.licenseEvent.create({
          data: {
            licenseDbId: prev.id,
            licenseId: prev.licenseId,
            eventType: 'REPLACED',
            actor: actor.username,
            metadata: {
              replaced_by: license.licenseId,
              previous_status: 'ISSUED',
              new_status: 'SUPERSEDED',
            },
          },
        });
      }

      await tx.license.update({
        where: { id: license.id },
        data: {
          status: 'ISSUED',
          issuedAt,
          artifactSha256: sha256,
          artifactFilename: filename,
          artifactPath: path,
          keyId: claims.key_id,
          licenseVersion: claims.license_version,
        },
      });
    });

    await recordLicenseEvent({
      licenseDbId: license.id,
      licenseId: license.licenseId,
      eventType: 'ISSUED',
      actor: actor.username,
      metadata: {
        ip: clientIp(req),
        previous_status: 'DRAFT',
        new_status: 'ISSUED',
        deployment_id: license.deploymentId,
        artifact_sha256: sha256,
        key_id: claims.key_id,
      },
    });

    const updated = await prisma.license.findUnique({ where: { id: license.id } });
    return jsonOk({
      license: updated,
      // Do not return the JWS token to the browser
      artifact_sha256: sha256,
    });
  } catch (err) {
    return jsonError(err);
  }
}
