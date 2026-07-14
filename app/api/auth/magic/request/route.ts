import { NextRequest, NextResponse } from 'next/server';
import { normalizeEmail, resolveUserIdByEmail } from '@/lib/auth/identity';
import { sendSetPasswordEmail } from '@/lib/email/transactional';
import { db } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = 5;

async function rateLimit(email: string, ip: string): Promise<boolean> {
  const key = `magic_rl_${email.slice(0, 64)}_${ip.slice(0, 64)}`;
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
 * Legacy endpoint — no longer creates accounts or sends open magic login links.
 * For active paid users without a password, sends a set-password email.
 * Otherwise returns a message to use email + password sign-in.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail(body.email as string | undefined);

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const allowed = await rateLimit(email, ip).catch(() => true);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }

  const userId = await resolveUserIdByEmail(email);
  if (!userId) {
    return NextResponse.json({
      error: 'No account for this email. Buy a plan first.',
      code: 'no_account',
    }, { status: 404 });
  }

  const snap = await db.collection('users').doc(userId).get();
  const data = snap.data();
  if (!data || (data.licenseStatus ?? 'inactive') !== 'active') {
    return NextResponse.json({
      error: 'No active license. Buy a plan to create an account.',
      code: 'inactive',
    }, { status: 403 });
  }

  const hasPassword = typeof data.passwordHash === 'string' && data.passwordHash.length > 0;
  if (hasPassword) {
    return NextResponse.json({
      error: 'Use your email and password to sign in. Forgot password? Use the link on the sign-in page.',
      code: 'use_password',
    }, { status: 400 });
  }

  const result = await sendSetPasswordEmail({ to: email, purpose: 'set-password' });
  if (!result.ok) {
    console.warn('[magic/request] set-password send failed:', result.error);
    return NextResponse.json({ error: 'Could not send email' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: 'Check your email for a link to set your password.',
  });
}
