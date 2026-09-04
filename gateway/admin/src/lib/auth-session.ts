import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'enigma_admin_session';
export const SESSION_MAX_AGE_SEC = 60 * 60 * 12; // 12h

export type AdminSession = {
  sub: string;
  name: string;
};

function sessionSecret(): Uint8Array {
  const raw =
    process.env.ADMIN_SESSION_SECRET ??
    process.env.GATEWAY_ADMIN_API_KEY ??
    'enigma-admin-dev-session-secret';
  return new TextEncoder().encode(raw);
}

export async function createSessionToken(session: AdminSession): Promise<string> {
  return new SignJWT({ name: session.name })
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
    if (!sub) return null;
    return { sub, name: name ?? sub };
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
