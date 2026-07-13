import { requireUser } from '@/lib/auth/session';
import { NextResponse } from 'next/server';
import { resolveAffiliateForUser } from '@/lib/affiliates';
import { getOpenPayoutRequestForUser, getPayoutRequestsForUser } from '@/lib/payouts';

/** GET /api/affiliate/payout-requests */
export async function GET() {
  const authResult = await requireUser();
  if (!authResult.ok) return authResult.response;
  const { userId, email } = authResult.user;
  const user = { id: userId };
  const affiliate = await resolveAffiliateForUser(user.id, email);
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
