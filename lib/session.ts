import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { User } from '@/lib/types';

const secretKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'pharmshift-fallback-secret';
const key = new TextEncoder().encode(secretKey);

export const SESSION_COOKIE_NAME = 'pharmshift_session';

export async function encrypt(payload: any) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d') // 30 days expiration
    .sign(key);
}

export async function decrypt(input: string): Promise<any> {
  try {
    const { payload } = await jwtVerify(input, key, { algorithms: ['HS256'] });
    return payload;
  } catch (error) {
    return null;
  }
}

export async function createSession(user: Partial<User>) {
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const sessionData = {
    id: user.id,
    pha_id: user.pha_id,
    role: user.role,
    must_change_password: user.must_change_password,
  };
  const session = await encrypt(sessionData);

  cookies().set(SESSION_COOKIE_NAME, session, {
    expires,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
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
