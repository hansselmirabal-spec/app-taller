import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/change-password'];
const PROTECTED_PREFIX = ['/dashboard', '/appointments', '/capacity', '/kanban', '/reports', '/settings', '/porteria', '/seguimiento'];

function decodeJwt(token: string): { exp?: number } | null {
  try {
    const payload = token.split('.')[1];
    const decoded = Buffer.from(payload, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function isTokenValid(token: string | undefined): boolean {
  if (!token) return false;
  const payload = decodeJwt(token);
  if (!payload?.exp) return false;
  return payload.exp * 1000 > Date.now();
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p));
  const isProtected = PROTECTED_PREFIX.some(p => pathname.startsWith(p));

  if (!isProtected) return NextResponse.next();

  const token = request.cookies.get('auth_token')?.value;

  if (!isTokenValid(token)) {
    const loginUrl = new URL('/login', request.url);
    if (token) loginUrl.searchParams.set('expired', '1');
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
