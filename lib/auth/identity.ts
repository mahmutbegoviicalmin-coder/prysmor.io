import crypto from 'node:crypto';
import { db } from '@/lib/firebaseAdmin';

export function normalizeEmail(email?: string | null): string {
  return (email ?? '').trim().toLowerCase();
}

export function emailKey(email: string): string {
  return crypto.createHash('sha256').update(normalizeEmail(email)).digest('hex');
}

/** Deterministic Firestore user id from email (no Clerk). */
export function userIdFromEmail(email: string): string {
  return `usr_${emailKey(email).slice(0, 24)}`;
}

export async function resolveUserIdByEmail(email: string): Promise<string | undefined> {
  const normalized = normalizeEmail(email);
  if (!normalized) return undefined;

  const indexSnap = await db.collection('email_users').doc(emailKey(normalized)).get();
  if (indexSnap.exists) {
    const id = indexSnap.data()?.userId as string | undefined;
    if (id) return id;
  }

  const byEmail = await db.collection('users')
    .where('email', '==', normalized)
    .limit(1)
    .get();
  if (!byEmail.empty) return byEmail.docs[0].id;

  return undefined;
}

export async function ensureEmailUserIndex(userId: string, email: string): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!normalized || !userId) return;
  await db.collection('email_users').doc(emailKey(normalized)).set({
    userId,
    email: normalized,
    updatedAt: new Date(),
  }, { merge: true });
}

/**
 * Resolve or create a user document for an email.
 * Prefers an existing Clerk-era doc if email matches; otherwise uses deterministic usr_ id.
 */
export async function ensureUserForEmail(
  email: string,
  extras: Record<string, unknown> = {},
): Promise<{ userId: string; created: boolean }> {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new Error('email required');

  const existingId = await resolveUserIdByEmail(normalized);
  const userId = existingId ?? userIdFromEmail(normalized);
  const ref = db.collection('users').doc(userId);
  const snap = await ref.get();
  const created = !snap.exists;

  await ref.set({
    email: normalized,
    emailKey: emailKey(normalized),
    updatedAt: new Date(),
    ...(created && {
      plan: 'unpaid',
      licenseStatus: 'inactive',
      deviceLimit: 1,
      credits: 0,
      creditsTotal: 0,
      marketingOptIn: true,
      createdAt: new Date(),
    }),
    ...extras,
  }, { merge: true });

  await ensureEmailUserIndex(userId, normalized);
  return { userId, created };
}
