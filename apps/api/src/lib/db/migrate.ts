/**
 * Node2AI Database Migration Runner
 * Handles database migrations, schema updates, and maintenance tasks
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import db from './client';

interface MigrationResult {
  success: boolean;
  message: string;
  duration: number;
  error?: string;
}

class MigrationRunner {
  private migrationsPath: string;

  constructor() {
    this.migrationsPath = join(__dirname, 'migrations');
  }

  /**
   * Run all pending migrations
   */
  async runMigrations(): Promise<MigrationResult[]> {
    const results: MigrationResult[] = [];

    try {
      // Check if database is accessible
      await db.$connect();

      // Run Prisma migrations first
      const prismaResult = await this.runPrismaMigrations();
      results.push(prismaResult);

      if (!prismaResult.success) {
        return results;
      }

      // Run custom SQL migrations
      const sqlMigrations = await this.getSqlMigrations();

      for (const migration of sqlMigrations) {
        const result = await this.runSqlMigration(migration);
        results.push(result);

        if (!result.success) {
          break;
        }
      }

      return results;
    } catch (error) {
      results.push({
        success: false,
        message: 'Migration runner failed',
        duration: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return results;
    } finally {
      await db.$disconnect();
    }
  }

  /**
   * Run Prisma migrations
   */
  private async runPrismaMigrations(): Promise<MigrationResult> {
    const startTime = Date.now();

    try {
      console.log('Running Prisma migrations...');

      // Generate Prisma client
      execSync('npx prisma generate', { stdio: 'inherit' });

      // Run database migrations
      execSync('npx prisma db push', { stdio: 'inherit' });

      const duration = Date.now() - startTime;

      return {
        success: true,
        message: 'Prisma migrations completed successfully',
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      return {
        success: false,
        message: 'Prisma migrations failed',
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get list of SQL migration files
   */
  private async getSqlMigrations(): Promise<string[]> {
    const migrations: string[] = [];

    // Check for migration files in order
    let index = 1;
    while (true) {
      const migrationFile = join(
        this.migrationsPath,
        `${index.toString().padStart(3, '0')}_*.sql`
      );
      const files = this.globFiles(migrationFile);

      if (files.length === 0) {
        break;
      }

      migrations.push(files[0]);
      index++;
    }

    return migrations;
  }

  /**
   * Run a single SQL migration
   */
  private async runSqlMigration(
    migrationFile: string
  ): Promise<MigrationResult> {
    const startTime = Date.now();

    try {
      console.log(`Running migration: ${migrationFile}`);

      const sql = readFileSync(migrationFile, 'utf-8');

      // Split SQL into individual statements
      const statements = sql
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

      // Execute each statement
      for (const statement of statements) {
        if (statement.trim()) {
          await db.$executeRawUnsafe(statement);
        }
      }

      const duration = Date.now() - startTime;

      return {
        success: true,
        message: `Migration ${migrationFile} completed successfully`,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      return {
        success: false,
        message: `Migration ${migrationFile} failed`,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Simple glob-like file matching
   */
  private globFiles(pattern: string): string[] {
    const fs = require('fs');
    const path = require('path');

    const dir = path.dirname(pattern);
    const base = path.basename(pattern);
    const regex = new RegExp(base.replace(/\*/g, '.*'));

    try {
      const files = fs.readdirSync(dir);
      return files
        .filter(file => regex.test(file))
        .map(file => path.join(dir, file));
    } catch {
      return [];
    }
  }

  /**
   * Check database health
   */
  async checkHealth(): Promise<{
    database: boolean;
    extensions: boolean;
    tables: boolean;
    indexes: boolean;
    functions: boolean;
    details: any;
  }> {
    try {
      await db.$connect();

      // Check required extensions
      const extensions = await db.$queryRaw<Array<{ extname: string }>>`
        SELECT extname FROM pg_extension 
        WHERE extname IN ('vector', 'uuid-ossp', 'pg_trgm', 'btree_gin')
      `;

      // Check tables exist
      const tables = await db.$queryRaw<Array<{ table_name: string }>>`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      `;

      // Check indexes exist
      const indexes = await db.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname FROM pg_indexes 
        WHERE schemaname = 'public'
      `;

      // Check functions exist
      const functions = await db.$queryRaw<Array<{ routine_name: string }>>`
        SELECT routine_name FROM information_schema.routines 
        WHERE routine_schema = 'public' 
        AND routine_type = 'FUNCTION'
      `;

      return {
        database: true,
        extensions: extensions.length >= 4,
        tables: tables.length >= 10,
        indexes: indexes.length >= 20,
        functions: functions.length >= 5,
        details: {
          extensions: extensions.map(e => e.extname),
          tableCount: tables.length,
          indexCount: indexes.length,
          functionCount: functions.length,
        },
      };
    } catch (error) {
      return {
        database: false,
        extensions: false,
        tables: false,
        indexes: false,
        functions: false,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    } finally {
      await db.$disconnect();
    }
  }

  /**
   * Run maintenance tasks
   */
  async runMaintenance(): Promise<{
    tokenCleanup: number;
    partitionCreated: string;
    auditCleanup: number;
    duration: number;
  }> {
    const startTime = Date.now();

    try {
      await db.$connect();

      // Clean up old tokens (30-day retention)
      const tokenCleanup = await db.$queryRaw<[{ cleanup_count: number }]>`
        DELETE FROM session_tokens WHERE created_at < NOW() - INTERVAL '30 days'
      `;

      // Clean up old audit logs (7-year retention)
      const auditCleanup = await db.$queryRaw<[{ cleanup_count: number }]>`
        DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '7 years'
      `;

      const duration = Date.now() - startTime;

      return {
        tokenCleanup: 0,
        partitionCreated: '',
        auditCleanup: 0,
        duration,
      };
    } catch (error) {
      throw new Error(
        `Maintenance failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      await db.$disconnect();
    }
  }

  /**
   * Create initial organization and admin user
   */
  async createInitialData(): Promise<{
    organizationId: string;
    adminUserId: string;
    apiKeyId: string;
  }> {
    try {
      await db.$connect();

      // Create default organization
      const organization = await db.organization.create({
        data: {
          id: '00000000-0000-0000-0000-000000000001',
          name: 'Default Organization',
          deploymentMode: 'self-hosted',
          licenseTier: 'enterprise',
          maxInstances: 1,
        },
      });

      // Create admin user
      const adminUser = await db.user.create({
        data: {
          id: '00000000-0000-0000-0000-000000000001',
          organizationId: organization.id,
          email: 'admin@node2.ai',
          name: 'Administrator',
          role: 'admin',
          passwordHash:
            '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password: password
        },
      });

      // Create default API key
      const apiKey = await db.apiKey.create({
        data: {
          organizationId: organization.id,
          name: 'Default API Key',
          keyHash: 'sha256$' + Buffer.from('dev-api-key-123').toString('hex'),
          rateLimitPerMinute: 1000,
          createdBy: adminUser.id,
        },
      });

      return {
        organizationId: organization.id,
        adminUserId: adminUser.id,
        apiKeyId: apiKey.id,
      };
    } catch (error) {
      throw new Error(
        `Failed to create initial data: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      await db.$disconnect();
    }
  }

  /**
   * Reset database (development only)
   */
  async resetDatabase(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Database reset is not allowed in production');
    }

    try {
      console.log('Resetting database...');

      // Drop all tables
      execSync('npx prisma db push --force-reset', { stdio: 'inherit' });

      console.log('Database reset completed');
    } catch (error) {
      throw new Error(
        `Database reset failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

export default MigrationRunner;
export { MigrationRunner };
