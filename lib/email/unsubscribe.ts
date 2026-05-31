import crypto from 'node:crypto';
import { db } from '@/lib/firebaseAdmin';
import { appBaseUrl } from './constants';

function secret(): string {
  return process.env.EMAIL_UNSUBSCRIBE_SECRET
    ?? process.env.CRON_SECRET
    ?? process.env.CLERK_SECRET_KEY
    ?? 'prysmor-email-dev';
}

export function signUnsubscribeToken(userId: string): string {
  const payload = `${userId}:${Date.now()}`;
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('hex').slice(0, 32);
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

export function verifyUnsubscribeToken(token: string): string | null {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const parts = raw.split(':');
    if (parts.length < 3) return null;
    const sig = parts.pop()!;
    const payload = parts.join(':');
    const expected = crypto.createHmac('sha256', secret()).update(payload).digest('hex').slice(0, 32);
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const userId = parts[0];
    return userId || null;
  } catch {
    return null;
  }
}

export function buildUnsubscribeUrl(userId: string): string {
  const token = signUnsubscribeToken(userId);
  return `${appBaseUrl()}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
}

export async function unsubscribeUser(userId: string): Promise<void> {
  await db.collection('users').doc(userId).set(
    {
      marketingOptIn:          false,
      marketingUnsubscribedAt: new Date(),
      updatedAt:               new Date(),
    },
    { merge: true },
  );

  const enrollments = await db.collection('email_enrollments')
    .where('userId', '==', userId)
    .where('status', '==', 'active')
    .get();

  const batch = db.batch();
  for (const doc of enrollments.docs) {
    batch.update(doc.ref, { status: 'cancelled', cancelReason: 'unsubscribed', updatedAt: new Date() });
  }
  await batch.commit();
}
