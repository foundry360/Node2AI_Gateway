import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { jsonError, jsonOk } from '@/lib/http';
import { buildEnigmaLicenseClaims } from '@/lib/signing';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await requireSession();
    const { id } = await ctx.params;
    const license = await prisma.license.findUnique({
      where: { id },
      include: {
        customer: true,
        deployment: true,
        events: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!license) return jsonError(new Error('License not found'));

    let previewClaims = null;
    try {
      previewClaims = buildEnigmaLicenseClaims({
        customer_name: license.customer.name,
        license_id: license.licenseId,
        deployment_id: license.deploymentId,
        deployment_type: license.deploymentType,
        valid_from: license.validFrom,
        valid_until: license.validUntil,
        grace_days: license.graceDays,
        key_id: license.keyId,
        issued_at: license.issuedAt
          ? license.issuedAt.toISOString().replace(/\.\d{3}Z$/, 'Z')
          : undefined,
      });
    } catch {
      previewClaims = null;
    }

    return jsonOk({
      license: {
        ...license,
        // Never return artifact contents or private key paths to the client beyond existence
        hasArtifact: Boolean(license.artifactPath && license.artifactSha256),
      },
      previewClaims,
    });
  } catch (err) {
    return jsonError(err);
  }
}
