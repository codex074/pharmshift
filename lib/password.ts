import bcrypt from 'bcryptjs';

const BCRYPT_COST = 12;
const BCRYPT_RE = /^\$2[aby]\$\d{2}\$/;

export function isPasswordHash(value: string | null | undefined) {
  return typeof value === 'string' && BCRYPT_RE.test(value);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, storedPassword: string | null | undefined) {
  if (!storedPassword) return false;
  if (isPasswordHash(storedPassword)) {
    return bcrypt.compare(password, storedPassword);
  }
  return password === storedPassword;
}

export async function shouldRehashPassword(storedPassword: string | null | undefined) {
  if (!storedPassword) return false;
  if (!isPasswordHash(storedPassword)) return true;

  try {
    return bcrypt.getRounds(storedPassword) < BCRYPT_COST;
  } catch {
    return true;
  }
}
