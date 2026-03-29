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
    await ref.set({
      plan:           "starter",
      licenseStatus:  "active",
      deviceLimit:    2,
      credits:        PLAN_CREDITS.starter,
      creditsTotal:   PLAN_CREDITS.starter,
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
      // New user — initialise with Starter plan credits and deduct in one write
      const cap       = PLAN_CREDITS.starter;
      const remaining = cap - cost;
      if (remaining < 0) throwInsufficient(cap);
      tx.set(ref, {
        plan:          "starter",
        licenseStatus: "active",
        deviceLimit:   2,
        credits:       remaining,
        creditsTotal:  cap,
        createdAt:     new Date(),
        updatedAt:     new Date(),
      });
      return remaining;
    }

    const data    = doc.data()!;
    const plan    = data.plan ?? "starter";
    const cap     = PLAN_CREDITS[plan] ?? PLAN_CREDITS.starter;
    // Treat missing credits field as full plan cap
    const current = typeof data.credits === "number" ? data.credits : cap;

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
    const current = typeof data.credits === "number" ? data.credits : cap;
    const restored = Math.min(current + amount, cap);

    tx.update(ref, { credits: restored, updatedAt: new Date() });
  });
}

/**
 * Top-ups a user's credits to the plan cap (called on subscription payment).
 * If the user already has more credits than the plan cap, keeps the higher value.
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
      deviceLimit:   2,
      credits:       cap,
      creditsTotal:  cap,
      createdAt:     new Date(),
    });
  }
}
