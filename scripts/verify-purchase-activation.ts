/**
 * Local verification of post-purchase activation (guest + signed-in paths).
 * Does not charge Lemon Squeezy. May create Clerk invitations and send Resend emails.
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/verify-purchase-activation.ts
 *   npx tsx --env-file=.env.local scripts/verify-purchase-activation.ts
 */
import crypto from 'node:crypto';
import fs from 'node:fs';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

assert(process.env.CLERK_SECRET_KEY, 'Missing CLERK_SECRET_KEY (pass --env-file=.env.local)');
assert(process.env.FIREBASE_PRIVATE_KEY, 'Missing FIREBASE_PRIVATE_KEY (pass --env-file=.env.local)');
assert(process.env.RESEND_API_KEY, 'Missing RESEND_API_KEY (pass --env-file=.env.local)');

async function main() {
  const { createClerkClient } = await import('@clerk/nextjs/server');
  const { db } = await import('../lib/firebaseAdmin');
  const {
    claimPendingEntitlements,
    ensureOrderConfirmedEmail,
    ensurePurchaseInvitation,
    findClerkUserIdByEmail,
    processSubscriptionEvent,
  } = await import('../lib/billing/fulfillment');

  assert(db, 'Firebase admin db failed to initialize (check .env.local)');

  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const variantId = '1455040';

  async function createClaim(email?: string, userId?: string) {
    const claimId = crypto.randomBytes(32).toString('hex');
    await db.collection('purchase_claims').doc(claimId).set({
      status: 'pending_checkout',
      plan: 'starter',
      billing: 'monthly',
      buyerEmail: email ?? null,
      userId: userId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return claimId;
  }

  console.log('\n=== Redirect / route invariants ===');
  {
    const authRedirect = fs.readFileSync('app/auth-redirect/page.tsx', 'utf8');
    assert(authRedirect.includes('/purchase/complete?claim='), 'purchase buyers go to complete');
    assert(authRedirect.includes("licenseStatus === \"active\""), 'paid users skip playground');
    assert(authRedirect.includes('/api/purchase/claim'), 'auth-redirect retries claim');

    const activate = fs.readFileSync('app/activate/page.tsx', 'utf8');
    assert(activate.includes('forceRedirectUrl'), 'activate forces purchase redirect');
    assert(activate.includes('Create a password once'), 'password-once copy');

    const fulfillment = fs.readFileSync('lib/billing/fulfillment.ts', 'utf8');
    assert(fulfillment.includes('notify: false'), 'Clerk invitation is silent');
    assert(fulfillment.includes('/activate?purchase='), 'invitation redirects to /activate');

    const middleware = fs.readFileSync('middleware.ts', 'utf8');
    assert(middleware.includes('"/activate"'), '/activate is public');
    console.log('Route invariants OK');
  }

  console.log('\n=== Guest purchase path ===');
  {
    const guestEmail = `activation.guest.${Date.now()}@prysmor.io`;
    const claimId = await createClaim(guestEmail);
    const subscriptionId = `sim_guest_${Date.now()}`;

    const result = await processSubscriptionEvent({
      eventFingerprint: crypto.randomBytes(16).toString('hex'),
      eventName: 'subscription_created',
      objectId: subscriptionId,
      subscriptionId,
      claimId,
      buyerEmail: guestEmail,
      variantId,
      plan: 'starter',
      renewsAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    });

    assert(result.fresh, 'guest event should be fresh');
    assert(result.needsInvitation, 'guest should need invitation');
    assert(!result.userId, 'guest should have no userId');

    await ensurePurchaseInvitation(claimId, guestEmail, 'starter');

    const claim = (await db.collection('purchase_claims').doc(claimId).get()).data();
    assert(claim?.status === 'awaiting_account', `expected awaiting_account, got ${claim?.status}`);
    assert(claim?.invitationSentAt, 'invitationSentAt should be set after Resend send');

    await ensurePurchaseInvitation(claimId, guestEmail, 'starter');

    const invitations = await clerk.invitations.getInvitationList({ status: 'pending' });
    const invite = invitations.data.find(
      (item) => item.emailAddress.toLowerCase() === guestEmail.toLowerCase(),
    );
    assert(invite, 'Clerk silent invitation should exist');
    assert(invite.url, 'invitation should expose accept URL for branded email CTA');

    const fakeUserId = `user_sim_${crypto.randomBytes(6).toString('hex')}`;
    await db.collection('users').doc(fakeUserId).set({
      plan: 'starter',
      licenseStatus: 'inactive',
      email: guestEmail,
      createdAt: new Date(),
      updatedAt: new Date(),
    }, { merge: true });

    const claimed = await claimPendingEntitlements(guestEmail, fakeUserId);
    assert(claimed.length === 1 && claimed[0].active, 'claim retry should attach entitlement');

    const userAfter = (await db.collection('users').doc(fakeUserId).get()).data();
    assert(userAfter?.licenseStatus === 'active', 'user should be active after claim');
    assert(userAfter?.plan === 'starter', 'plan should be starter');

    const claimAfter = (await db.collection('purchase_claims').doc(claimId).get()).data();
    assert(claimAfter?.status === 'fulfilled', 'claim should be fulfilled');

    if (invite?.id) {
      await clerk.invitations.revokeInvitation(invite.id).catch(() => {});
    }

    console.log('Guest path OK', { claimId, subscriptionId, fakeUserId, guestEmail });
  }

  console.log('\n=== Signed-in purchase path ===');
  {
    const email = (process.env.VERIFY_SIGNED_IN_EMAIL || '').trim().toLowerCase();
    if (!email) {
      const userId = `user_sim_signed_${crypto.randomBytes(6).toString('hex')}`;
      const buyerEmail = `${userId}@example.com`;
      const claimId = await createClaim(buyerEmail, userId);
      await db.collection('users').doc(userId).set({
        plan: 'starter',
        licenseStatus: 'inactive',
        email: buyerEmail,
        createdAt: new Date(),
        updatedAt: new Date(),
      }, { merge: true });

      const subscriptionId = `sim_signed_${Date.now()}`;
      const result = await processSubscriptionEvent({
        eventFingerprint: crypto.randomBytes(16).toString('hex'),
        eventName: 'subscription_created',
        objectId: subscriptionId,
        subscriptionId,
        claimId,
        suppliedUserId: userId,
        buyerEmail,
        variantId,
        plan: 'starter',
      });

      assert(result.fresh && result.userId === userId, 'signed-in fulfillment should bind user');
      assert(!result.needsInvitation, 'signed-in should not need invitation');

      const userAfter = (await db.collection('users').doc(userId).get()).data();
      assert(userAfter?.licenseStatus === 'active', 'signed-in user should be active');
      console.log('Signed-in fulfillment OK (no Resend)', { claimId, userId });
    } else {
      const userId = await findClerkUserIdByEmail(email);
      assert(userId, `No Clerk user for ${email}`);
      const claimId = await createClaim(email, userId);
      const subscriptionId = `sim_signed_${Date.now()}`;
      const result = await processSubscriptionEvent({
        eventFingerprint: crypto.randomBytes(16).toString('hex'),
        eventName: 'subscription_created',
        objectId: subscriptionId,
        subscriptionId,
        claimId,
        suppliedUserId: userId,
        buyerEmail: email,
        variantId,
        plan: 'starter',
      });
      assert(result.fresh && !result.needsInvitation, 'signed-in path');
      await ensureOrderConfirmedEmail(claimId, email, 'starter');
      const claim = (await db.collection('purchase_claims').doc(claimId).get()).data();
      assert(claim?.confirmationEmailSentAt, 'confirmationEmailSentAt set');
      await ensureOrderConfirmedEmail(claimId, email, 'starter');
      console.log('Signed-in path OK', { claimId, userId, email });
    }
  }

  console.log('\nAll purchase activation checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
