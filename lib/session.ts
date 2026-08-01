import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { User } from '@/lib/types';

const NEW_SECRET = process.env.SESSION_JWT_SECRET;

if (!NEW_SECRET) {
  throw new Error(
    'SESSION_JWT_SECRET is required. Generate one with: openssl rand -base64 64'
  );
}

const key = new TextEncoder().encode(NEW_SECRET);

export const SESSION_COOKIE_NAME = 'pharmshift_session';

// 400 days — the maximum cookie lifetime modern browsers honour.
// Combined with the middleware's sliding refresh, an active
// phone/tablet user effectively never has to log in again.
const SESSION_DAYS = 400;
const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60; // seconds

interface CreateSessionOptions {
  persistent?: boolean;
}

export async function encrypt(payload: any) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(key);
}

export async function decrypt(input: string): Promise<any> {
  try {
    const { payload } = await jwtVerify(input, key, { algorithms: ['HS256'] });
    return payload;
  } catch {
    return null;
  }
}

export async function createSession(user: Partial<User>, options?: CreateSessionOptions) {
  const persistent = options?.persistent ?? true;
  const expires = new Date(Date.now() + SESSION_MAX_AGE * 1000);
  const sessionData = {
    id: user.id,
    pha_id: user.pha_id,
    role: user.role,
    is_sub_admin: user.is_sub_admin ?? false,
    must_change_password: user.must_change_password,
  };
  const session = await encrypt(sessionData);

  cookies().set(SESSION_COOKIE_NAME, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // 'lax' (not 'strict') so the cookie is still sent when the installed
    // PWA is launched from the home screen or opened from a push
    // notification — 'strict' drops the cookie on those top-level
    // navigations and forces a re-login.
    sameSite: 'lax',
    path: '/',
    ...(persistent
      ? {
          expires,
          maxAge: SESSION_MAX_AGE, // seconds — fallback for browsers that prefer maxAge
        }
      : {}),
  });
}

export async function getSession() {
  const session = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!session) return null;
  return await decrypt(session);
}

export async function clearSession() {
  cookies().set(SESSION_COOKIE_NAME, '', {
    expires: new Date(0),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}
