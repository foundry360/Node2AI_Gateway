/**
 * Installation-scoped deployment identity (Phase 1).
 *
 * Generated once per Enigma installation and persisted in durable state.
 * Not a license ID, organization ID, or governance fact.
 * Phase 2 signed licenses bind to this ID via cryptographic claims.
 */

import { randomUUID } from 'node:crypto';
import type { PgQueryable } from '../shared/pg.js';

export const DEPLOYMENT_ID_CONFIG_KEY = 'deployment_id';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidDeploymentId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

export interface DeploymentIdentityStore {
  getOrCreateDeploymentId(): Promise<string>;
}

/** In-process store — used when Postgres is not configured (tests / memory mode). */
export class InMemoryDeploymentIdentityStore implements DeploymentIdentityStore {
  constructor(private readonly state: { deployment_id?: string } = {}) {}

  async getOrCreateDeploymentId(): Promise<string> {
    if (isValidDeploymentId(this.state.deployment_id)) {
      return this.state.deployment_id;
    }
    const id = randomUUID();
    this.state.deployment_id = id;
    return id;
  }
}

/**
 * Durable store backed by `system_config`.
 * Concurrent first-boot: INSERT … ON CONFLICT DO NOTHING then re-read winner.
 */
export class PostgresDeploymentIdentityStore implements DeploymentIdentityStore {
  constructor(private readonly db: PgQueryable) {}

  async getOrCreateDeploymentId(): Promise<string> {
    const existing = await this.read();
    if (existing) return existing;

    const candidate = randomUUID();
    await this.db.query(
      `INSERT INTO system_config (key, value, updated_at)
       VALUES ($1, to_jsonb($2::text), now())
       ON CONFLICT (key) DO NOTHING`,
      [DEPLOYMENT_ID_CONFIG_KEY, candidate],
    );

    const persisted = await this.read();
    if (persisted) return persisted;

    // Extremely unlikely: insert raced then row vanished — fall back to candidate write.
    await this.db.query(
      `INSERT INTO system_config (key, value, updated_at)
       VALUES ($1, to_jsonb($2::text), now())
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, updated_at = now()
       WHERE system_config.value IS NULL
          OR jsonb_typeof(system_config.value) <> 'string'`,
      [DEPLOYMENT_ID_CONFIG_KEY, candidate],
    );
    const again = await this.read();
    if (again) return again;
    return candidate;
  }

  private async read(): Promise<string | null> {
    const result = await this.db.query(
      `SELECT value FROM system_config WHERE key = $1`,
      [DEPLOYMENT_ID_CONFIG_KEY],
    );
    const raw = result.rows[0]?.value;
    if (typeof raw === 'string' && isValidDeploymentId(raw)) {
      return raw.trim();
    }
    // Some drivers may return JSON already unwrapped; reject non-UUID.
    if (raw && typeof raw === 'object' && raw !== null && 'toString' in raw) {
      return null;
    }
    return null;
  }
}

export async function getOrCreateDeploymentId(
  store: DeploymentIdentityStore,
): Promise<string> {
  return store.getOrCreateDeploymentId();
}
