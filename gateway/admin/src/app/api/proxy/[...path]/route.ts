import { NextRequest, NextResponse } from 'next/server';
import { readSessionToken, SESSION_COOKIE } from '@/lib/auth-session';

const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://127.0.0.1:8080';
const ADMIN_KEY = process.env.GATEWAY_ADMIN_API_KEY ?? 'n2ai_admin_dev_key';

async function proxy(req: NextRequest, path: string[], method: string) {
  const url = `${GATEWAY_URL}/v1/admin/${path.join('/')}${req.nextUrl.search}`;
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await readSessionToken(cookie);
  const bearer = session?.gateway_token || ADMIN_KEY;
  const headers: Record<string, string> = {
    authorization: `Bearer ${bearer}`,
    accept: 'application/json',
  };

  let body: BodyInit | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    const contentType = req.headers.get('content-type') ?? '';
    if (contentType.includes('multipart/form-data')) {
      // Preserve boundary; forward raw bytes for license install uploads.
      body = await req.arrayBuffer();
      headers['content-type'] = contentType;
    } else if (
      contentType.includes('text/plain') ||
      contentType.includes('application/jose')
    ) {
      body = await req.text();
      headers['content-type'] = contentType.split(';')[0]!.trim();
    } else {
      body = await req.text();
      headers['content-type'] = 'application/json';
    }
  }

  const res = await fetch(url, { method, headers, body, cache: 'no-store' });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/json',
    },
  });
}

export async function GET(
  req: NextRequest,
  ctx: { params: { path: string[] } },
) {
  return proxy(req, ctx.params.path, 'GET');
}

export async function POST(
  req: NextRequest,
  ctx: { params: { path: string[] } },
) {
  return proxy(req, ctx.params.path, 'POST');
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: { path: string[] } },
) {
  return proxy(req, ctx.params.path, 'PATCH');
}

export async function PUT(
  req: NextRequest,
  ctx: { params: { path: string[] } },
) {
  return proxy(req, ctx.params.path, 'PUT');
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: { path: string[] } },
) {
  return proxy(req, ctx.params.path, 'DELETE');
}
