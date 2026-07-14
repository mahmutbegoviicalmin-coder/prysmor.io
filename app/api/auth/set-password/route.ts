import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { resolveUserIdByEmail } from '@/lib/auth/identity';
import { verifyMagicToken, consumeMagicNonce } from '@/lib/auth/magic';
import { hashPassword, validatePassword } from '@/lib/auth/password';
import { createSession, setSessionCookie } from '@/lib/auth/session';

export const runtime = 'nodejs';

const ALLOWED_PURPOSES = new Set(['set-password', 'reset-password', 'purchase', 'login']);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === 'string' ? body.token : '';
  const password = typeof body.password === 'string' ? body.password : '';

  const strength = validatePassword(password);
  if (strength) {
    return NextResponse.json({ error: strength }, { status: 400 });
  }

  const verified = verifyMagicToken(token);
  if (!verified || !ALLOWED_PURPOSES.has(verified.purpose)) {
    return NextResponse.json({ error: 'Invalid or expired link', code: 'invalid_token' }, { status: 400 });
  }

  const userId = await resolveUserIdByEmail(verified.email);
  if (!userId) {
    return NextResponse.json({
      error: 'No account for this email. Complete a purchase first.',
      code: 'no_account',
    }, { status: 404 });
  }

  const ref = db.collection('users').doc(userId);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: 'No account found', code: 'no_account' }, { status: 404 });
  }

  const data = snap.data()!;
  if ((data.licenseStatus ?? 'inactive') !== 'active') {
    return NextResponse.json({
      error: 'No active license. Buy a plan to activate your account.',
      code: 'inactive',
    }, { status: 403 });
  }

  // Consume only after we know the account can set a password (avoid burning valid links)
  const fresh = await consumeMagicNonce(verified.nonce);
  if (!fresh) {
    return NextResponse.json({ error: 'This link was already used. Request a new one.', code: 'used' }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  await ref.set({
    passwordHash,
    passwordSetAt: new Date(),
    email: verified.email,
    updatedAt: new Date(),
  }, { merge: true });

  // Keep email index in sync for login lookups
  const { ensureEmailUserIndex } = await import('@/lib/auth/identity');
  await ensureEmailUserIndex(userId, verified.email).catch(() => {});

  try {
    const { sessionId } = await createSession(verified.email);
    const response = NextResponse.json({ ok: true, email: verified.email, userId });
    setSessionCookie(response, sessionId);
    return response;
  } catch {
    return NextResponse.json({ ok: true, email: verified.email, userId, session: false });
  }
}
