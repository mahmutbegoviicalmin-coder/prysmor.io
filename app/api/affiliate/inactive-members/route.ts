import { currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { getReferralsByCode, resolveAffiliateForUser } from '@/lib/affiliates';

export const runtime = 'nodejs';

interface InactiveMember {
  email: string;
  country: string;
  countryCode: string;
  plan: string;
  joinedAt: string | null;
}

/**
 * GET /api/affiliate/inactive-members
 *
 * Returns the staff member's referred users whose subscription is NOT active
 * (churned / inactive), with their email address and location. Active users are
 * filtered out server-side and never returned.
 */
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

  // Unique referred users (a user may have multiple referral rows)
  const byUser = new Map<string, { email: string; createdAt: string | null }>();
  for (const r of referrals) {
    if (!r.referredUserId) continue;
    if (!byUser.has(r.referredUserId)) {
      byUser.set(r.referredUserId, { email: r.referredEmail, createdAt: r.createdAt });
    }
  }

  const userIds = Array.from(byUser.keys());
  if (userIds.length === 0) {
    return NextResponse.json({ members: [] });
  }

  // Batch-read user docs
  const refs = userIds.map((id) => db.collection('users').doc(id));
  const docs = await db.getAll(...refs);

  const members: InactiveMember[] = [];
  for (const doc of docs) {
    const fallback = byUser.get(doc.id);
    const data = doc.exists ? doc.data() ?? {} : {};
    const status = (data.licenseStatus as string) ?? 'inactive';

    // Only inactive — never active or trialing.
    if (status === 'active' || status === 'trialing') continue;

    members.push({
      email: (data.email as string) || fallback?.email || '—',
      country: (data.country as string) || 'Unknown',
      countryCode: (data.countryCode as string) || '',
      plan: (data.plan as string) || 'unpaid',
      joinedAt: fallback?.createdAt ?? null,
    });
  }

  members.sort((a, b) => {
    if (!a.joinedAt) return 1;
    if (!b.joinedAt) return -1;
    return b.joinedAt.localeCompare(a.joinedAt);
  });

  return NextResponse.json({ members });
}
