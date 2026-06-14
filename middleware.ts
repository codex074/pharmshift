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

// Session lifetime — 400 days (the browser cookie-lifetime cap)
const SESSION_DAYS = 400;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
// Slide the window forward once per day so an active user never expires
const SLIDE_AFTER = 24 * 60 * 60; // seconds since issued

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

  // ── Sliding refresh + legacy migration ───────────────────────
  // Re-sign the JWT and push the cookie expiry to now + 400 days on
  // the first request of each day, so an active phone/tablet user's
  // session continuously slides forward and never expires.  This also
  // refreshes the cookie on iOS/Safari, which may purge cookies after
  // a period of inactivity.
  // If the session was verified with the legacy (anon-key) secret,
  // re-sign immediately with the new secret to upgrade it silently.
  const iat = payload.iat as number | undefined;
  const now = Math.floor(Date.now() / 1000);

  if (usedLegacy || !iat || now - iat > SLIDE_AFTER) {
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
