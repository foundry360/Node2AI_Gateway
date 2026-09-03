import { NextRequest, NextResponse } from 'next/server';

const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://127.0.0.1:8080';
const ADMIN_KEY = process.env.GATEWAY_ADMIN_API_KEY ?? 'n2ai_admin_dev_key';

async function proxy(req: NextRequest, path: string[], method: string) {
  const url = `${GATEWAY_URL}/v1/admin/${path.join('/')}${req.nextUrl.search}`;
  const headers: Record<string, string> = {
    authorization: `Bearer ${ADMIN_KEY}`,
    accept: 'application/json',
  };
  let body: string | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    body = await req.text();
    headers['content-type'] = 'application/json';
  }
  const res = await fetch(url, { method, headers, body, cache: 'no-store' });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
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

export async function DELETE(
  req: NextRequest,
  ctx: { params: { path: string[] } },
) {
  return proxy(req, ctx.params.path, 'DELETE');
}
