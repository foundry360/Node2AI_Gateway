import { NextRequest, NextResponse } from 'next/server';
import {
  clearSessionCookie,
  createSessionToken,
  login,
  readSession,
  setSessionCookie,
} from '@/lib/auth';
import { jsonError, jsonOk } from '@/lib/http';

export async function GET() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 200 });
  }
  return jsonOk({ user: session });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const username = String(body.username || '');
    const password = String(body.password || '');
    const user = await login(username, password);
    if (!user) {
      return NextResponse.json(
        { status: 'error', reason_code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' },
        { status: 401 },
      );
    }
    const token = await createSessionToken(user);
    await setSessionCookie(token);
    return jsonOk({ user });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE() {
  await clearSessionCookie();
  return jsonOk({ ok: true });
}
