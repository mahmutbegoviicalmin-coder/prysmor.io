import { currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getReferralsByCode, resolveAffiliateForUser } from '@/lib/affiliates';

/** GET /api/affiliate/referrals */
export async function GET() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const email = user.emailAddresses[0]?.emailAddress ?? '';
  const affiliate = await resolveAffiliateForUser(user.id, email);
  if (!affiliate || affiliate.status !== 'active') {
    return NextResponse.json({ error: 'No affiliate profile found' }, { status: 404 });
  }

  const referrals = await getReferralsByCode(affiliate.code);
  return NextResponse.json({ referrals });
}
