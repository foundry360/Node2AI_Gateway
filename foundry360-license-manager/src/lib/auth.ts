import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import type { UserRole } from '@prisma/client';

const COOKIE = 'f360_lm_session';

export type SessionUser = {
  id: string;
  username: string;
  role: UserRole;
};

function secretKey() {
  const s = process.env.SESSION_SECRET || 'dev-only-insecure-session-secret';
  return new TextEncoder().encode(s);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({
    sub: user.id,
    username: user.username,
    role: user.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(secretKey());
}

export async function readSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const id = String(payload.sub || '');
    const username = String(payload.username || '');
    const role = String(payload.role || '') as UserRole;
    if (!id || !username || (role !== 'ADMINISTRATOR' && role !== 'VIEWER')) {
      return null;
    }
    return { id, username, role };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<SessionUser> {
  const s = await readSession();
  if (!s) throw new AuthError(401, 'UNAUTHENTICATED', 'Authentication required');
  return s;
}

export async function requireAdmin(): Promise<SessionUser> {
  const s = await requireSession();
  if (s.role !== 'ADMINISTRATOR') {
    throw new AuthError(403, 'FORBIDDEN', 'Administrator role required');
  }
  return s;
}

export class AuthError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function login(
  username: string,
  password: string,
): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({ where: { username: username.trim() } });
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  return { id: user.id, username: user.username, role: user.role };
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export { COOKIE as SESSION_COOKIE };
