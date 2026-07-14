import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { normalizeEmail, resolveUserIdByEmail } from '@/lib/auth/identity';
import { sendSetPasswordEmail } from '@/lib/email/transactional';

export const runtime = 'nodejs';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = 5;

async function rateLimit(email: string, ip: string): Promise<boolean> {
  const key = `forgot_rl_${email.slice(0, 64)}_${ip.slice(0, 64)}`;
  const ref = db.collection('rate_limits').doc(key);
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data()! : null;
    const windowStart = (data?.windowStart as number | undefined) ?? now;
    const count = (data?.count as number | undefined) ?? 0;
    if (now - windowStart > WINDOW_MS) {
      tx.set(ref, { windowStart: now, count: 1, updatedAt: now });
      return true;
    }
    if (count >= MAX_PER_WINDOW) return false;
    tx.set(ref, { windowStart, count: count + 1, updatedAt: now }, { merge: true });
    return true;
  });
}

/**
 * Always returns a generic success message (no email enumeration).
 * Sends set/reset password link only for active paid accounts.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail(body.email as string | undefined);
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  const generic = NextResponse.json({
    ok: true,
    message: 'If an active account exists for that email, we sent a password link.',
  });

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  const allowed = await rateLimit(email, ip).catch(() => true);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }

  try {
    const userId = await resolveUserIdByEmail(email);
    if (!userId) return generic;

    const snap = await db.collection('users').doc(userId).get();
    if (!snap.exists) return generic;

    const data = snap.data()!;
    if ((data.licenseStatus ?? 'inactive') !== 'active') return generic;

    const hasPassword = typeof data.passwordHash === 'string' && data.passwordHash.length > 0;
    await sendSetPasswordEmail({
      to: email,
      purpose: hasPassword ? 'reset-password' : 'set-password',
    });
  } catch (err) {
    console.warn('[forgot-password]', err);
  }

  return generic;
}
