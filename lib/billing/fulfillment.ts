import crypto from 'node:crypto';
import { createClerkClient } from '@clerk/nextjs/server';
import { db } from '@/lib/firebaseAdmin';
import { PLAN_CREDITS } from '@/lib/firestore/users';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

export interface LemonEventInput {
  eventFingerprint: string;
  eventName: string;
  objectId: string;
  subscriptionId: string;
  claimId?: string;
  suppliedUserId?: string;
  buyerEmail?: string;
  customerId?: string;
  variantId: string;
  plan: string;
  renewsAt?: string;
  refCode?: string;
}

export interface FulfillmentResult {
  fresh: boolean;
  userId?: string;
  buyerEmail: string;
  claimId?: string;
  needsInvitation: boolean;
}

export function normalizeBillingEmail(email?: string): string {
  return (email ?? '').trim().toLowerCase();
}

function emailKey(email: string): string {
  return crypto.createHash('sha256').update(email).digest('hex');
}

function eventKey(input: LemonEventInput): string {
  return crypto.createHash('sha256')
    .update(input.eventFingerprint)
    .digest('hex');
}

function formatLsDate(iso?: string): string | null {
  if (!iso) return null;
  const normalized = iso.replace(/\.(\d{7})Z$/, (_, frac) => `.${frac.slice(0, 3)}Z`);
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export async function findClerkUserIdByEmail(email: string): Promise<string | undefined> {
  if (!email) return undefined;
  const result = await clerk.users.getUserList({ emailAddress: [email], limit: 2 });
  return result.data.find((user) =>
    user.emailAddresses.some((item) =>
      normalizeBillingEmail(item.emailAddress) === email,
    ),
  )?.id;
}

function userMutation(input: LemonEventInput): Record<string, unknown> {
  const now = new Date();
  switch (input.eventName) {
    case 'subscription_cancelled':
      return {
        lsCancelledAt: now,
        lsCancellationAt: input.renewsAt ?? null,
        updatedAt: now,
      };
    case 'subscription_expired':
      return {
        plan: 'starter',
        licenseStatus: 'inactive',
        renewalDate: null,
        lsSubscriptionId: input.subscriptionId,
        updatedAt: now,
      };
    case 'subscription_paused':
      return {
        licenseStatus: 'inactive',
        lsPausedAt: now,
        updatedAt: now,
      };
    default: {
      const cap = PLAN_CREDITS[input.plan] ?? PLAN_CREDITS.starter;
      return {
        plan: input.plan,
        licenseStatus: 'active',
        lsSubscriptionId: input.subscriptionId,
        renewalDate: formatLsDate(input.renewsAt),
        credits: cap,
        creditsTotal: cap,
        updatedAt: now,
      };
    }
  }
}

export async function processSubscriptionEvent(
  input: LemonEventInput,
): Promise<FulfillmentResult> {
  const buyerEmail = normalizeBillingEmail(input.buyerEmail);
  const suppliedClaimRef = input.claimId
    ? db.collection('purchase_claims').doc(input.claimId)
    : null;
  const subscriptionRef = db.collection('billing_subscriptions').doc(input.subscriptionId);

  const [claimSnap, subscriptionSnap] = await Promise.all([
    suppliedClaimRef?.get() ?? Promise.resolve(null),
    subscriptionRef.get(),
  ]);
  const claimData = claimSnap?.exists ? claimSnap.data() : undefined;
  const subscriptionData = subscriptionSnap.exists ? subscriptionSnap.data() : undefined;
  const resolvedClaimId = input.claimId
    ?? (subscriptionData?.claimId as string | undefined);
  const claimRef = resolvedClaimId
    ? db.collection('purchase_claims').doc(resolvedClaimId)
    : null;

  let userId = input.suppliedUserId
    ?? (claimData?.userId as string | undefined)
    ?? (subscriptionData?.userId as string | undefined);
  if (!userId && buyerEmail) userId = await findClerkUserIdByEmail(buyerEmail);

  const idempotencyRef = db.collection('ls_webhook_events').doc(eventKey(input));
  const pendingRef = resolvedClaimId && buyerEmail
    ? db.collection('pending_entitlements').doc(emailKey(buyerEmail))
      .collection('claims').doc(resolvedClaimId)
    : null;

  const fresh = await db.runTransaction(async (tx: any) => {
    const processed = await tx.get(idempotencyRef);
    if (processed.exists) return false;
    const userRef = userId ? db.collection('users').doc(userId) : null;
    const userSnap = userRef ? await tx.get(userRef) : null;

    const now = new Date();
    if (userId && userRef) {
      tx.set(userRef, {
        ...userMutation(input),
        ...(buyerEmail && { email: buyerEmail }),
        ...(!userSnap?.exists && { deviceLimit: 1, createdAt: now }),
      }, { merge: true });
    } else if (input.eventName === 'subscription_created' && pendingRef) {
      tx.set(pendingRef, {
        claimId: resolvedClaimId,
        buyerEmail,
        plan: input.plan,
        variantId: input.variantId,
        subscriptionId: input.subscriptionId,
        customerId: input.customerId ?? null,
        renewsAt: input.renewsAt ?? null,
        refCode: input.refCode ?? null,
        createdAt: now,
      });
    } else if (pendingRef && ['subscription_expired', 'subscription_paused'].includes(input.eventName)) {
      tx.set(pendingRef, {
        inactive: true,
        statusEvent: input.eventName,
        updatedAt: now,
      }, { merge: true });
    }

    tx.set(subscriptionRef, {
      claimId: resolvedClaimId ?? null,
      userId: userId ?? subscriptionData?.userId ?? null,
      buyerEmail: buyerEmail || subscriptionData?.buyerEmail || null,
      plan: input.plan,
      variantId: input.variantId,
      customerId: input.customerId ?? subscriptionData?.customerId ?? null,
      statusEvent: input.eventName,
      updatedAt: now,
    }, { merge: true });

    if (claimRef) {
      tx.set(claimRef, {
        status: userId ? 'fulfilled' : 'awaiting_account',
        buyerEmail: buyerEmail || null,
        subscriptionId: input.subscriptionId,
        customerId: input.customerId ?? null,
        plan: input.plan,
        userId: userId ?? null,
        paidAt: now,
        updatedAt: now,
      }, { merge: true });
    }

    tx.set(idempotencyRef, {
      eventName: input.eventName,
      objectId: input.objectId,
      subscriptionId: input.subscriptionId,
      claimId: resolvedClaimId ?? null,
      userId: userId ?? null,
      processedAt: now,
    });
    return true;
  });

  return {
    fresh,
    userId,
    buyerEmail,
    claimId: resolvedClaimId,
    needsInvitation: input.eventName === 'subscription_created' && !userId && !!buyerEmail,
  };
}

export async function ensurePurchaseInvitation(
  claimId: string,
  buyerEmail: string,
): Promise<void> {
  const claimRef = db.collection('purchase_claims').doc(claimId);
  const claim = await claimRef.get();
  if (!claim.exists || claim.data()?.invitationSentAt) return;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prysmor.io';
  try {
    await clerk.invitations.createInvitation({
      emailAddress: buyerEmail,
      redirectUrl: `${appUrl}/sign-up?purchase=${encodeURIComponent(claimId)}`,
      notify: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (!message.includes('already') && !message.includes('exist')) throw error;
  }

  await claimRef.set({ invitationSentAt: new Date(), updatedAt: new Date() }, { merge: true });
}

export async function claimPendingEntitlements(
  buyerEmail: string,
  userId: string,
): Promise<Array<{ subscriptionId: string; plan: string; active: boolean; refCode?: string }>> {
  const normalizedEmail = normalizeBillingEmail(buyerEmail);
  if (!normalizedEmail) return [];
  const pending = await db.collection('pending_entitlements')
    .doc(emailKey(normalizedEmail))
    .collection('claims')
    .get();
  const claimed: Array<{ subscriptionId: string; plan: string; active: boolean; refCode?: string }> = [];

  for (const doc of pending.docs) {
    let claimData: FirebaseFirestore.DocumentData | undefined;
    const didClaim = await db.runTransaction(async (tx: any) => {
      const snap = await tx.get(doc.ref);
      if (!snap.exists || snap.data()?.claimedAt) return false;
      const data = snap.data()!;
      claimData = data;
      const plan = String(data.plan ?? 'starter');
      const cap = PLAN_CREDITS[plan] ?? PLAN_CREDITS.starter;
      const inactive = data.inactive === true;
      const now = new Date();

      tx.set(db.collection('users').doc(userId), {
        plan: inactive ? 'starter' : plan,
        licenseStatus: inactive ? 'inactive' : 'active',
        lsSubscriptionId: data.subscriptionId,
        renewalDate: formatLsDate(data.renewsAt),
        credits: inactive ? 0 : cap,
        creditsTotal: inactive ? 0 : cap,
        deviceLimit: 1,
        email: normalizedEmail,
        createdAt: now,
        updatedAt: now,
      }, { merge: true });
      tx.set(db.collection('billing_subscriptions').doc(String(data.subscriptionId)), {
        userId,
        buyerEmail: normalizedEmail,
        updatedAt: now,
      }, { merge: true });
      tx.set(db.collection('purchase_claims').doc(String(data.claimId)), {
        status: 'fulfilled',
        userId,
        fulfilledAt: now,
        updatedAt: now,
      }, { merge: true });
      tx.update(doc.ref, { userId, claimedAt: now });
      return true;
    });
    if (didClaim && claimData) {
      claimed.push({
        subscriptionId: String(claimData.subscriptionId),
        plan: String(claimData.plan ?? 'starter'),
        active: claimData.inactive !== true,
        ...(claimData.refCode && { refCode: String(claimData.refCode) }),
      });
    }
  }
  return claimed;
}
