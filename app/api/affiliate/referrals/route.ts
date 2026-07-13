import { requireUser } from '@/lib/auth/session';
import { NextResponse } from 'next/server';
import { getReferralsByCode, resolveAffiliateForUser } from '@/lib/affiliates';

/** GET /api/affiliate/referrals */
export async function GET() {
  const authResult = await requireUser();
  if (!authResult.ok) return authResult.response;
  const { userId, email } = authResult.user;
  const user = { id: userId };
  const affiliate = await resolveAffiliateForUser(user.id, email);
  if (!affiliate || affiliate.status !== 'active') {
    return NextResponse.json({ error: 'No affiliate profile found' }, { status: 404 });
  }

  const referrals = await getReferralsByCode(affiliate.code);
  return NextResponse.json({ referrals });
}
