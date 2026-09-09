import type { AdminUserRecord, AdminUserStore } from './authz.js';
import type { AdminRole, AdminUserStatus } from './roles.js';
import type { PgQueryable } from '../shared/pg.js';

function mapRow(row: Record<string, unknown>): AdminUserRecord {
  return {
    user_id: String(row.user_id),
    organization_id: String(row.organization_id),
    username: String(row.username),
    password_hash: String(row.password_hash),
    role: String(row.role).toUpperCase() as AdminRole,
    status: String(row.status).toUpperCase() as AdminUserStatus,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export class InMemoryAdminUserStore implements AdminUserStore {
  private readonly users = new Map<string, AdminUserRecord>();

  constructor(seed: AdminUserRecord[] = []) {
    for (const u of seed) {
      this.users.set(u.user_id, { ...u });
    }
  }

  async getByUsername(username: string): Promise<AdminUserRecord | null> {
    const needle = username.trim().toLowerCase();
    for (const u of this.users.values()) {
      if (u.username.toLowerCase() === needle) return { ...u };
    }
    return null;
  }

  async getById(userId: string): Promise<AdminUserRecord | null> {
    const u = this.users.get(userId);
    return u ? { ...u } : null;
  }

  async listByOrganization(organizationId: string): Promise<AdminUserRecord[]> {
    return [...this.users.values()]
      .filter((u) => u.organization_id === organizationId)
      .map((u) => ({ ...u }));
  }

  async create(user: AdminUserRecord): Promise<AdminUserRecord> {
    if (this.users.has(user.user_id)) {
      throw new Error(`Admin user already exists: ${user.user_id}`);
    }
    this.users.set(user.user_id, { ...user });
    return { ...user };
  }

  async update(
    userId: string,
    patch: Partial<
      Pick<AdminUserRecord, 'role' | 'status' | 'password_hash' | 'updated_at'>
    >,
  ): Promise<AdminUserRecord | null> {
    const existing = this.users.get(userId);
    if (!existing) return null;
    const next = { ...existing, ...patch, updated_at: patch.updated_at ?? new Date().toISOString() };
    this.users.set(userId, next);
    return { ...next };
  }
}

export class PgAdminUserStore implements AdminUserStore {
  constructor(private readonly db: PgQueryable) {}

  async getByUsername(username: string): Promise<AdminUserRecord | null> {
    const res = await this.db.query(
      `SELECT * FROM admin_users WHERE lower(username) = lower($1) LIMIT 1`,
      [username],
    );
    const row = res.rows[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  }

  async getById(userId: string): Promise<AdminUserRecord | null> {
    const res = await this.db.query(
      `SELECT * FROM admin_users WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    const row = res.rows[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  }

  async listByOrganization(organizationId: string): Promise<AdminUserRecord[]> {
    const res = await this.db.query(
      `SELECT * FROM admin_users WHERE organization_id = $1 ORDER BY username`,
      [organizationId],
    );
    return (res.rows as Record<string, unknown>[]).map(mapRow);
  }

  async create(user: AdminUserRecord): Promise<AdminUserRecord> {
    await this.db.query(
      `INSERT INTO admin_users (
         user_id, organization_id, username, password_hash, role, status, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz,$8::timestamptz)`,
      [
        user.user_id,
        user.organization_id,
        user.username,
        user.password_hash,
        user.role,
        user.status,
        user.created_at,
        user.updated_at,
      ],
    );
    return user;
  }

  async update(
    userId: string,
    patch: Partial<
      Pick<AdminUserRecord, 'role' | 'status' | 'password_hash' | 'updated_at'>
    >,
  ): Promise<AdminUserRecord | null> {
    const existing = await this.getById(userId);
    if (!existing) return null;
    const next = {
      ...existing,
      ...patch,
      updated_at: patch.updated_at ?? new Date().toISOString(),
    };
    await this.db.query(
      `UPDATE admin_users
       SET role = $2, status = $3, password_hash = $4, updated_at = $5::timestamptz
       WHERE user_id = $1`,
      [userId, next.role, next.status, next.password_hash, next.updated_at],
    );
    return next;
  }
}
