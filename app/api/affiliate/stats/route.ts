import { currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { resolveAffiliateForUser } from '@/lib/affiliates';

/** GET /api/affiliate/stats */
export async function GET() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const email = user.emailAddresses[0]?.emailAddress ?? '';
  const affiliate = await resolveAffiliateForUser(user.id, email);
  if (!affiliate) {
    return NextResponse.json({ error: 'No affiliate profile found' }, { status: 404 });
  }
  if (affiliate.status !== 'active') {
    return NextResponse.json({ error: 'Staff profile inactive' }, { status: 403 });
  }

  return NextResponse.json({
    affiliate: {
      commissionPercent: affiliate.commissionPercent,
      note: affiliate.note,
    },
    stats: {
      totalEarnings: affiliate.manualTotalEarnings,
      pendingEarnings: affiliate.manualPendingEarnings,
      paidEarnings: affiliate.manualPaidEarnings,
      activeMembers: affiliate.manualActiveMembers,
      inactiveMembers: affiliate.manualInactiveMembers,
      starterCount: affiliate.manualStarterCount,
      proCount: affiliate.manualProCount,
      exclusiveCount: affiliate.manualExclusiveCount,
    },
  });
}
