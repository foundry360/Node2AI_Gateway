import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, requireSession } from '@/lib/auth';
import { jsonError, jsonOk } from '@/lib/http';
import { customerUpdateSchema } from '@/lib/validators';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await requireSession();
    const { id } = await ctx.params;
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        deployments: { orderBy: { createdAt: 'desc' } },
        licenses: {
          orderBy: { createdAt: 'desc' },
          include: { deployment: true },
        },
      },
    });
    if (!customer) return jsonError(new Error('Customer not found'));
    const events = await prisma.licenseEvent.findMany({
      where: { licenseId: { in: customer.licenses.map((l) => l.licenseId) } },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
    return jsonOk({ customer, events });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const body = customerUpdateSchema.parse(await req.json());
    const customer = await prisma.customer.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.externalReference !== undefined
          ? { externalReference: body.externalReference || null }
          : {}),
        ...(body.contactName !== undefined
          ? { contactName: body.contactName || null }
          : {}),
        ...(body.contactEmail !== undefined
          ? { contactEmail: body.contactEmail || null }
          : {}),
        ...(body.notes !== undefined ? { notes: body.notes || null } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
      },
    });
    return jsonOk({ customer });
  } catch (err) {
    return jsonError(err);
  }
}
