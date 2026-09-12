import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, requireSession } from '@/lib/auth';
import { jsonError, jsonOk, clientIp } from '@/lib/http';
import { customerCreateSchema } from '@/lib/validators';

export async function GET() {
  try {
    await requireSession();
    const customers = await prisma.customer.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            deployments: true,
            licenses: true,
          },
        },
        licenses: {
          where: { status: 'ISSUED' },
          select: { id: true },
        },
      },
    });
    return jsonOk({
      customers: customers.map((c) => ({
        id: c.id,
        name: c.name,
        externalReference: c.externalReference,
        contactName: c.contactName,
        contactEmail: c.contactEmail,
        status: c.status,
        notes: c.notes,
        deployments: c._count.deployments,
        activeLicenses: c.licenses.length,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireAdmin();
    const body = customerCreateSchema.parse(await req.json());
    const existing = await prisma.customer.findFirst({
      where: { name: { equals: body.name, mode: 'insensitive' } },
    });
    if (existing) {
      return jsonError(new Error('A customer with this name already exists'));
    }
    const customer = await prisma.customer.create({
      data: {
        name: body.name,
        externalReference: body.externalReference || null,
        contactName: body.contactName || null,
        contactEmail: body.contactEmail || null,
        notes: body.notes || null,
      },
    });
    void actor;
    void clientIp(req);
    return jsonOk({ customer }, 201);
  } catch (err) {
    return jsonError(err);
  }
}
