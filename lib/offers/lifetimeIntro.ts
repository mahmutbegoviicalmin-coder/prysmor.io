import { db } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

export const LIFETIME_INTRO_OFFER_ID = 'lifetime_intro';
export const LIFETIME_INTRO_LIMIT = 100;
/** Starting claimed count for launch scarcity (first real purchase becomes 46). */
export const LIFETIME_INTRO_SEED_CLAIMED = 45;

export type LifetimeIntroOffer = {
  claimed: number;
  limit: number;
  remaining: number;
  soldOut: boolean;
};

function normalize(claimed: number, limit: number): LifetimeIntroOffer {
  const safeLimit = Math.max(1, limit);
  const safeClaimed = Math.min(Math.max(0, claimed), safeLimit);
  return {
    claimed: safeClaimed,
    limit: safeLimit,
    remaining: Math.max(0, safeLimit - safeClaimed),
    soldOut: safeClaimed >= safeLimit,
  };
}

/**
 * Public offer state for the $99 lifetime intro (first N buyers).
 * Creates the doc with seed values if missing.
 */
export async function getLifetimeIntroOffer(): Promise<LifetimeIntroOffer> {
  if (!db) {
    return normalize(LIFETIME_INTRO_SEED_CLAIMED, LIFETIME_INTRO_LIMIT);
  }

  const ref = db.collection('offers').doc(LIFETIME_INTRO_OFFER_ID);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set(
      {
        claimed: LIFETIME_INTRO_SEED_CLAIMED,
        limit: LIFETIME_INTRO_LIMIT,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return normalize(LIFETIME_INTRO_SEED_CLAIMED, LIFETIME_INTRO_LIMIT);
  }

  const data = snap.data()!;
  const claimed = typeof data.claimed === 'number' ? data.claimed : LIFETIME_INTRO_SEED_CLAIMED;
  const limit = typeof data.limit === 'number' ? data.limit : LIFETIME_INTRO_LIMIT;
  return normalize(claimed, limit);
}

/**
 * Atomically claim one intro spot after a fresh lifetime fulfillment.
 * Caps at limit (does not go past 100).
 */
export async function claimLifetimeIntroSpot(): Promise<LifetimeIntroOffer> {
  if (!db) {
    return normalize(LIFETIME_INTRO_SEED_CLAIMED, LIFETIME_INTRO_LIMIT);
  }

  const ref = db.collection('offers').doc(LIFETIME_INTRO_OFFER_ID);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    let claimed = LIFETIME_INTRO_SEED_CLAIMED;
    let limit = LIFETIME_INTRO_LIMIT;

    if (snap.exists) {
      const data = snap.data()!;
      claimed = typeof data.claimed === 'number' ? data.claimed : LIFETIME_INTRO_SEED_CLAIMED;
      limit = typeof data.limit === 'number' ? data.limit : LIFETIME_INTRO_LIMIT;
    }

    if (claimed < limit) {
      claimed += 1;
    }

    tx.set(
      ref,
      {
        claimed,
        limit,
        updatedAt: FieldValue.serverTimestamp(),
        ...(!snap.exists ? { createdAt: FieldValue.serverTimestamp() } : {}),
      },
      { merge: true },
    );

    return normalize(claimed, limit);
  });
}
