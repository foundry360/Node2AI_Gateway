import { describe, expect, it } from 'vitest';
import {
  customerCreateSchema,
  deploymentCreateSchema,
  licenseCreateSchema,
  licenseRevokeSchema,
} from '../src/lib/validators';

describe('customer validation', () => {
  it('requires name', () => {
    expect(() => customerCreateSchema.parse({ name: '' })).toThrow();
  });

  it('accepts minimal customer', () => {
    const c = customerCreateSchema.parse({ name: 'Acme Health' });
    expect(c.name).toBe('Acme Health');
  });
});

describe('deployment validation', () => {
  it('requires valid UUID deployment id', () => {
    expect(() =>
      deploymentCreateSchema.parse({
        customerId: 'c1',
        deploymentId: 'bad',
        deploymentType: 'VPC',
      }),
    ).toThrow();
  });

  it('accepts valid UUID', () => {
    const d = deploymentCreateSchema.parse({
      customerId: 'c1',
      deploymentId: '7f3c8c2e-1234-4abc-9def-0123456789ab',
      deploymentType: 'AIR_GAPPED',
      environment: 'NON_PRODUCTION',
    });
    expect(d.deploymentId).toBe('7f3c8c2e-1234-4abc-9def-0123456789ab');
  });
});

describe('license validation', () => {
  it('requires license id and dates', () => {
    expect(() =>
      licenseCreateSchema.parse({
        customerId: 'c1',
        deploymentDbId: 'd1',
        licenseId: 'ENIGMA-ACME-2026-001',
        validFrom: '2026-01-01',
        validUntil: '2026-12-31',
      }),
    ).not.toThrow();
  });

  it('requires revocation reason', () => {
    expect(() => licenseRevokeSchema.parse({ reason: 'ab' })).toThrow();
    expect(licenseRevokeSchema.parse({ reason: 'Contract ended' }).reason).toBe(
      'Contract ended',
    );
  });
});
