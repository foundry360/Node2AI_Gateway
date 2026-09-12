import { z } from 'zod';

export const customerCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  externalReference: z.string().trim().max(200).optional().nullable(),
  contactName: z.string().trim().max(200).optional().nullable(),
  contactEmail: z.string().trim().email().optional().nullable().or(z.literal('')),
  notes: z.string().trim().max(5000).optional().nullable(),
});

export const customerUpdateSchema = customerCreateSchema.partial().extend({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const deploymentCreateSchema = z.object({
  customerId: z.string().min(1),
  deploymentId: z
    .string()
    .trim()
    .regex(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      'Deployment ID must be a UUID from the Enigma installation',
    ),
  deploymentType: z.enum(['VPC', 'AIR_GAPPED']),
  environment: z.enum(['PRODUCTION', 'NON_PRODUCTION']).default('PRODUCTION'),
  description: z.string().trim().max(500).optional().nullable(),
});

export const licenseCreateSchema = z.object({
  customerId: z.string().min(1),
  deploymentDbId: z.string().min(1),
  licenseId: z
    .string()
    .trim()
    .min(3)
    .max(120)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'Invalid License ID format'),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  graceDays: z.number().int().min(0).max(3650).default(30),
});

export const licenseRenewSchema = z.object({
  licenseId: z
    .string()
    .trim()
    .min(3)
    .max(120)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'Invalid License ID format'),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  graceDays: z.number().int().min(0).max(3650).optional(),
});

export const licenseRevokeSchema = z.object({
  reason: z.string().trim().min(3).max(2000),
});

export const releaseCreateSchema = z.object({
  version: z.string().trim().min(1).max(64),
  releaseType: z.enum(['PRODUCTION']).default('PRODUCTION'),
  releaseNotes: z.string().trim().max(20000).optional().nullable(),
});
