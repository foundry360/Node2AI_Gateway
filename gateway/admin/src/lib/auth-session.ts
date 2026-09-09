import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'enigma_admin_session';
export const SESSION_MAX_AGE_SEC = 60 * 60 * 12; // 12h

export type AdminRole =
  | 'ADMINISTRATOR'
  | 'GOVERNANCE_REVIEWER'
  | 'OPERATOR'
  | 'READ_ONLY';

export type AdminSession = {
  sub: string;
  name: string;
  role: AdminRole;
  organization_id: string;
  status: 'ACTIVE' | 'DISABLED';
  /** Gateway-verifiable bearer token (preferred). */
  gateway_token?: string;
};

function sessionSecret(): Uint8Array {
  const raw =
    process.env.ADMIN_SESSION_SECRET ??
    process.env.GATEWAY_ADMIN_API_KEY ??
    'enigma-admin-dev-session-secret';
  return new TextEncoder().encode(raw);
}

export async function createSessionToken(session: AdminSession): Promise<string> {
  return new SignJWT({
    name: session.name,
    role: session.role,
    organization_id: session.organization_id,
    status: session.status,
    gateway_token: session.gateway_token,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(session.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SEC}s`)
    .sign(sessionSecret());
}

export async function readSessionToken(
  token: string | undefined,
): Promise<AdminSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret());
    const sub = typeof payload.sub === 'string' ? payload.sub : null;
    const name = typeof payload.name === 'string' ? payload.name : sub;
    const role = String(payload.role ?? 'ADMINISTRATOR').toUpperCase() as AdminRole;
    const organization_id =
      typeof payload.organization_id === 'string'
        ? payload.organization_id
        : 'org_demo';
    const status =
      String(payload.status ?? 'ACTIVE').toUpperCase() === 'DISABLED'
        ? 'DISABLED'
        : 'ACTIVE';
    const gateway_token =
      typeof payload.gateway_token === 'string' ? payload.gateway_token : undefined;
    if (!sub) return null;
    return {
      sub,
      name: name ?? sub,
      role,
      organization_id,
      status,
      gateway_token,
    };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SEC,
  };
}

export function roleHasCapability(
  role: AdminRole,
  capability: 'read' | 'admin_mutate' | 'governance_resolve' | 'export',
): boolean {
  switch (capability) {
    case 'read':
      return true;
    case 'admin_mutate':
      return role === 'ADMINISTRATOR';
    case 'governance_resolve':
      return role === 'ADMINISTRATOR' || role === 'GOVERNANCE_REVIEWER';
    case 'export':
      return (
        role === 'ADMINISTRATOR' ||
        role === 'GOVERNANCE_REVIEWER' ||
        role === 'OPERATOR'
      );
    default:
      return false;
  }
}
