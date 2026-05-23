import { currentUser }      from '@clerk/nextjs/server';
import { NextResponse }      from 'next/server';
import { getAffiliateByUserId, getReferralsByCode } from '@/lib/affiliates';

const AFFILIATE_EMAILS = ['mahmutbegoviic.almin@gmail.com', 'brzotrcipuska7@gmail.com'];

/** GET /api/affiliate/stats — returns stats for the current user's affiliate profile */
export async function GET() {
  const user   = await currentUser();
  const emails = user?.emailAddresses?.map(e => e.emailAddress) ?? [];
  if (!emails.some(e => AFFILIATE_EMAILS.includes(e))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const affiliate = await getAffiliateByUserId(user!.id);
  if (!affiliate) {
    return NextResponse.json({ error: 'No affiliate profile found' }, { status: 404 });
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
  });
}
