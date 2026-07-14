import crypto from 'node:crypto';
import { db } from '@/lib/firebaseAdmin';
import { appBaseUrl } from '@/lib/email/constants';
import { normalizeEmail } from './identity';

const MAGIC_TTL_MS = 30 * 60 * 1000; // 30 minutes (legacy login magic)
const PASSWORD_TOKEN_TTL_MS = 48 * 60 * 60 * 1000; // 48h for set/reset password

function magicSecret(): string {
  const secret = process.env.MAGIC_LINK_SECRET
    || process.env.EMAIL_UNSUBSCRIBE_SECRET
    || process.env.CRON_SECRET;
  if (!secret) throw new Error('MAGIC_LINK_SECRET (or CRON_SECRET) is not configured');
  return secret;
}

function signPayload(payloadB64: string): string {
  return crypto.createHmac('sha256', magicSecret()).update(payloadB64).digest('hex');
}

function ttlForPurpose(purpose: string): number {
  if (purpose === 'set-password' || purpose === 'reset-password' || purpose === 'purchase') {
    return PASSWORD_TOKEN_TTL_MS;
  }
  return MAGIC_TTL_MS;
}

export function createMagicToken(email: string, purpose = 'login'): string {
  const payload = {
    email: normalizeEmail(email),
    purpose,
    exp: Date.now() + ttlForPurpose(purpose),
    nonce: crypto.randomBytes(16).toString('hex'),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = signPayload(payloadB64);
  return `${payloadB64}.${sig}`;
}

export function verifyMagicToken(token: string): { email: string; purpose: string; nonce: string } | null {
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return null;
  const expected = signPayload(payloadB64);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  } catch {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      email?: string;
      purpose?: string;
      exp?: number;
      nonce?: string;
    };
    if (!payload.email || !payload.nonce || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;
    return {
      email: normalizeEmail(payload.email),
      purpose: payload.purpose ?? 'login',
      nonce: payload.nonce,
    };
  } catch {
    return null;
  }
}

/** One-time consume: rejects reused nonces. */
export async function consumeMagicNonce(nonce: string): Promise<boolean> {
  const ref = db.collection('magic_nonces').doc(nonce);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return false;
    tx.set(ref, { usedAt: new Date(), expiresAt: Date.now() + PASSWORD_TOKEN_TTL_MS });
    return true;
  });
}

export function magicLinkUrl(email: string, opts?: { redirect?: string; purpose?: string }): string {
  const token = createMagicToken(email, opts?.purpose ?? 'login');
  const url = new URL(`${appBaseUrl()}/auth/magic`);
  url.searchParams.set('token', token);
  if (opts?.redirect) url.searchParams.set('redirect', opts.redirect);
  return url.toString();
}

/** Link to choose / reset password after purchase or forgot-password. */
export function setPasswordLinkUrl(
  email: string,
  purpose: 'set-password' | 'reset-password' | 'purchase' = 'set-password',
): string {
  const token = createMagicToken(email, purpose);
  const url = new URL(`${appBaseUrl()}/set-password`);
  url.searchParams.set('token', token);
  return url.toString();
}
