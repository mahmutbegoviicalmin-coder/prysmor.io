import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { normalizeEmail, resolveUserIdByEmail } from '@/lib/auth/identity';
import { createSession, setSessionCookie } from '@/lib/auth/session';
import { verifyPassword } from '@/lib/auth/password';

export const runtime = 'nodejs';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = 20;

async function rateLimit(email: string, ip: string): Promise<boolean> {
  const key = `login_rl_${email.slice(0, 64)}_${ip.slice(0, 64)}`;
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
  const password = typeof body.password === 'string' ? body.password : '';
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  if (!email || !email.includes('@') || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
  }

  const allowed = await rateLimit(email, ip).catch(() => true);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
  }

  const userId = await resolveUserIdByEmail(email);
  if (!userId) {
    return NextResponse.json({
      error: 'No account for this email. Buy a plan first.',
      code: 'no_account',
    }, { status: 401 });
  }

  const snap = await db.collection('users').doc(userId).get();
  if (!snap.exists) {
    return NextResponse.json({
      error: 'No account for this email. Buy a plan first.',
      code: 'no_account',
    }, { status: 401 });
  }

  const data = snap.data()!;
  const licenseStatus = data.licenseStatus ?? 'inactive';
  if (licenseStatus !== 'active') {
    return NextResponse.json({
      error: 'No active license for this account. Buy a plan to continue.',
      code: 'inactive',
    }, { status: 403 });
  }

  const passwordHash = typeof data.passwordHash === 'string' ? data.passwordHash : null;
  if (!passwordHash) {
    return NextResponse.json({
      error: 'Set a password first. Use Forgot password to get a link.',
      code: 'password_not_set',
    }, { status: 403 });
  }

  const ok = await verifyPassword(password, passwordHash);
  if (!ok) {
    return NextResponse.json({ error: 'Invalid email or password', code: 'invalid' }, { status: 401 });
  }

  try {
    const { sessionId } = await createSession(email);
    const response = NextResponse.json({ ok: true, userId, email });
    setSessionCookie(response, sessionId);
    return response;
  } catch {
    return NextResponse.json({ error: 'Could not create session' }, { status: 500 });
  }
}
