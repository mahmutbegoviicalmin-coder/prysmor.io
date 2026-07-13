/**
 * Resend activation email for an existing awaiting_account claim.
 * Usage: npx tsx --env-file=.env.local scripts/resend-activation.ts <email|claimId>
 */
const target = (process.argv[2] || '').trim().toLowerCase();
if (!target) {
  console.error('Usage: npx tsx --env-file=.env.local scripts/resend-activation.ts <email|claimId>');
  process.exit(1);
}

async function main() {
  const { db } = await import('../lib/firebaseAdmin');
  const { ensurePurchaseInvitation, normalizeBillingEmail } = await import('../lib/billing/fulfillment');
  if (!db) throw new Error('Firebase not initialized');

  let claimId = /^[a-f0-9]{64}$/.test(target) ? target : '';
  let email = '';
  let plan = 'starter';

  if (claimId) {
    const snap = await db.collection('purchase_claims').doc(claimId).get();
    if (!snap.exists) throw new Error('Claim not found');
    const data = snap.data()!;
    email = normalizeBillingEmail(data.buyerEmail as string | undefined);
    plan = String(data.plan ?? 'starter');
  } else {
    email = normalizeBillingEmail(target);
    const all = await db.collection('purchase_claims').orderBy('createdAt', 'desc').limit(80).get();
    const match = all.docs.find(
      (d) => normalizeBillingEmail(d.data()?.buyerEmail) === email && d.data()?.status === 'awaiting_account',
    ) ?? all.docs.find((d) => normalizeBillingEmail(d.data()?.buyerEmail) === email);
    if (!match) throw new Error(`No purchase claim for ${email}`);
    claimId = match.id;
    plan = String(match.data()?.plan ?? 'starter');
  }

  if (!email) throw new Error('Claim has no buyer email');

  await ensurePurchaseInvitation(claimId, email, plan, { forceResend: true });
  const claim = (await db.collection('purchase_claims').doc(claimId).get()).data();
  console.log(JSON.stringify({
    email,
    claimId,
    status: claim?.status,
    activationUrl: claim?.activationUrl ?? null,
    invitationSentAt: claim?.invitationSentAt ?? null,
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
