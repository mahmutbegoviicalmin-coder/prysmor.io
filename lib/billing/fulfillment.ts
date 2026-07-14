import crypto from 'node:crypto';
import { db } from '@/lib/firebaseAdmin';
import { PLAN_CREDITS } from '@/lib/firestore/users';
import {
  ensureEmailUserIndex,
  ensureUserForEmail,
  normalizeEmail,
  resolveUserIdByEmail,
} from '@/lib/auth/identity';

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
  /** True when we should send a magic-link dashboard email (new/guest purchase). */
  needsMagicLink: boolean;
}

export function normalizeBillingEmail(email?: string): string {
  return normalizeEmail(email);
}

function emailHash(email: string): string {
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

/** @deprecated use resolveUserIdByEmail */
export async function findClerkUserIdByEmail(email: string): Promise<string | undefined> {
  return resolveUserIdByEmail(email);
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

  if (!userId && buyerEmail) {
    userId = await resolveUserIdByEmail(buyerEmail);
  }

  // Always create/attach a user for paid subscription events when we have email
  const isGranting = [
    'subscription_created',
    'subscription_payment_success',
    'subscription_updated',
    'subscription_resumed',
  ].includes(input.eventName);

  if (!userId && buyerEmail && isGranting) {
    const ensured = await ensureUserForEmail(buyerEmail);
    userId = ensured.userId;
  }

  const idempotencyRef = db.collection('ls_webhook_events').doc(eventKey(input));

  const fresh = await db.runTransaction(async (tx: any) => {
    const processed = await tx.get(idempotencyRef);
    if (processed.exists) return false;
    const userRef = userId ? db.collection('users').doc(userId) : null;
    const userSnap = userRef ? await tx.get(userRef) : null;

    const now = new Date();
    if (userId && userRef) {
      tx.set(userRef, {
        ...userMutation(input),
        ...(input.customerId && { lsCustomerId: String(input.customerId) }),
        ...(buyerEmail && { email: buyerEmail, emailKey: emailHash(buyerEmail) }),
        ...(!userSnap?.exists && { deviceLimit: 1, createdAt: now }),
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

  if (userId && buyerEmail) {
    await ensureEmailUserIndex(userId, buyerEmail).catch(() => {});
  }

  if (userId && input.customerId && isGranting) {
    const { syncUserBillingFromLs } = await import('@/lib/billing/lsCustomer');
    await syncUserBillingFromLs(userId, input.customerId).catch((err) => {
      console.warn('[fulfillment] LS billing sync failed:', err);
    });
  }

  return {
    fresh,
    userId,
    buyerEmail,
    claimId: resolvedClaimId,
    needsMagicLink: fresh && input.eventName === 'subscription_created' && !!buyerEmail && !!userId,
  };
}

export interface LifetimeOrderInput {
  eventFingerprint: string;
  orderId: string;
  claimId?: string;
  suppliedUserId?: string;
  buyerEmail?: string;
  customerId?: string;
  refCode?: string;
}

/** Fulfill one-time lifetime license from order_created. */
export async function fulfillLifetimeOrder(
  input: LifetimeOrderInput,
): Promise<FulfillmentResult> {
  const buyerEmail = normalizeBillingEmail(input.buyerEmail);
  const { LIFETIME_PRODUCT } = await import('@/lib/lemonsqueezy');
  const credits = LIFETIME_PRODUCT.credits;
  const plan = LIFETIME_PRODUCT.slug;

  let userId = input.suppliedUserId;
  if (!userId && buyerEmail) userId = await resolveUserIdByEmail(buyerEmail);
  if (!userId && buyerEmail) {
    const ensured = await ensureUserForEmail(buyerEmail);
    userId = ensured.userId;
  }

  const claimRef = input.claimId
    ? db.collection('purchase_claims').doc(input.claimId)
    : null;
  const idempotencyRef = db.collection('ls_webhook_events').doc(
    crypto.createHash('sha256').update(input.eventFingerprint).digest('hex'),
  );

  const fresh = await db.runTransaction(async (tx: any) => {
    const processed = await tx.get(idempotencyRef);
    if (processed.exists) return false;

    const now = new Date();
    if (userId) {
      const userRef = db.collection('users').doc(userId);
      const userSnap = await tx.get(userRef);
      tx.set(userRef, {
        plan,
        licenseStatus: 'active',
        credits,
        creditsTotal: credits,
        renewalDate: null,
        lsOrderId: input.orderId,
        ...(input.customerId && { lsCustomerId: String(input.customerId) }),
        deviceLimit: userSnap.exists ? (userSnap.data()?.deviceLimit ?? 1) : 1,
        ...(buyerEmail && { email: buyerEmail, emailKey: emailHash(buyerEmail) }),
        ...(!userSnap.exists && { createdAt: now }),
        updatedAt: now,
      }, { merge: true });
    }

    if (claimRef) {
      tx.set(claimRef, {
        status: userId ? 'fulfilled' : 'awaiting_account',
        buyerEmail: buyerEmail || null,
        orderId: input.orderId,
        customerId: input.customerId ?? null,
        plan,
        product: plan,
        userId: userId ?? null,
        paidAt: now,
        updatedAt: now,
      }, { merge: true });
    }

    tx.set(idempotencyRef, {
      eventName: 'order_created',
      orderId: input.orderId,
      claimId: input.claimId ?? null,
      userId: userId ?? null,
      product: plan,
      processedAt: now,
    });
    return true;
  });

  if (userId && buyerEmail) {
    await ensureEmailUserIndex(userId, buyerEmail).catch(() => {});
  }

  if (userId && input.customerId) {
    const { syncUserBillingFromLs } = await import('@/lib/billing/lsCustomer');
    await syncUserBillingFromLs(userId, input.customerId).catch((err) => {
      console.warn('[fulfillment] LS billing sync failed:', err);
    });
  }

  return {
    fresh,
    userId,
    buyerEmail,
    claimId: input.claimId,
    needsMagicLink: fresh && !!buyerEmail && !!userId,
  };
}

export async function ensurePurchaseMagicLink(
  claimId: string | undefined,
  buyerEmail: string,
  plan: string,
  opts?: { forceResend?: boolean },
): Promise<void> {
  if (!buyerEmail) return;

  if (claimId) {
    const claimRef = db.collection('purchase_claims').doc(claimId);
    const claim = await claimRef.get();
    if (claim.exists && claim.data()?.magicSentAt && !opts?.forceResend) return;

    const { sendPurchaseMagicEmail } = await import('@/lib/email/transactional');
    const redirect = claimId
      ? `/purchase/complete?claim=${encodeURIComponent(claimId)}`
      : '/dashboard';
    const emailResult = await sendPurchaseMagicEmail({
      to: buyerEmail,
      plan,
      redirect,
    });
    if (!emailResult.ok) {
      console.warn('[fulfillment] magic email failed:', emailResult.error);
      return;
    }
    if (claim.exists) {
      await claimRef.set({
        magicSentAt: new Date(),
        status: 'fulfilled',
        updatedAt: new Date(),
      }, { merge: true });
    }
    return;
  }

  const { sendPurchaseMagicEmail } = await import('@/lib/email/transactional');
  await sendPurchaseMagicEmail({ to: buyerEmail, plan, redirect: '/dashboard' });
}

/** @deprecated use ensurePurchaseMagicLink */
export async function ensurePurchaseInvitation(
  claimId: string,
  buyerEmail: string,
  plan?: string,
  opts?: { forceResend?: boolean },
): Promise<void> {
  await ensurePurchaseMagicLink(claimId, buyerEmail, plan ?? 'starter', opts);
}

export async function ensureOrderConfirmedEmail(
  claimId: string | undefined,
  buyerEmail: string,
  plan: string,
): Promise<void> {
  if (!buyerEmail) return;

  if (claimId) {
    const claimRef = db.collection('purchase_claims').doc(claimId);
    const claim = await claimRef.get();
    if (claim.exists && claim.data()?.confirmationEmailSentAt) return;

    const { sendOrderConfirmedEmail } = await import('@/lib/email/transactional');
    const emailResult = await sendOrderConfirmedEmail({ to: buyerEmail, plan });
    if (!emailResult.ok) {
      console.warn('[fulfillment] order confirmed email failed:', emailResult.error);
      return;
    }
    if (claim.exists) {
      await claimRef.set(
        { confirmationEmailSentAt: new Date(), updatedAt: new Date() },
        { merge: true },
      );
    }
    return;
  }

  const { sendOrderConfirmedEmail } = await import('@/lib/email/transactional');
  await sendOrderConfirmedEmail({ to: buyerEmail, plan }).then((result) => {
    if (!result.ok) console.warn('[fulfillment] order confirmed email failed:', result.error);
  });
}

/** Legacy pending_entitlements support for any in-flight guest purchases. */
export async function claimPendingEntitlements(
  buyerEmail: string,
  userId: string,
): Promise<Array<{ subscriptionId: string; plan: string; active: boolean; refCode?: string }>> {
  const normalizedEmail = normalizeBillingEmail(buyerEmail);
  if (!normalizedEmail) return [];
  const pending = await db.collection('pending_entitlements')
    .doc(emailHash(normalizedEmail))
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
      if (data.claimId) {
        tx.set(db.collection('purchase_claims').doc(String(data.claimId)), {
          status: 'fulfilled',
          userId,
          fulfilledAt: now,
          updatedAt: now,
        }, { merge: true });
      }
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
  await ensureEmailUserIndex(userId, normalizedEmail).catch(() => {});
  return claimed;
}
