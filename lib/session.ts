import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { User } from '@/lib/types';

const NEW_SECRET = process.env.SESSION_JWT_SECRET;
const LEGACY_SECRET = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!NEW_SECRET) {
  throw new Error(
    'SESSION_JWT_SECRET is required. Generate one with: openssl rand -base64 64'
  );
}

const key = new TextEncoder().encode(NEW_SECRET);
const legacyKey = LEGACY_SECRET ? new TextEncoder().encode(LEGACY_SECRET) : null;

export const SESSION_COOKIE_NAME = 'pharmshift_session';

interface CreateSessionOptions {
  persistent?: boolean;
}

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
  } catch {
    // Legacy fallback: ยอมรับ session ที่ sign ด้วย anon key (จาก code เก่า)
    // ระหว่าง migration window — middleware จะ re-sign ให้ใหม่ทันทีที่ user เข้าเว็บ
    if (legacyKey) {
      try {
        const { payload } = await jwtVerify(input, legacyKey, { algorithms: ['HS256'] });
        return payload;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function createSession(user: Partial<User>, options?: CreateSessionOptions) {
  const persistent = options?.persistent ?? true;
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
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
    sameSite: 'lax',
    path: '/',
    ...(persistent
      ? {
          expires,
          maxAge: 30 * 24 * 60 * 60, // seconds — fallback for browsers that prefer maxAge
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
