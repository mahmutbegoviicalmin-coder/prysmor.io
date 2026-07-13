/**
 * Simulate a Starter purchase for an email (magic-link flow, no Lemon charge).
 * Usage: npx tsx --env-file=.env.local scripts/simulate-purchase-email.ts you@email.com
 */
import crypto from 'node:crypto';

const email = (process.argv[2] || '').trim().toLowerCase();
if (!email || !email.includes('@')) {
  console.error('Usage: npx tsx --env-file=.env.local scripts/simulate-purchase-email.ts <email>');
  process.exit(1);
}

async function main() {
  const { db } = await import('../lib/firebaseAdmin');
  const {
    ensurePurchaseMagicLink,
    processSubscriptionEvent,
  } = await import('../lib/billing/fulfillment');
  const { resolveUserIdByEmail } = await import('../lib/auth/identity');
  const { appBaseUrl } = await import('../lib/email/constants');

  if (!db) throw new Error('Firebase not initialized');

  const existingUserId = await resolveUserIdByEmail(email);
  const claimId = crypto.randomBytes(32).toString('hex');
  const subscriptionId = `sim_sub_${Date.now()}`;
  const variantId = '1455040';
  const plan = 'starter';

  await db.collection('purchase_claims').doc(claimId).set({
    status: 'pending_checkout',
    plan,
    billing: 'monthly',
    buyerEmail: email,
    userId: existingUserId ?? null,
    simulated: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const result = await processSubscriptionEvent({
    eventFingerprint: crypto.randomBytes(16).toString('hex'),
    eventName: 'subscription_created',
    objectId: subscriptionId,
    subscriptionId,
    claimId,
    suppliedUserId: existingUserId,
    buyerEmail: email,
    variantId,
    plan,
    renewsAt: new Date(Date.now() + 30 * 86400000).toISOString(),
  });

  if (result.needsMagicLink && result.buyerEmail) {
    await ensurePurchaseMagicLink(result.claimId, result.buyerEmail, plan, { forceResend: true });
  }

  if (result.userId) {
    const { onUserBecamePaid } = await import('../lib/email/enrollments');
    await onUserBecamePaid(result.userId, plan).catch(() => {});
  }

  const claim = (await db.collection('purchase_claims').doc(claimId).get()).data();
  const user = result.userId
    ? (await db.collection('users').doc(result.userId).get()).data()
    : null;

  console.log(JSON.stringify({
    email,
    claimId,
    subscriptionId,
    fulfillment: {
      fresh: result.fresh,
      userId: result.userId ?? null,
      needsMagicLink: result.needsMagicLink,
    },
    claimStatus: claim?.status ?? null,
    magicSentAt: claim?.magicSentAt ?? null,
    licenseStatus: user?.licenseStatus ?? null,
    plan: user?.plan ?? null,
    purchaseComplete: `${appBaseUrl()}/purchase/complete?claim=${claimId}`,
    signIn: `${appBaseUrl()}/sign-in`,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
