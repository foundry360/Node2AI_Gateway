import { NextResponse } from 'next/server';
import {
  createSessionToken,
  getAdminCredentials,
  sessionCookieOptions,
  verifyPassword,
} from '@/lib/auth';

const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://127.0.0.1:8080';

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
  };
  const username = String(body.username ?? '');
  const password = String(body.password ?? '');

  // Prefer gateway admin user store (V1 RBAC).
  try {
    const gw = await fetch(`${GATEWAY_URL}/v1/admin/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
      cache: 'no-store',
    });
    if (gw.ok) {
      const data = (await gw.json()) as {
        token?: string;
        user?: {
          user_id: string;
          username: string;
          organization_id: string;
          role: string;
          status: string;
        };
      };
      if (data.token && data.user) {
        const cookieToken = await createSessionToken({
          sub: data.user.user_id,
          name: data.user.username,
          role: data.user.role as
            | 'ADMINISTRATOR'
            | 'GOVERNANCE_REVIEWER'
            | 'OPERATOR'
            | 'READ_ONLY',
          organization_id: data.user.organization_id,
          status: data.user.status === 'DISABLED' ? 'DISABLED' : 'ACTIVE',
          gateway_token: data.token,
        });
        const res = NextResponse.json({
          status: 'ok',
          role: data.user.role,
          organization_id: data.user.organization_id,
        });
        res.cookies.set(sessionCookieOptions(cookieToken));
        return res;
      }
    }
    if (gw.status === 403) {
      return NextResponse.json(
        { status: 'error', message: 'User disabled' },
        { status: 403 },
      );
    }
  } catch {
    // Fall through to env bootstrap credentials when gateway unreachable.
  }

  const expected = getAdminCredentials();
  const userOk = verifyPassword(username, expected.username);
  const passOk = verifyPassword(password, expected.password);
  if (!userOk || !passOk) {
    return NextResponse.json(
      { status: 'error', message: 'Invalid username or password' },
      { status: 401 },
    );
  }

  const token = await createSessionToken({
    sub: expected.username,
    name: expected.username,
    role: 'ADMINISTRATOR',
    organization_id: process.env.GATEWAY_DEFAULT_ORGANIZATION_ID ?? 'org_demo',
    status: 'ACTIVE',
  });
  const res = NextResponse.json({ status: 'ok', role: 'ADMINISTRATOR' });
  res.cookies.set(sessionCookieOptions(token));
  return res;
}
