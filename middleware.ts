import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify, SignJWT } from 'jose';

const SESSION_COOKIE = 'pharmshift_session';

// Public routes — no auth check needed
const PUBLIC_ROUTES = ['/login', '/change-password'];

const NEW_SECRET = process.env.SESSION_JWT_SECRET;
const LEGACY_SECRET = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!NEW_SECRET) {
  throw new Error(
    'SESSION_JWT_SECRET is required. Generate one with: openssl rand -base64 64'
  );
}

const secret = new TextEncoder().encode(NEW_SECRET);
const legacySecret = LEGACY_SECRET ? new TextEncoder().encode(LEGACY_SECRET) : null;

// Refresh when less than 15 days remain (seconds)
const REFRESH_THRESHOLD = 15 * 24 * 60 * 60;
// Session lifetime
const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

async function verifySession(
  token: string
): Promise<{ payload: any; usedLegacy: boolean } | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    return { payload, usedLegacy: false };
  } catch {
    if (legacySecret) {
      try {
        const { payload } = await jwtVerify(token, legacySecret, { algorithms: ['HS256'] });
        return { payload, usedLegacy: true };
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_ROUTES.some(r => pathname.startsWith(r))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;

  // ไม่มี cookie → redirect login
  if (!token) {
    const url = new URL('/login', request.url);
    url.searchParams.set('reason', 'unauthenticated');
    return NextResponse.redirect(url);
  }

  // มี cookie แต่ JWT หมดอายุหรือไม่ถูกต้อง → ล้าง cookie + redirect
  const verifyResult = await verifySession(token);
  if (!verifyResult) {
    const url = new URL('/login', request.url);
    url.searchParams.set('reason', 'session_expired');
    const res = NextResponse.redirect(url);
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  const { payload, usedLegacy } = verifyResult;
  const response = NextResponse.next();

  // ── Rolling refresh + legacy migration ───────────────────────
  // Re-sign JWT when less than 15 days remain so active users
  // never hit the 30-day wall.  Also refreshes the cookie expiry
  // which helps on iOS/Safari where the browser may purge cookies
  // after 7 days of inactivity.
  // If session was verified with the legacy (anon-key) secret, re-sign
  // immediately with the new secret so the cookie is upgraded silently.
  const exp = payload.exp as number | undefined;
  const now = Math.floor(Date.now() / 1000);

  if (usedLegacy || !exp || exp - now < REFRESH_THRESHOLD) {
    // Strip JWT-internal claims, keep only our session data
    const { iat: _iat, exp: _exp, nbf: _nbf, jti: _jti, ...sessionData } = payload;

    const newToken = await new SignJWT(sessionData as Record<string, unknown>)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${SESSION_DAYS}d`)
      .sign(secret);

    const expires = new Date(Date.now() + SESSION_MS);
    response.cookies.set(SESSION_COOKIE, newToken, {
      expires,
      maxAge: SESSION_DAYS * 24 * 60 * 60, // seconds — fallback for some browsers
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
