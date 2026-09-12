import { NextResponse } from 'next/server';
import { AuthError } from './auth';

export function jsonOk(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json(
      { status: 'error', reason_code: err.code, message: err.message },
      { status: err.status },
    );
  }
  const message = err instanceof Error ? err.message : 'Request failed';
  // Never echo private key material
  const safe = message.replace(/"d"\s*:\s*"[^"]+"/g, '"d":"[redacted]"');
  return NextResponse.json(
    { status: 'error', reason_code: 'ERROR', message: safe },
    { status: 400 },
  );
}

export function clientIp(req: Request): string | null {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    null
  );
}
