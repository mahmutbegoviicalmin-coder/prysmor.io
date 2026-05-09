import { currentUser }            from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db }                        from '@/lib/firebaseAdmin';
import { getAllAffiliates, getReferralsByCode, generateCode } from '@/lib/affiliates';

const ADMIN_EMAILS = ['mahmutbegoviic.almin@gmail.com'];

function isAdmin(email: string) {
  return ADMIN_EMAILS.includes(email);
}

/** GET /api/admin/affiliates — list all affiliates with referral counts */
export async function GET() {
  const user  = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress ?? '';
  if (!isAdmin(email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const affiliates = await getAllAffiliates();

  // Fetch referral counts for each affiliate in parallel
  const withStats = await Promise.all(
    affiliates.map(async (aff) => {
      const referrals = await getReferralsByCode(aff.code);
      const active   = referrals.filter(r => r.status === 'pending').length;
      const paid     = referrals.filter(r => r.status === 'paid').length;
      return { ...aff, referralCount: referrals.length, activeCount: active, paidCount: paid, referrals };
    })
  );

  return NextResponse.json({ affiliates: withStats });
}

/** POST /api/admin/affiliates — create a new affiliate */
export async function POST(req: NextRequest) {
  const user  = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress ?? '';
  if (!isAdmin(email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body: { email: string; userId: string; code?: string; commissionPercent?: number } = await req.json();
  if (!body.email || !body.userId) {
    return NextResponse.json({ error: 'email and userId are required' }, { status: 400 });
  }

  // Check for duplicate
  const existing = await db.collection('affiliates').where('email', '==', body.email).limit(1).get();
  if (!existing.empty) {
    return NextResponse.json({ error: 'Affiliate with this email already exists' }, { status: 409 });
  }

  const code = body.code?.toUpperCase() || generateCode(body.email);
  const ref  = db.collection('affiliates').doc();
  await ref.set({
    email:                 body.email,
    userId:                body.userId,
    code,
    commissionPercent:     body.commissionPercent ?? 15,
    manualTotalEarnings:   0,
    manualPendingEarnings: 0,
    manualPaidEarnings:    0,
    manualActiveMembers:   0,
    manualInactiveMembers: 0,
    note:                  '',
    status:                'active',
    createdAt:             new Date(),
    updatedAt:             new Date(),
  });

  return NextResponse.json({ id: ref.id, code }, { status: 201 });
}
