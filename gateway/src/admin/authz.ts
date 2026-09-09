import { createHmac, timingSafeEqual, scryptSync, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { GatewayConfig } from '../shared/config.js';
import {
  type AdminCapability,
  type AdminRole,
  type AdminUserStatus,
  isActiveAdminStatus,
  parseAdminRole,
  roleHasCapability,
} from './roles.js';

export interface AdminPrincipal {
  user_id: string;
  name: string;
  organization_id: string;
  role: AdminRole;
  status: AdminUserStatus;
  auth_method: 'api_key' | 'session' | 'approver_key' | 'activator_key';
}

export interface AdminUserRecord {
  user_id: string;
  organization_id: string;
  username: string;
  /** scrypt hash (salt:hex) — never return in API responses */
  password_hash: string;
  role: AdminRole;
  status: AdminUserStatus;
  created_at: string;
  updated_at: string;
}

export interface AdminUserStore {
  getByUsername(username: string): Promise<AdminUserRecord | null>;
  getById(userId: string): Promise<AdminUserRecord | null>;
  listByOrganization(organizationId: string): Promise<AdminUserRecord[]>;
  create(user: AdminUserRecord): Promise<AdminUserRecord>;
  update(
    userId: string,
    patch: Partial<
      Pick<AdminUserRecord, 'role' | 'status' | 'password_hash' | 'updated_at'>
    >,
  ): Promise<AdminUserRecord | null>;
}

export function hashAdminPassword(password: string, salt?: string): string {
  const s = salt ?? randomBytes(16).toString('hex');
  const derived = scryptSync(password, s, 32).toString('hex');
  return `${s}:${derived}`;
}

export function verifyAdminPassword(
  password: string,
  stored: string,
): boolean {
  const [salt, expected] = stored.split(':');
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 32).toString('hex');
  try {
    return timingSafeEqual(
      Buffer.from(actual, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  } catch {
    return false;
  }
}

export function publicAdminUser(user: AdminUserRecord) {
  return {
    user_id: user.user_id,
    organization_id: user.organization_id,
    username: user.username,
    role: user.role,
    status: user.status,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

function extractBearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(/\s+/);
  if (!scheme || !token) return undefined;
  if (scheme.toLowerCase() !== 'bearer') return undefined;
  return token;
}

function sessionSecretBytes(config: GatewayConfig): Uint8Array {
  const raw =
    process.env.ADMIN_SESSION_SECRET ??
    process.env.GATEWAY_ADMIN_SESSION_SECRET ??
    config.adminApiKey;
  return new TextEncoder().encode(raw);
}

export async function issueAdminSessionToken(
  principal: Pick<
    AdminPrincipal,
    'user_id' | 'name' | 'organization_id' | 'role' | 'status'
  >,
  config: GatewayConfig,
  maxAgeSec = 60 * 60 * 12,
): Promise<string> {
  return new SignJWT({
    name: principal.name,
    organization_id: principal.organization_id,
    role: principal.role,
    status: principal.status,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(principal.user_id)
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSec}s`)
    .sign(sessionSecretBytes(config));
}

export async function readAdminSessionToken(
  token: string,
  config: GatewayConfig,
): Promise<AdminPrincipal | null> {
  try {
    const { payload } = await jwtVerify(token, sessionSecretBytes(config));
    const sub = typeof payload.sub === 'string' ? payload.sub : null;
    const role = parseAdminRole(payload.role);
    const organization_id =
      typeof payload.organization_id === 'string'
        ? payload.organization_id
        : null;
    const status = String(payload.status ?? 'ACTIVE').toUpperCase() as AdminUserStatus;
    if (!sub || !role || !organization_id) return null;
    if (!isActiveAdminStatus(status)) return null;
    return {
      user_id: sub,
      name:
        typeof payload.name === 'string' ? payload.name : sub,
      organization_id,
      role,
      status: 'ACTIVE',
      auth_method: 'session',
    };
  } catch {
    return null;
  }
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const ha = createHmac('sha256', 'enigma-admin-key').update(a).digest();
  const hb = createHmac('sha256', 'enigma-admin-key').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export type AuthenticateAdminOptions = {
  config: GatewayConfig;
  authorizationHeader?: string;
  adminUsers?: AdminUserStore;
  /** Default org for machine API keys (appliance single-tenant). */
  defaultOrganizationId?: string;
};

/**
 * Resolve an admin principal from Bearer token.
 * Supports: machine admin/approver/activator keys, or admin session JWT.
 */
export async function authenticateAdmin(
  opts: AuthenticateAdminOptions,
): Promise<AdminPrincipal | null> {
  const token = extractBearer(opts.authorizationHeader);
  if (!token) return null;

  const org =
    opts.defaultOrganizationId ??
    process.env.GATEWAY_DEFAULT_ORGANIZATION_ID ??
    'org_demo';

  if (timingSafeStringEqual(token, opts.config.adminApiKey)) {
    return {
      user_id: 'admin_api_key',
      name: 'admin_api_key',
      organization_id: org,
      role: 'ADMINISTRATOR',
      status: 'ACTIVE',
      auth_method: 'api_key',
    };
  }

  if (timingSafeStringEqual(token, opts.config.policyApproverKey)) {
    return {
      user_id: 'approver_api_key',
      name: 'approver_api_key',
      organization_id: org,
      role: 'GOVERNANCE_REVIEWER',
      status: 'ACTIVE',
      auth_method: 'approver_key',
    };
  }

  if (timingSafeStringEqual(token, opts.config.policyActivatorKey)) {
    return {
      user_id: 'activator_api_key',
      name: 'activator_api_key',
      organization_id: org,
      role: 'ADMINISTRATOR',
      status: 'ACTIVE',
      auth_method: 'activator_key',
    };
  }

  const fromJwt = await readAdminSessionToken(token, opts.config);
  if (fromJwt) {
    if (opts.adminUsers) {
      const row = await opts.adminUsers.getById(fromJwt.user_id);
      if (row) {
        if (!isActiveAdminStatus(row.status)) return null;
        return {
          ...fromJwt,
          organization_id: row.organization_id,
          role: row.role,
          status: row.status,
          name: row.username,
        };
      }
    }
    return fromJwt;
  }

  return null;
}

export function requireCapability(
  principal: AdminPrincipal | null,
  capability: AdminCapability,
): { ok: true; principal: AdminPrincipal } | { ok: false; status: 401 | 403; reason: string } {
  if (!principal) {
    return { ok: false, status: 401, reason: 'UNAUTHENTICATED' };
  }
  if (!isActiveAdminStatus(principal.status)) {
    return { ok: false, status: 403, reason: 'USER_DISABLED' };
  }
  if (!roleHasCapability(principal.role, capability)) {
    return { ok: false, status: 403, reason: 'FORBIDDEN' };
  }
  return { ok: true, principal };
}

/** Enforce resource belongs to the principal's organization. */
export function requireOrganizationScope(
  principal: AdminPrincipal,
  resourceOrganizationId: string | null | undefined,
): boolean {
  if (!resourceOrganizationId) return false;
  return principal.organization_id === resourceOrganizationId;
}

export function filterByOrganization<T extends { organization_id?: string }>(
  principal: AdminPrincipal,
  rows: T[],
): T[] {
  return rows.filter(
    (r) =>
      r.organization_id != null &&
      r.organization_id === principal.organization_id,
  );
}
