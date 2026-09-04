import { NextResponse } from 'next/server';
import {
  createSessionToken,
  getAdminCredentials,
  sessionCookieOptions,
  verifyPassword,
} from '@/lib/auth';

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
  };
  const username = String(body.username ?? '');
  const password = String(body.password ?? '');
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
  });
  const res = NextResponse.json({ status: 'ok' });
  const cookie = sessionCookieOptions(token);
  res.cookies.set(cookie);
  return res;
}
