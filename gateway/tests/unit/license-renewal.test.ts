/**
 * License renewal tracker + post-expiration grace / disable gate.
 */
import { describe, expect, it } from 'vitest';
import {
  calendarDaysBetween,
  daysRemainingUntil,
  formatDaysRemainingLabel,
  isLicenseOperational,
  LICENSE_GRACE_PERIOD_DAYS,
  loadEnigmaLicense,
  parseDateOnlyUtc,
  renewalMessageForBand,
  utcToday,
} from '../../src/admin/license.js';
import {
  createPhase1Gateway,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';

describe('Enigma license renewal tracker', () => {
  const asOf = (isoDate: string) => {
    const d = parseDateOnlyUtc(isoDate);
    if (!d) throw new Error(`bad fixture date ${isoDate}`);
    return new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0),
    );
  };

  it('1. active license with more than 90 days remaining', () => {
    const lic = loadEnigmaLicense(
      {
        ENIGMA_LICENSE_ID: 'ENIGMA-2026-001',
        ENIGMA_LICENSE_CUSTOMER: 'Example Healthcare Organization',
        ENIGMA_LICENSE_START_DATE: '2026-09-01',
        ENIGMA_LICENSE_EXPIRATION_DATE: '2027-09-01',
        ENIGMA_LICENSE_DEPLOYMENT_TYPE: 'vpc',
      },
      asOf('2026-09-02'),
    );
    expect(lic).not.toBeNull();
    expect(lic!.status).toBe('ACTIVE');
    expect(lic!.operational).toBe(true);
    expect(lic!.days_remaining).toBeGreaterThan(90);
    expect(lic!.renewal_band).toBe('comfortable');
    expect(lic!.renewal_message).toBeNull();
    expect(formatDaysRemainingLabel(lic!.days_remaining, lic!.status)).toMatch(
      /days remaining$/,
    );
  });

  it('2. active license with 30 to 90 days remaining', () => {
    const lic = loadEnigmaLicense(
      {
        ENIGMA_LICENSE_EXPIRATION_DATE: '2026-11-01',
        ENIGMA_LICENSE_START_DATE: '2025-11-01',
      },
      asOf('2026-09-15'),
    );
    expect(lic!.status).toBe('ACTIVE');
    expect(lic!.operational).toBe(true);
    expect(lic!.days_remaining).toBeGreaterThanOrEqual(30);
    expect(lic!.days_remaining).toBeLessThanOrEqual(90);
    expect(lic!.renewal_band).toBe('approaching');
    expect(lic!.renewal_message).toBe('Renewal approaching');
  });

  it('3. active license with 7 to 29 days remaining', () => {
    const lic = loadEnigmaLicense(
      {
        ENIGMA_LICENSE_EXPIRATION_DATE: '2026-09-25',
        ENIGMA_LICENSE_START_DATE: '2025-09-25',
      },
      asOf('2026-09-12'),
    );
    expect(lic!.status).toBe('ACTIVE');
    expect(lic!.operational).toBe(true);
    expect(lic!.days_remaining).toBeGreaterThanOrEqual(7);
    expect(lic!.days_remaining).toBeLessThanOrEqual(29);
    expect(lic!.renewal_band).toBe('required_soon');
    expect(lic!.renewal_message).toBe('Renewal required soon');
  });

  it('4. active license with less than 7 days remaining', () => {
    const lic = loadEnigmaLicense(
      {
        ENIGMA_LICENSE_EXPIRATION_DATE: '2026-09-15',
        ENIGMA_LICENSE_START_DATE: '2025-09-15',
      },
      asOf('2026-09-12'),
    );
    expect(lic!.status).toBe('ACTIVE');
    expect(lic!.operational).toBe(true);
    expect(lic!.days_remaining).toBeLessThanOrEqual(6);
    expect(lic!.renewal_band).toBe('expires_soon');
    expect(lic!.renewal_message).toBe('License expires soon');
  });

  it('5. expired license enters 30-day grace (still operational)', () => {
    const lic = loadEnigmaLicense(
      {
        ENIGMA_LICENSE_EXPIRATION_DATE: '2026-09-01',
        ENIGMA_LICENSE_START_DATE: '2025-09-01',
      },
      asOf('2026-09-12'),
    );
    expect(lic!.status).toBe('GRACE');
    expect(lic!.operational).toBe(true);
    expect(lic!.days_remaining).toBe(0);
    expect(lic!.grace_days_remaining).toBe(19);
    expect(lic!.grace_ends_date).toBe('2026-10-01');
    expect(lic!.renewal_band).toBe('grace');
    expect(lic!.renewal_message).toContain('grace period');
    expect(
      formatDaysRemainingLabel(
        lic!.days_remaining,
        lic!.status,
        lic!.grace_days_remaining,
      ),
    ).toBe('Grace period: 19 days remaining');
  });

  it('5b. after grace period license is disabled (not operational)', () => {
    const lic = loadEnigmaLicense(
      {
        ENIGMA_LICENSE_EXPIRATION_DATE: '2026-08-01',
        ENIGMA_LICENSE_START_DATE: '2025-08-01',
      },
      asOf('2026-09-12'),
    );
    // Aug 1 + 30 days = Aug 31; Sep 12 is past grace
    expect(LICENSE_GRACE_PERIOD_DAYS).toBe(30);
    expect(lic!.status).toBe('DISABLED');
    expect(lic!.operational).toBe(false);
    expect(isLicenseOperational(lic)).toBe(false);
    expect(lic!.grace_days_remaining).toBe(0);
    expect(lic!.renewal_message).toContain('disabled');
    expect(formatDaysRemainingLabel(0, 'disabled')).toBe('Disabled');
  });

  it('6. correct calendar-day calculation (timezone-safe)', () => {
    const from = parseDateOnlyUtc('2026-09-01')!;
    const to = parseDateOnlyUtc('2026-09-11')!;
    expect(calendarDaysBetween(from, to)).toBe(10);
    expect(daysRemainingUntil('2026-09-11', asOf('2026-09-01'))).toBe(10);
    const late = new Date('2026-09-01T23:30:00-04:00');
    expect(utcToday(late).toISOString().slice(0, 10)).toBe('2026-09-02');
  });

  it('7. never displays negative days', () => {
    expect(formatDaysRemainingLabel(-5, 'disabled')).toBe('Disabled');
    expect(formatDaysRemainingLabel(-1, 'grace', 0)).toBe(
      'Grace period: 0 days remaining',
    );
    const lic = loadEnigmaLicense(
      {
        ENIGMA_LICENSE_START_DATE: '2024-01-01',
        ENIGMA_LICENSE_EXPIRATION_DATE: '2024-06-01',
      },
      asOf('2026-09-12'),
    );
    expect(lic!.days_remaining).toBeGreaterThanOrEqual(0);
    expect(lic!.grace_days_remaining).toBeGreaterThanOrEqual(0);
  });

  it('8. VPC deployment', () => {
    const lic = loadEnigmaLicense(
      {
        ENIGMA_LICENSE_DEPLOYMENT_TYPE: 'vpc',
        ENIGMA_LICENSE_START_DATE: '2026-01-01',
        ENIGMA_LICENSE_EXPIRATION_DATE: '2027-01-01',
      },
      asOf('2026-09-12'),
    );
    expect(lic!.deployment_type).toBe('vpc');
  });

  it('9. Air-Gapped deployment', () => {
    const lic = loadEnigmaLicense(
      {
        ENIGMA_LICENSE_DEPLOYMENT_TYPE: 'air_gapped',
        ENIGMA_LICENSE_START_DATE: '2026-01-01',
        ENIGMA_LICENSE_EXPIRATION_DATE: '2027-01-01',
        GATEWAY_DEPLOYMENT_MODE: 'airgap',
      },
      asOf('2026-09-12'),
    );
    expect(lic!.deployment_type).toBe('air_gapped');
  });

  it('10. renewal date and status fields are present', () => {
    const lic = loadEnigmaLicense(
      {
        ENIGMA_LICENSE_ID: 'ENIGMA-2026-001',
        ENIGMA_LICENSE_CUSTOMER: 'Example Healthcare Organization',
        ENIGMA_LICENSE_START_DATE: '2026-09-01',
        ENIGMA_LICENSE_EXPIRATION_DATE: '2027-09-01',
        ENIGMA_LICENSE_DEPLOYMENT_TYPE: 'vpc',
      },
      asOf('2026-09-12'),
    );
    expect(lic!.expiration_date).toBe('2027-09-01');
    expect(lic!.grace_ends_date).toBe('2027-10-01');
    expect(lic!.status).toBe('ACTIVE');
    expect(lic!.license_type).toBe('annual');
  });

  it('11. singular day remaining label', () => {
    expect(formatDaysRemainingLabel(1, 'active')).toBe('1 day remaining');
    expect(formatDaysRemainingLabel(0, 'grace', 1)).toBe(
      'Grace period: 1 day remaining',
    );
    expect(renewalMessageForBand('expires_soon')).toBe('License expires soon');
  });

  it('12. /v1/admin/system includes license when configuration is valid', async () => {
    const keys = [
      'ENIGMA_LICENSE_ID',
      'ENIGMA_LICENSE_CUSTOMER',
      'ENIGMA_LICENSE_START_DATE',
      'ENIGMA_LICENSE_EXPIRATION_DATE',
      'ENIGMA_LICENSE_DEPLOYMENT_TYPE',
    ] as const;
    const prev: Record<string, string | undefined> = {};
    for (const k of keys) prev[k] = process.env[k];

    process.env.ENIGMA_LICENSE_ID = 'ENIGMA-TEST-SYS';
    process.env.ENIGMA_LICENSE_CUSTOMER = 'Test Org';
    process.env.ENIGMA_LICENSE_START_DATE = '2026-01-01';
    process.env.ENIGMA_LICENSE_EXPIRATION_DATE = '2027-01-01';
    process.env.ENIGMA_LICENSE_DEPLOYMENT_TYPE = 'vpc';

    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/v1/admin/system',
        headers: { authorization: 'Bearer test_admin' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.license).toBeTruthy();
      expect(body.license.license_id).toBe('ENIGMA-TEST-SYS');
      expect(body.license.grace_ends_date).toBeTruthy();
      expect(typeof body.license.operational).toBe('boolean');
      expect(body.license.days_remaining).toBeGreaterThanOrEqual(0);
    } finally {
      await server.close();
      for (const k of keys) {
        if (prev[k] === undefined) delete process.env[k];
        else process.env[k] = prev[k];
      }
    }
  });

  it('13. invalid license dates fail safely (null)', () => {
    const lic = loadEnigmaLicense(
      {
        ENIGMA_LICENSE_START_DATE: 'not-a-date',
        ENIGMA_LICENSE_EXPIRATION_DATE: '2027-09-01',
      },
      asOf('2026-09-12'),
    );
    expect(lic).toBeNull();
    expect(isLicenseOperational(null)).toBe(false);
  });

  it('14. disabled license blocks AI completions and actions; admin system remains', async () => {
    const keys = [
      'ENIGMA_LICENSE_START_DATE',
      'ENIGMA_LICENSE_EXPIRATION_DATE',
    ] as const;
    const prev: Record<string, string | undefined> = {};
    for (const k of keys) prev[k] = process.env[k];

    process.env.ENIGMA_LICENSE_START_DATE = '2024-01-01';
    process.env.ENIGMA_LICENSE_EXPIRATION_DATE = '2024-06-01';

    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    try {
      const blocked = await server.inject({
        method: 'POST',
        url: '/v1/ai/completions',
        headers: { authorization: `Bearer ${PHASE1_DEMO_API_KEY}` },
        payload: {
          application_id: 'app_clinical',
          user: { id: 'user_clinician' },
          operation: 'summarize',
          messages: [{ role: 'user', content: 'hello' }],
        },
      });
      expect(blocked.statusCode).toBe(403);
      expect(blocked.json().reason_code).toBe('LICENSE_DISABLED');

      const blockedAction = await server.inject({
        method: 'POST',
        url: '/v1/ai/actions',
        headers: { authorization: `Bearer ${PHASE1_DEMO_API_KEY}` },
        payload: {
          application_id: 'app_clinical',
          user: { id: 'user_clinician' },
          operation: 'write',
          messages: [{ role: 'user', content: 'note MRN 1 DOB 1980-01-01' }],
        },
      });
      expect(blockedAction.statusCode).toBe(403);
      expect(blockedAction.json().reason_code).toBe('LICENSE_DISABLED');

      const system = await server.inject({
        method: 'GET',
        url: '/v1/admin/system',
        headers: { authorization: 'Bearer test_admin' },
      });
      expect(system.statusCode).toBe(200);
      expect(system.json().license.status).toBe('DISABLED');
      expect(system.json().license.operational).toBe(false);
    } finally {
      await server.close();
      for (const k of keys) {
        if (prev[k] === undefined) delete process.env[k];
        else process.env[k] = prev[k];
      }
    }
  });

  it('defaults to development license when env unset', () => {
    const lic = loadEnigmaLicense({}, asOf('2026-09-12'));
    expect(lic).not.toBeNull();
    expect(lic!.license_id).toBe('ENIGMA-DEV-001');
    expect(lic!.status).toBe('ACTIVE');
    expect(lic!.operational).toBe(true);
  });
});
