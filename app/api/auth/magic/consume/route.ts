import { NextRequest, NextResponse } from 'next/server';
import { consumeMagicNonce, verifyMagicToken } from '@/lib/auth/magic';
import { createSession, setSessionCookie } from '@/lib/auth/session';
import { ensureUserForEmail } from '@/lib/auth/identity';
import { appBaseUrl } from '@/lib/email/constants';

export const runtime = 'nodejs';

function safeRedirect(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/dashboard';
  return raw;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? '';
  const redirect = safeRedirect(req.nextUrl.searchParams.get('redirect'));

  const verified = verifyMagicToken(token);
  if (!verified) {
    return NextResponse.redirect(new URL('/sign-in?error=invalid', appBaseUrl()));
  }

  const fresh = await consumeMagicNonce(verified.nonce);
  if (!fresh) {
    return NextResponse.redirect(new URL('/sign-in?error=used', appBaseUrl()));
  }

  await ensureUserForEmail(verified.email);
  const { sessionId } = await createSession(verified.email);

  const destination = new URL(redirect, appBaseUrl());
  const response = NextResponse.redirect(destination);
  setSessionCookie(response, sessionId);
  return response;
}
