import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { jsonError, jsonOk, clientIp } from '@/lib/http';
import { licenseRenewSchema } from '@/lib/validators';
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
    const body = licenseRenewSchema.parse(await req.json());
    if (body.validUntil < body.validFrom) {
      return jsonError(new Error('valid_until must be on or after valid_from'));
    }

    const previous = await prisma.license.findUnique({
      where: { id },
      include: { customer: true, deployment: true },
    });
    if (!previous) return jsonError(new Error('License not found'));
    if (previous.status !== 'ISSUED' && previous.status !== 'REVOKED') {
      return jsonError(new Error('Only ISSUED or REVOKED licenses can be renewed'));
    }

    const dup = await prisma.license.findUnique({
      where: { licenseId: body.licenseId },
    });
    if (dup) return jsonError(new Error('New License ID already exists'));
    if (body.licenseId === previous.licenseId) {
      return jsonError(new Error('Renewal requires a new License ID'));
    }

    const graceDays = body.graceDays ?? previous.graceDays;

    // Create DRAFT then issue immediately with same deployment binding
    const draft = await prisma.license.create({
      data: {
        licenseId: body.licenseId,
        customerId: previous.customerId,
        deploymentDbId: previous.deploymentDbId,
        deploymentId: previous.deploymentId,
        deploymentType: previous.deploymentType,
        validFrom: body.validFrom,
        validUntil: body.validUntil,
        graceDays,
        status: 'DRAFT',
        replacesId: previous.id,
        keyId: previous.keyId,
      },
    });

    await recordLicenseEvent({
      licenseDbId: draft.id,
      licenseId: draft.licenseId,
      eventType: 'CREATED',
      actor: actor.username,
      metadata: {
        renewal_of: previous.licenseId,
        deployment_id: draft.deploymentId,
      },
    });

    const claims = buildEnigmaLicenseClaims({
      customer_name: previous.customer.name,
      license_id: draft.licenseId,
      deployment_id: draft.deploymentId,
      deployment_type: draft.deploymentType,
      valid_from: draft.validFrom,
      valid_until: draft.validUntil,
      grace_days: draft.graceDays,
      key_id: draft.keyId,
    });

    const { token, sha256 } = await signEnigmaLicenseClaims(claims);
    const { path, filename } = writeLicenseArtifact(draft.licenseId, token);
    const issuedAt = new Date(claims.issued_at);

    await prisma.$transaction(async (tx) => {
      if (previous.status === 'ISSUED') {
        await tx.license.update({
          where: { id: previous.id },
          data: {
            status: 'SUPERSEDED',
            replacedById: draft.id,
          },
        });
        await tx.licenseEvent.create({
          data: {
            licenseDbId: previous.id,
            licenseId: previous.licenseId,
            eventType: 'REPLACED',
            actor: actor.username,
            metadata: {
              replaced_by: draft.licenseId,
              previous_status: previous.status,
              new_status: 'SUPERSEDED',
            },
          },
        });
      }

      await tx.license.update({
        where: { id: draft.id },
        data: {
          status: 'ISSUED',
          issuedAt,
          artifactSha256: sha256,
          artifactFilename: filename,
          artifactPath: path,
        },
      });
    });

    await recordLicenseEvent({
      licenseDbId: draft.id,
      licenseId: draft.licenseId,
      eventType: 'RENEWED',
      actor: actor.username,
      metadata: {
        ip: clientIp(req),
        previous_license_id: previous.licenseId,
        deployment_id: draft.deploymentId,
        artifact_sha256: sha256,
        new_status: 'ISSUED',
      },
    });

    const license = await prisma.license.findUnique({ where: { id: draft.id } });
    return jsonOk({ license, previousLicenseId: previous.licenseId }, 201);
  } catch (err) {
    return jsonError(err);
  }
}
