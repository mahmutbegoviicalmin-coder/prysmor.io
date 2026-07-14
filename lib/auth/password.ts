import crypto from 'node:crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;
const MAX_PASSWORD = 128;
const MIN_PASSWORD = 8;

export function validatePassword(password: string): string | null {
  if (typeof password !== 'string') return 'Password is required';
  if (password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters`;
  if (password.length > MAX_PASSWORD) return `Password must be at most ${MAX_PASSWORD} characters`;
  return null;
}

/** Store as scrypt$n$r$p$saltHex$hashHex */
export async function hashPassword(password: string): Promise<string> {
  const err = validatePassword(password);
  if (err) throw new Error(err);
  const salt = crypto.randomBytes(16);
  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }, (e, buf) => {
      if (e) reject(e);
      else resolve(buf as Buffer);
    });
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored || typeof password !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4], 'hex');
  const expected = Buffer.from(parts[5], 'hex');
  if (!salt.length || !expected.length || !n || !r || !p) return false;

  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, expected.length, { N: n, r, p }, (e, buf) => {
      if (e) reject(e);
      else resolve(buf as Buffer);
    });
  });

  try {
    return crypto.timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}
