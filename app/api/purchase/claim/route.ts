import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { claimPendingEntitlements, normalizeBillingEmail } from '@/lib/billing/fulfillment';
import { recordReferral } from '@/lib/affiliates';
import { db } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await currentUser();
  const email = normalizeBillingEmail(
    user?.primaryEmailAddress?.emailAddress
      ?? user?.emailAddresses?.[0]?.emailAddress,
  );
  if (!email) {
    return NextResponse.json({ error: 'No email on account' }, { status: 400 });
  }

  const claimed = await claimPendingEntitlements(email, userId);
  const activeClaims = claimed.filter((purchase) => purchase.active);

  const userSnap = await db.collection('users').doc(userId).get();
  const licenseStatus = userSnap.exists
    ? (userSnap.data()?.licenseStatus as string | undefined)
    : undefined;
  const paid = licenseStatus === 'active' || activeClaims.length > 0;

  if (paid) {
    const { onUserBecamePaid } = await import('@/lib/email/enrollments');
    const plan = activeClaims[activeClaims.length - 1]?.plan
      ?? (userSnap.data()?.plan as string | undefined)
      ?? 'starter';
    await onUserBecamePaid(userId, plan).catch(() => {});
    for (const purchase of activeClaims) {
      if (!purchase.refCode) continue;
      await recordReferral({
        affiliateCode: purchase.refCode,
        referredUserId: userId,
        referredEmail: email,
        orderId: purchase.subscriptionId,
        plan: purchase.plan,
        commission: 15,
      }).catch(() => {});
    }
  }

  return NextResponse.json(
    {
      claimed: claimed.length,
      active: activeClaims.length,
      plans: activeClaims.map((item) => item.plan),
      licenseStatus: licenseStatus ?? 'inactive',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
