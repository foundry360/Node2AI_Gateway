import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, requireSession } from '@/lib/auth';
import { jsonError, jsonOk } from '@/lib/http';
import { deploymentCreateSchema } from '@/lib/validators';

export async function GET() {
  try {
    await requireSession();
    const deployments = await prisma.deployment.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        customer: true,
        licenses: {
          where: { status: 'ISSUED' },
          orderBy: { issuedAt: 'desc' },
          take: 1,
        },
      },
    });
    return jsonOk({
      deployments: deployments.map((d) => {
        const active = d.licenses[0] ?? null;
        return {
          id: d.id,
          customerId: d.customerId,
          customerName: d.customer.name,
          deploymentId: d.deploymentId,
          deploymentType: d.deploymentType,
          environment: d.environment,
          description: d.description,
          status: d.status,
          firstRegisteredAt: d.firstRegisteredAt,
          lastUpdatedAt: d.lastUpdatedAt,
          activeLicense: active
            ? {
                id: active.id,
                licenseId: active.licenseId,
                validUntil: active.validUntil,
                status: active.status,
              }
            : null,
        };
      }),
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = deploymentCreateSchema.parse(await req.json());
    const customer = await prisma.customer.findUnique({
      where: { id: body.customerId },
    });
    if (!customer) return jsonError(new Error('Customer not found'));
    const dup = await prisma.deployment.findUnique({
      where: { deploymentId: body.deploymentId },
    });
    if (dup) return jsonError(new Error('Deployment ID already registered'));

    const deployment = await prisma.deployment.create({
      data: {
        customerId: body.customerId,
        deploymentId: body.deploymentId.trim(),
        deploymentType: body.deploymentType,
        environment: body.environment,
        description: body.description || null,
      },
      include: { customer: true },
    });

    return jsonOk({ deployment }, 201);
  } catch (err) {
    return jsonError(err);
  }
}
