import { NextRequest, NextResponse } from 'next/server';
import { normalizeEmail } from '@/lib/auth/identity';
import { sendMagicLoginEmail } from '@/lib/email/transactional';
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

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail(body.email as string | undefined);
  const redirect = typeof body.redirect === 'string' ? body.redirect : '/dashboard';

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  // Only allow relative redirects
  const safeRedirect = redirect.startsWith('/') && !redirect.startsWith('//')
    ? redirect
    : '/dashboard';

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const allowed = await rateLimit(email, ip).catch(() => true);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }

  const result = await sendMagicLoginEmail({ to: email, redirect: safeRedirect });
  if (!result.ok) {
    console.warn('[magic/request] send failed:', result.error);
    return NextResponse.json({ error: 'Could not send email' }, { status: 500 });
  }

  // Always return ok (don't leak whether email exists)
  return NextResponse.json({ ok: true });
}
