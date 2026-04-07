import { db } from "@/lib/firebaseAdmin";
import type { firestore } from "firebase-admin";

export interface UserDoc {
  plan:             string;
  licenseStatus:    "active" | "inactive" | "trialing";
  deviceLimit:      number;
  monthlyAllowance?: number;
  renewalDate?:     string;
  createdAt:        firestore.Timestamp | Date;
  // ── Credits ──────────────────────────────────────────────────────────────
  credits?:         number;   // current balance
  creditsTotal?:    number;   // plan cap (used for progress bar)
}

export const PLAN_LABELS: Record<string, string> = {
  starter:         "Starter",
  pro:             "Pro",
  exclusive:       "Exclusive",
  creator:         "Creator Suite",
  "creator-suite": "Creator Suite",
};

export const PLAN_ALLOWANCE: Record<string, number> = {
  starter:         25,
  pro:             50,
  exclusive:       100,
  creator:         50,
  "creator-suite": 100,
};

/** Credits granted per plan per billing cycle */
export const PLAN_CREDITS: Record<string, number> = {
  starter:         1000,  // 250 s × 4 cr/s
  pro:             2000,  // 500 s × 4 cr/s
  exclusive:       4000,  // 1000 s × 4 cr/s
  creator:         2000,
  "creator-suite": 4000,
};

/** Credits cost per second of generated video */
export const CREDITS_PER_SECOND = 4;

export async function createUser(userId: string) {
  const ref = db.collection("users").doc(userId);
  const doc = await ref.get();

  if (!doc.exists) {
    // New accounts start INACTIVE with 0 credits.
    // licenseStatus → 'active' only after a successful payment webhook.
    await ref.set({
      plan:           "starter",
      licenseStatus:  "inactive",
      deviceLimit:    1,
      credits:        0,
      creditsTotal:   0,
      createdAt:      new Date(),
    });
  }
}

export async function getUser(userId: string): Promise<UserDoc | null> {
  const doc = await db.collection("users").doc(userId).get();
  if (!doc.exists) return null;
  return doc.data() as UserDoc;
}

/**
 * Syncs Clerk profile data (email, name) into the Firestore user doc.
 * Uses set+merge so it's safe to call even if the doc doesn't exist yet.
 */
export async function syncUserProfile(
  userId: string,
  profile: { email?: string; firstName?: string; lastName?: string },
): Promise<void> {
  const displayName = [profile.firstName, profile.lastName]
    .filter(Boolean)
    .join(" ") || profile.email?.split("@")[0] || userId.slice(-8);

  await db.collection("users").doc(userId).set(
    {
      email:       profile.email       ?? null,
      firstName:   profile.firstName   ?? null,
      lastName:    profile.lastName    ?? null,
      displayName,
      profileSyncedAt: new Date(),
    },
    { merge: true },
  );
}

/**
 * Atomically deducts `cost` credits from a user's balance.
 *
 * Returns the remaining balance on success.
 * Throws if the user doesn't exist or has insufficient credits.
 */
export async function deductCredits(
  userId: string,
  cost: number,
): Promise<number> {
  const ref = db.collection("users").doc(userId);

  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);

    const throwInsufficient = (have: number) => {
      const err = new Error(
        `Insufficient credits — need ${cost}, have ${have}`,
      ) as Error & { code: string; creditsRemaining: number; needed: number };
      err.code             = "insufficient_credits";
      err.creditsRemaining = have;
      err.needed           = cost;
      throw err;
    };

    if (!doc.exists) {
      // User doc missing entirely — treat as inactive with 0 credits
      throwInsufficient(0);
    }

    const data    = doc.data()!;
    const plan    = data.plan ?? "starter";
    const cap     = PLAN_CREDITS[plan] ?? PLAN_CREDITS.starter;
    // Missing credits field → 0 (never grant free credits implicitly)
    const current = typeof data.credits === "number" ? data.credits : 0;

    if (current < cost) throwInsufficient(current);

    const remaining = current - cost;
    tx.update(ref, {
      credits:      remaining,
      // Back-fill creditsTotal if missing
      ...(typeof data.creditsTotal !== "number" && { creditsTotal: cap }),
      updatedAt:    new Date(),
    });
    return remaining;
  });
}

/**
 * Refunds `amount` credits to a user's balance (called when a job fails).
 * Never exceeds the plan cap.
 */
export async function refundCredits(
  userId: string,
  amount: number,
): Promise<void> {
  if (amount <= 0) return;
  const ref = db.collection("users").doc(userId);

  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) return;

    const data    = doc.data()!;
    const plan    = data.plan ?? "starter";
    const cap     = PLAN_CREDITS[plan] ?? PLAN_CREDITS.starter;
    // Missing credits field → 0 (same safe default as deductCredits)
    const current  = typeof data.credits === "number" ? data.credits : 0;
    const restored = Math.min(current + amount, cap);

    tx.update(ref, { credits: restored, updatedAt: new Date() });
  });
}

/**
 * Saves the user's country (from IP geolocation) to Firestore.
 * Always updates so admin "Refresh location" works correctly.
 */
export async function updateUserCountry(
  userId:      string,
  country:     string,
  countryCode: string,
): Promise<void> {
  const ref = db.collection("users").doc(userId);
  const doc = await ref.get();
  if (!doc.exists) return;
  await ref.update({ country, countryCode, updatedAt: new Date() });
}

/**
 * Adds credits to a user's current balance (called on credit top-up purchase).
 * Unlike topUpCredits, this ACCUMULATES on top of the existing balance.
 */
export async function addCredits(userId: string, amount: number): Promise<void> {
  const ref = db.collection("users").doc(userId);
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new Error(`User ${userId} not found`);
    const data    = doc.data()!;
    const current = typeof data.credits === "number" ? data.credits : 0;
    tx.update(ref, { credits: current + amount, updatedAt: new Date() });
  });
}

/**
 * Resets a user's credits to their plan cap (called on subscription payment/renewal).
 * Always sets to the plan cap — this is the monthly reset, not an accumulation.
 */
export async function topUpCredits(
  userId: string,
  plan: string,
): Promise<void> {
  const cap = PLAN_CREDITS[plan] ?? PLAN_CREDITS.starter;
  const ref = db.collection("users").doc(userId);
  const doc = await ref.get();

  if (doc.exists) {
    await ref.update({
      credits:      cap,
      creditsTotal: cap,
      updatedAt:    new Date(),
    });
  } else {
    await ref.set({
      plan,
      licenseStatus: "active",
      deviceLimit:   1,
      credits:       cap,
      creditsTotal:  cap,
      createdAt:     new Date(),
    });
  }
}
