/**
 * Database integration for License Management
 * Handles persistence and retrieval of licenses from PostgreSQL
 */

import { Pool, PoolConfig, QueryResult, QueryResultRow } from 'pg';
import { License } from './index';

export interface DatabaseConfig {
  connectionString?: string;
  pool?: Pool;
  poolConfig?: PoolConfig;
}

type NullableQueryResult<T extends QueryResultRow> =
  | QueryResult<T>
  | { rows: T[] };

export class LicenseDatabase {
  private pool: Pool | null;

  constructor(config?: DatabaseConfig) {
    if (config?.pool) {
      this.pool = config.pool;
    } else {
      const connectionString =
        config?.connectionString || process.env.DATABASE_URL || null;

      if (connectionString) {
        this.pool = new Pool({
          connectionString,
          ssl:
            process.env.NODE_ENV === 'production'
              ? { rejectUnauthorized: false }
              : false,
          ...config?.poolConfig,
        });
      } else {
        this.pool = null;
        console.warn(
          '[LicenseDatabase] No DATABASE_URL provided. License operations will be skipped.'
        );
      }
    }
  }

  private async runQuery<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: any[] = []
  ): Promise<NullableQueryResult<T>> {
    if (!this.pool) {
      console.warn(
        '[LicenseDatabase] Query skipped because no database connection is configured.'
      );
      return { rows: [] };
    }

    try {
      return await this.pool.query<T>(text, params);
    } catch (error) {
      console.error('[LicenseDatabase] Query error:', error);
      throw error;
    }
  }

  async saveLicense(license: License, organizationId: string): Promise<void> {
    if (!this.pool) return;

    await this.runQuery(
      `
        INSERT INTO licenses (
          organization_id,
          license_key,
          organization_name,
          max_seats,
          max_monthly_api_calls,
          max_storage_gb,
          issued_at,
          expires_at,
          tier,
          features,
          signature,
          status,
          current_seat_count,
          current_monthly_api_calls,
          current_storage_gb
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          'active', 0, 0, 0
        )
      `,
      [
        organizationId,
        license.key,
        license.organizationName,
        license.maxSeats,
        license.maxMonthlyApiCalls ?? null,
        license.maxStorageGB ?? null,
        license.issuedAt.toISOString(),
        license.expiresAt.toISOString(),
        license.tier,
        JSON.stringify(license.features || []),
        license.signature,
      ]
    );
  }

  async loadLicenseByKey(licenseKey: string): Promise<License | null> {
    if (!this.pool) return null;

    const result = await this.runQuery(
      `SELECT * FROM licenses WHERE license_key = $1 LIMIT 1`,
      [licenseKey]
    );

    const row = result.rows[0];
    if (!row) return null;

    return this.mapDatabaseRowToLicense(row);
  }

  async loadLicenseByOrganization(
    organizationId: string
  ): Promise<License | null> {
    if (!this.pool) return null;

    const result = await this.runQuery(
      `
        SELECT *
        FROM licenses
        WHERE organization_id = $1
          AND status = 'active'
        ORDER BY expires_at DESC
        LIMIT 1
      `,
      [organizationId]
    );

    const row = result.rows[0];
    if (!row) return null;

    return this.mapDatabaseRowToLicense(row);
  }

  async recordValidation(licenseKey: string, valid: boolean): Promise<void> {
    if (!this.pool) return;

    await this.runQuery(
      `
        UPDATE licenses
        SET
          last_validated_at = NOW(),
          validation_count = COALESCE(validation_count, 0) + 1,
          updated_at = NOW()
        WHERE license_key = $1
      `,
      [licenseKey]
    );
  }

  async updateUsage(
    licenseKey: string,
    metrics: {
      currentSeatCount?: number;
      currentMonthlyApiCalls?: number;
      currentStorageGB?: number;
    }
  ): Promise<void> {
    if (!this.pool) return;

    const updateData: string[] = [];
    const params: any[] = [];

    if (metrics.currentSeatCount !== undefined) {
      updateData.push(`current_seat_count = $${updateData.length + 2}`);
      params.push(metrics.currentSeatCount);
    }

    if (metrics.currentMonthlyApiCalls !== undefined) {
      updateData.push(`current_monthly_api_calls = $${updateData.length + 2}`);
      params.push(metrics.currentMonthlyApiCalls);
    }

    if (metrics.currentStorageGB !== undefined) {
      updateData.push(`current_storage_gb = $${updateData.length + 2}`);
      params.push(metrics.currentStorageGB);
    }

    if (updateData.length === 0) return;

    await this.runQuery(
      `
        UPDATE licenses
        SET ${updateData.join(', ')}, updated_at = NOW()
        WHERE license_key = $1
      `,
      [licenseKey, ...params]
    );
  }

  async getCurrentSeatCount(organizationId: string): Promise<number> {
    if (!this.pool) return 0;

    const result = await this.runQuery<{ count: number | string }>(
      `
        SELECT COUNT(*)::int AS count
        FROM users
        WHERE organization_id = $1
          AND is_active = true
      `,
      [organizationId]
    );

    const count = result.rows[0]?.count;
    return typeof count === 'string' ? parseInt(count, 10) || 0 : count || 0;
  }

  async getCurrentMonthApiCallCount(organizationId: string): Promise<number> {
    if (!this.pool) return 0;

    const result = await this.runQuery<{ count: number | string }>(
      `
        SELECT COUNT(*)::int AS count
        FROM usage_events
        WHERE organization_id = $1
          AND timestamp >= date_trunc('month', NOW())
          AND timestamp < date_trunc('month', NOW()) + interval '1 month'
      `,
      [organizationId]
    );

    const count = result.rows[0]?.count;
    return typeof count === 'string' ? parseInt(count, 10) || 0 : count || 0;
  }

  async syncUsageMetrics(organizationId: string): Promise<void> {
    if (!this.pool) return;

    const [apiCalls, seats] = await Promise.all([
      this.getCurrentMonthApiCallCount(organizationId),
      this.getCurrentSeatCount(organizationId),
    ]);

    await this.runQuery(
      `
        UPDATE licenses
        SET
          current_seat_count = $2,
          current_monthly_api_calls = $3,
          updated_at = NOW()
        WHERE organization_id = $1
      `,
      [organizationId, seats, apiCalls]
    );
  }

  async getLicenseSummary(organizationId: string): Promise<any> {
    if (!this.pool) return null;

    const result = await this.runQuery(
      `
        SELECT *
        FROM active_licenses_summary
        WHERE organization_id = $1
        LIMIT 1
      `,
      [organizationId]
    );

    return result.rows[0] || null;
  }

  async getLicenseStatus(licenseKey: string): Promise<{
    status: string;
    expiresAt: Date | null;
  } | null> {
    if (!this.pool) return null;

    const result = await this.runQuery(
      `
        SELECT status, expires_at
        FROM licenses
        WHERE license_key = $1
        LIMIT 1
      `,
      [licenseKey]
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      status: row.status,
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    };
  }

  async updateExpiration(
    licenseKey: string,
    newExpirationDate: Date,
    reason?: string
  ): Promise<void> {
    if (!this.pool) return;

    await this.runQuery(
      `
        UPDATE licenses
        SET
          expires_at = $2,
          notes = $3,
          updated_at = NOW()
        WHERE license_key = $1
      `,
      [
        licenseKey,
        newExpirationDate.toISOString(),
        reason ? `Expiration updated: ${reason}` : 'Expiration date updated',
      ]
    );
  }

  async revokeLicense(licenseKey: string, reason?: string): Promise<void> {
    if (!this.pool) return;

    await this.runQuery(
      `
        UPDATE licenses
        SET
          status = 'revoked',
          notes = $2,
          updated_at = NOW()
        WHERE license_key = $1
      `,
      [licenseKey, reason ? `Revoked: ${reason}` : 'License revoked']
    );
  }

  async suspendLicense(licenseKey: string, reason?: string): Promise<void> {
    if (!this.pool) return;

    await this.runQuery(
      `
        UPDATE licenses
        SET
          status = 'suspended',
          notes = $2,
          updated_at = NOW()
        WHERE license_key = $1
      `,
      [licenseKey, reason ? `Suspended: ${reason}` : 'License suspended']
    );
  }

  async reactivateLicense(licenseKey: string): Promise<void> {
    if (!this.pool) return;

    await this.runQuery(
      `
        UPDATE licenses
        SET
          status = 'active',
          notes = 'License reactivated',
          updated_at = NOW()
        WHERE license_key = $1
      `,
      [licenseKey]
    );
  }

  private mapDatabaseRowToLicense(row: any): License {
    return {
      key: row.license_key,
      organizationName: row.organization_name,
      organizationId: row.organization_id,
      maxSeats: row.max_seats,
      maxMonthlyApiCalls: row.max_monthly_api_calls || undefined,
      maxStorageGB: row.max_storage_gb || undefined,
      issuedAt: new Date(row.issued_at),
      expiresAt: new Date(row.expires_at),
      features: Array.isArray(row.features)
        ? row.features
        : row.features
          ? typeof row.features === 'string'
            ? JSON.parse(row.features)
            : []
          : [],
      tier: row.tier,
      signature: row.signature,
    };
  }
}

export function createLicenseDatabase(
  config?: DatabaseConfig
): LicenseDatabase {
  return new LicenseDatabase(config);
}

export async function getLicenseFromEnv(): Promise<License | null> {
  const licenseKey = process.env.LICENSE_KEY;
  if (!licenseKey) return null;

  const db = createLicenseDatabase({
    connectionString: process.env.DATABASE_URL,
  });

  return db.loadLicenseByKey(licenseKey);
}
