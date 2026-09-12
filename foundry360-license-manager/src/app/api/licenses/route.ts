import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, requireSession } from '@/lib/auth';
import { jsonError, jsonOk, clientIp } from '@/lib/http';
import { licenseCreateSchema } from '@/lib/validators';
import { recordLicenseEvent } from '@/lib/events';

export async function GET() {
  try {
    await requireSession();
    const licenses = await prisma.license.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        customer: true,
        deployment: true,
      },
    });
    return jsonOk({
      licenses: licenses.map((l) => ({
        id: l.id,
        licenseId: l.licenseId,
        customerId: l.customerId,
        customerName: l.customer.name,
        deploymentDbId: l.deploymentDbId,
        deploymentId: l.deploymentId,
        deploymentType: l.deploymentType,
        validFrom: l.validFrom,
        validUntil: l.validUntil,
        graceDays: l.graceDays,
        status: l.status,
        keyId: l.keyId,
        issuedAt: l.issuedAt,
        revokedAt: l.revokedAt,
        artifactSha256: l.artifactSha256,
        createdAt: l.createdAt,
      })),
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireAdmin();
    const body = licenseCreateSchema.parse(await req.json());
    if (body.validUntil < body.validFrom) {
      return jsonError(new Error('valid_until must be on or after valid_from'));
    }

    const customer = await prisma.customer.findUnique({
      where: { id: body.customerId },
    });
    if (!customer) return jsonError(new Error('Customer not found'));

    const deployment = await prisma.deployment.findUnique({
      where: { id: body.deploymentDbId },
    });
    if (!deployment) return jsonError(new Error('Deployment not found'));
    if (deployment.customerId !== body.customerId) {
      return jsonError(new Error('Deployment does not belong to customer'));
    }

    const dup = await prisma.license.findUnique({
      where: { licenseId: body.licenseId },
    });
    if (dup) return jsonError(new Error('License ID already exists'));

    const license = await prisma.license.create({
      data: {
        licenseId: body.licenseId,
        customerId: body.customerId,
        deploymentDbId: deployment.id,
        deploymentId: deployment.deploymentId,
        deploymentType: deployment.deploymentType,
        validFrom: body.validFrom,
        validUntil: body.validUntil,
        graceDays: body.graceDays,
        status: 'DRAFT',
      },
    });

    await recordLicenseEvent({
      licenseDbId: license.id,
      licenseId: license.licenseId,
      eventType: 'CREATED',
      actor: actor.username,
      metadata: {
        ip: clientIp(req),
        deployment_id: license.deploymentId,
        status: 'DRAFT',
      },
    });

    return jsonOk({ license }, 201);
  } catch (err) {
    return jsonError(err);
  }
}
