import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const SESSION_COOKIE = 'pharmshift_session';

// Public routes — no auth check needed
const PUBLIC_ROUTES = ['/login', '/change-password'];

async function isValidSession(token: string): Promise<boolean> {
  try {
    const secret = new TextEncoder().encode(
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'pharmshift-fallback-secret'
    );
    await jwtVerify(token, secret, { algorithms: ['HS256'] });
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_ROUTES.some(r => pathname.startsWith(r))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;

  // ไม่มี cookie เลย → redirect login
  if (!token) {
    const url = new URL('/login', request.url);
    url.searchParams.set('reason', 'unauthenticated');
    return NextResponse.redirect(url);
  }

  // มี cookie แต่ JWT หมดอายุหรือไม่ถูกต้อง → ล้าง cookie + redirect
  const valid = await isValidSession(token);
  if (!valid) {
    const url = new URL('/login', request.url);
    url.searchParams.set('reason', 'session_expired');
    const res = NextResponse.redirect(url);
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
