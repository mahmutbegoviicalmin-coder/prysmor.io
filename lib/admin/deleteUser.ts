import { db } from '@/lib/firebaseAdmin';
import { emailKey } from '@/lib/auth/identity';
import { FUNNEL_IDS } from '@/lib/email/constants';

/**
 * Permanently delete a user and related Firestore data.
 * Used by admin individual delete and bulk inactive purge.
 */
export async function deleteUserDeep(userId: string): Promise<void> {
  const ref = db.collection('users').doc(userId);
  const snap = await ref.get();
  const data = snap.exists ? snap.data() : null;
  const email = typeof data?.email === 'string'
    ? data.email
    : typeof data?.userEmail === 'string'
      ? data.userEmail
      : null;

  for (const sub of ['jobs', 'devices'] as const) {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const page = await ref.collection(sub).limit(400).get();
      if (page.empty) break;
      const batch = db.batch();
      page.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      if (page.size < 400) break;
    }
  }

  if (snap.exists) await ref.delete();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const sessions = await db.collection('web_sessions').where('userId', '==', userId).limit(400).get();
    if (sessions.empty) break;
    const batch = db.batch();
    sessions.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (sessions.size < 400) break;
  }

  if (email) {
    await db.collection('email_users').doc(emailKey(email)).delete().catch(() => {});
  }

  const enrollBatch = db.batch();
  let enrollN = 0;
  for (const funnelId of FUNNEL_IDS) {
    enrollBatch.delete(db.collection('email_enrollments').doc(`${userId}_${funnelId}`));
    enrollN += 1;
  }
  if (enrollN > 0) await enrollBatch.commit().catch(() => {});
}
