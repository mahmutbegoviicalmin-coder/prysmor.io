import { currentUser }      from '@clerk/nextjs/server';
import { NextResponse }      from 'next/server';
import { getAffiliateByUserId, getReferralsByCode } from '@/lib/affiliates';

const AFFILIATE_EMAILS = ['mahmutbegoviic.almin@gmail.com', 'brzotrcipuska7@gmail.com'];

/** GET /api/affiliate/stats — returns stats for the current user's affiliate profile */
export async function GET() {
  const user  = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress ?? '';

  if (!AFFILIATE_EMAILS.includes(email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const affiliate = await getAffiliateByUserId(user!.id);
  if (!affiliate) {
    return NextResponse.json({ error: 'No affiliate profile found' }, { status: 404 });
  }

  const referrals = await getReferralsByCode(affiliate.code);
  const active    = referrals.filter(r => r.status === 'pending').length;
  const paid      = referrals.filter(r => r.status === 'paid').length;

  return NextResponse.json({
    affiliate,
    referrals,
    stats: {
      totalReferrals:    referrals.length,
      activeReferrals:   active,
      paidReferrals:     paid,
      totalEarnings:     affiliate.totalEarnings,
      pendingEarnings:   affiliate.pendingEarnings,
      paidEarnings:      affiliate.paidEarnings,
    },
  });
}
