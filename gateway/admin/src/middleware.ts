import { NextRequest, NextResponse } from 'next/server';
import {
  readSessionToken,
  roleHasCapability,
  SESSION_COOKIE,
} from '@/lib/auth-session';

function isPublicPath(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname.startsWith('/api/auth/login') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/brand/') ||
    pathname === '/favicon.ico' ||
    pathname === '/icon.png' ||
    pathname === '/apple-touch-icon.png' ||
    pathname === '/apple-icon.png'
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = isPublicPath(pathname);

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await readSessionToken(token);

  if (!session && !isPublic) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { status: 'error', message: 'Unauthenticated' },
        { status: 401 },
      );
    }
    const login = new URL('/login', req.url);
    login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }

  if (session && pathname === '/login') {
    return NextResponse.redirect(new URL('/', req.url));
  }

  if (
    session &&
    (pathname.startsWith('/administration') || pathname.startsWith('/system')) &&
    !roleHasCapability(session.role, 'admin_mutate')
  ) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.png|apple-touch-icon.png|apple-icon.png|brand/).*)',
  ],
};
