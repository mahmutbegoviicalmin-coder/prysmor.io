import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/firebaseAdmin';
import { normalizeEmail, resolveUserIdByEmail } from './identity';

export const SESSION_COOKIE = 'prysmor_sid';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface SessionUser {
  userId: string;
  email: string;
  sessionId: string;
}

function sessionSecretOk(): void {
  if (!process.env.MAGIC_LINK_SECRET && !process.env.CRON_SECRET && !process.env.EMAIL_UNSUBSCRIBE_SECRET) {
    throw new Error('MAGIC_LINK_SECRET (or CRON_SECRET) is not configured');
  }
}

/**
 * Create a web session for an existing user only.
 * Does NOT create unpaid accounts — account must already exist (from purchase).
 */
export async function createSession(email: string): Promise<{ sessionId: string; userId: string }> {
  sessionSecretOk();
  const normalized = normalizeEmail(email);
  const userId = await resolveUserIdByEmail(normalized);
  if (!userId) {
    throw new Error('NO_ACCOUNT');
  }

  const userSnap = await db.collection('users').doc(userId).get();
  if (!userSnap.exists) {
    throw new Error('NO_ACCOUNT');
  }

  const sessionId = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  await db.collection('web_sessions').doc(sessionId).set({
    userId,
    email: normalized,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    lastSeenAt: now,
  });
  await db.collection('users').doc(userId).set({
    lastSignInAt: new Date(now),
    updatedAt: new Date(now),
  }, { merge: true }).catch(() => {});
  return { sessionId, userId };
}

export async function destroySession(sessionId: string | undefined): Promise<void> {
  if (!sessionId) return;
  await db.collection('web_sessions').doc(sessionId).delete().catch(() => {});
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const sessionId = jar.get(SESSION_COOKIE)?.value;
  if (!sessionId || !/^[a-f0-9]{64}$/.test(sessionId)) return null;

  const snap = await db.collection('web_sessions').doc(sessionId).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  if (typeof data.expiresAt === 'number' && Date.now() > data.expiresAt) {
    await snap.ref.delete().catch(() => {});
    return null;
  }

  const email = normalizeEmail(data.email as string);
  const userId = String(data.userId ?? '');
  if (!email || !userId) return null;

  snap.ref.set({
    lastSeenAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  }, { merge: true }).catch(() => {});

  return { userId, email, sessionId };
}

export async function requireUser(): Promise<
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse }
> {
  const user = await getSessionUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  return { ok: true, user };
}

export function setSessionCookie(response: NextResponse, sessionId: string): void {
  response.cookies.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export async function clearSessionCookieJar(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
