import { db } from '@/lib/firebaseAdmin';
import { sendPromptPackFollowUpEmail } from '@/lib/email/transactional';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

export const PROMPT_PACK_FOLLOW_UP_MS = 24 * 60 * 60 * 1000;

export type PromptPackFollowUpResult = {
  checked: number;
  sent: number;
  skipped: number;
  errors: string[];
};

/**
 * Send day-after Prompt Pack follow-ups that are due.
 * Leads are stored in prompt_pack_leads with followUpStatus + followUpAt.
 */
export async function processPromptPackFollowUps(
  limit = 25,
): Promise<PromptPackFollowUpResult> {
  const result: PromptPackFollowUpResult = {
    checked: 0,
    sent: 0,
    skipped: 0,
    errors: [],
  };

  if (!db) return result;

  const now = Timestamp.now();
  const snap = await db
    .collection('prompt_pack_leads')
    .where('followUpStatus', '==', 'pending')
    .limit(Math.min(Math.max(limit * 3, 25), 100))
    .get();

  result.checked = snap.size;
  const due = snap.docs
    .filter((doc) => {
      const at = doc.data().followUpAt;
      if (!at) return false;
      const ms =
        typeof at.toMillis === 'function'
          ? at.toMillis()
          : typeof at === 'number'
            ? at
            : Date.parse(String(at));
      return Number.isFinite(ms) && ms <= now.toMillis();
    })
    .slice(0, limit);

  for (const doc of due) {
    const data = doc.data();
    const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
    if (!email) {
      result.skipped += 1;
      await doc.ref.set(
        { followUpStatus: 'skipped', followUpError: 'missing_email', updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      continue;
    }

    // Claim the send so concurrent cron runs do not double-send.
    const claimed = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref);
      if (!fresh.exists) return false;
      if (fresh.data()?.followUpStatus !== 'pending') return false;
      tx.set(
        doc.ref,
        { followUpStatus: 'sending', updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      return true;
    }).catch(() => false);

    if (!claimed) {
      result.skipped += 1;
      continue;
    }

    const send = await sendPromptPackFollowUpEmail({ to: email });
    if (!send.ok) {
      result.errors.push(`${email}: ${send.error ?? 'send failed'}`);
      await doc.ref.set(
        {
          followUpStatus: 'pending',
          followUpError: send.error ?? 'send failed',
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      continue;
    }

    result.sent += 1;
    await doc.ref.set(
      {
        followUpStatus: 'sent',
        followUpSentAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  return result;
}
