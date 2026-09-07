import { describe, expect, it } from 'vitest';
import {
  customerVerificationLabel,
  type EnforcementProjection,
} from '../../src/policy/enterprise/enforcement-projection.js';

function enforcement(
  partial: Pick<EnforcementProjection, 'status' | 'verified'>,
): Pick<EnforcementProjection, 'status' | 'verified'> {
  return partial;
}

describe('customerVerificationLabel', () => {
  it('ALLOWED + joined audit → VERIFIED', () => {
    expect(
      customerVerificationLabel(enforcement({ status: 'ALLOWED', verified: true })),
    ).toBe('VERIFIED');
  });

  it('CONTROLS_APPLIED + joined audit → VERIFIED', () => {
    expect(
      customerVerificationLabel(
        enforcement({ status: 'CONTROLS_APPLIED', verified: true }),
      ),
    ).toBe('VERIFIED');
  });

  it('BLOCKED + joined audit → VERIFIED (expected block confirmed)', () => {
    expect(
      customerVerificationLabel(enforcement({ status: 'BLOCKED', verified: true })),
    ).toBe('VERIFIED');
  });

  it('FAILED with joined audit → FAILED (never VERIFIED)', () => {
    expect(
      customerVerificationLabel(enforcement({ status: 'FAILED', verified: true })),
    ).toBe('FAILED');
  });

  it('UNKNOWN → UNVERIFIED', () => {
    expect(
      customerVerificationLabel(enforcement({ status: 'UNKNOWN', verified: false })),
    ).toBe('UNVERIFIED');
  });

  it('missing enforcement → UNVERIFIED', () => {
    expect(customerVerificationLabel(null)).toBe('UNVERIFIED');
    expect(customerVerificationLabel(undefined)).toBe('UNVERIFIED');
  });

  it('NOT_EXECUTED → NOT_EXECUTED', () => {
    expect(
      customerVerificationLabel(
        enforcement({ status: 'NOT_EXECUTED', verified: false }),
      ),
    ).toBe('NOT_EXECUTED');
  });

  it('cryptographic integrity (verified=true) does not override FAILED', () => {
    // Integrity of the operational event can be valid while enforcement failed.
    expect(
      customerVerificationLabel(enforcement({ status: 'FAILED', verified: true })),
    ).not.toBe('VERIFIED');
    expect(
      customerVerificationLabel(enforcement({ status: 'FAILED', verified: true })),
    ).toBe('FAILED');
  });
});
