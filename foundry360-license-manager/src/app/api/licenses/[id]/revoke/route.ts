import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { jsonError, jsonOk, clientIp } from '@/lib/http';
import { licenseRevokeSchema } from '@/lib/validators';
import { recordLicenseEvent } from '@/lib/events';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Commercial revocation record only.
 * Does not push a remote disable signal to Enigma deployments.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const actor = await requireAdmin();
    const { id } = await ctx.params;
    const body = licenseRevokeSchema.parse(await req.json());

    const license = await prisma.license.findUnique({ where: { id } });
    if (!license) return jsonError(new Error('License not found'));
    if (license.status === 'REVOKED') {
      return jsonError(new Error('License is already revoked'));
    }
    if (license.status === 'DRAFT') {
      return jsonError(new Error('Draft licenses cannot be revoked; delete or leave as draft'));
    }

    const previousStatus = license.status;
    const updated = await prisma.license.update({
      where: { id },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
        revocationReason: body.reason,
      },
    });

    await recordLicenseEvent({
      licenseDbId: updated.id,
      licenseId: updated.licenseId,
      eventType: 'REVOKED',
      actor: actor.username,
      metadata: {
        ip: clientIp(req),
        reason: body.reason,
        previous_status: previousStatus,
        new_status: 'REVOKED',
        deployment_id: updated.deploymentId,
        note: 'Commercial record only; Enigma does not receive remote revocation',
      },
    });

    return jsonOk({ license: updated });
  } catch (err) {
    return jsonError(err);
  }
}
