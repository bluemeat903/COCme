import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionValue } from './src/lib/session-cookie';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isProtected =
    pathname.startsWith('/investigators') ||
    pathname.startsWith('/modules') ||
    pathname.startsWith('/sessions');

  if (!isProtected) return NextResponse.next();

  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (verifySessionValue(cookie)) return NextResponse.next();

  const signIn = request.nextUrl.clone();
  signIn.pathname = '/sign-in';
  signIn.searchParams.set('next', pathname);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
