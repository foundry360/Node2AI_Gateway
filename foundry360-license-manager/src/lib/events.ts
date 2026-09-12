import { prisma } from './prisma';
import type { LicenseEventType, Prisma } from '@prisma/client';

export async function recordLicenseEvent(opts: {
  licenseDbId: string;
  licenseId: string;
  eventType: LicenseEventType;
  actor: string;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.licenseEvent.create({
    data: {
      licenseDbId: opts.licenseDbId,
      licenseId: opts.licenseId,
      eventType: opts.eventType,
      actor: opts.actor,
      metadata: opts.metadata,
    },
  });
}
