import { currentUser }      from '@clerk/nextjs/server';
import { NextResponse }      from 'next/server';
import { getAffiliateByUserId } from '@/lib/affiliates';

/** GET /api/affiliate/stats, returns stats for the current user's affiliate profile */
export async function GET() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const affiliate = await getAffiliateByUserId(user.id);
  if (!affiliate) {
    return NextResponse.json({ error: 'No affiliate profile found' }, { status: 404 });
  }
  if (affiliate.status !== 'active') {
    return NextResponse.json({ error: 'Affiliate profile inactive' }, { status: 403 });
  }

  return NextResponse.json({
    affiliate,
    // All values shown to affiliate are manually set by admin
    stats: {
      totalEarnings:    affiliate.manualTotalEarnings,
      pendingEarnings:  affiliate.manualPendingEarnings,
      paidEarnings:     affiliate.manualPaidEarnings,
      activeMembers:    affiliate.manualActiveMembers,
      inactiveMembers:  affiliate.manualInactiveMembers,
    },
    chart: affiliate.manualChart,
  });
}
