import { NextRequest, NextResponse } from 'next/server';
import { verifyMagicToken } from '@/lib/auth/magic';
import { appBaseUrl } from '@/lib/email/constants';
import { resolveUserIdByEmail } from '@/lib/auth/identity';
import { db } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

/**
 * Legacy magic consume — no longer auto-creates unpaid users or sessions.
 * Password / purchase tokens are redirected to /set-password.
 * Old login tokens for active users without a password also go to set-password.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? '';
  const verified = verifyMagicToken(token);

  if (!verified) {
    return NextResponse.redirect(new URL('/sign-in?error=invalid', appBaseUrl()));
  }

  if (
    verified.purpose === 'set-password'
    || verified.purpose === 'reset-password'
    || verified.purpose === 'purchase'
  ) {
    const url = new URL('/set-password', appBaseUrl());
    url.searchParams.set('token', token);
    return NextResponse.redirect(url);
  }

  // Legacy login magic: only help existing active buyers set a password
  const userId = await resolveUserIdByEmail(verified.email);
  if (userId) {
    const snap = await db.collection('users').doc(userId).get();
    const data = snap.data();
    if (data && (data.licenseStatus ?? 'inactive') === 'active') {
      const hasPassword = typeof data.passwordHash === 'string' && data.passwordHash.length > 0;
      if (!hasPassword) {
        const url = new URL('/set-password', appBaseUrl());
        url.searchParams.set('token', token);
        return NextResponse.redirect(url);
      }
      return NextResponse.redirect(new URL('/sign-in?error=use_password', appBaseUrl()));
    }
  }

  return NextResponse.redirect(new URL('/sign-in?error=no_account', appBaseUrl()));
}
