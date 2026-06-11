import { currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getAffiliateByUserId } from '@/lib/affiliates';
import { getOpenPayoutRequestForUser, getPayoutRequestsForUser } from '@/lib/payouts';

/** GET /api/affiliate/payout-requests */
export async function GET() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const affiliate = await getAffiliateByUserId(user.id);
  if (!affiliate || affiliate.status !== 'active') {
    return NextResponse.json({ error: 'No affiliate profile found' }, { status: 404 });
  }

  const [requests, openRequest] = await Promise.all([
    getPayoutRequestsForUser(user.id),
    getOpenPayoutRequestForUser(user.id),
  ]);

  return NextResponse.json({
    requests,
    openRequest,
    availableAmount: affiliate.manualPendingEarnings,
  });
}
