import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import {
  DEFAULT_AFFILIATE_CHART,
  generateCode,
  getAllAffiliates,
  getReferralsByCode,
  normalizeAffiliateEmail,
} from '@/lib/affiliates';
import { requireAdmin } from '@/lib/admin/auth';

/** GET /api/admin/affiliates — list all affiliates with referral counts */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const affiliates = await getAllAffiliates();

  const withStats = await Promise.all(
    affiliates.map(async (aff) => {
      const referrals = await getReferralsByCode(aff.code);
      const active = referrals.filter((r) => r.status === 'pending').length;
      const paid = referrals.filter((r) => r.status === 'paid').length;
      return { ...aff, referralCount: referrals.length, activeCount: active, paidCount: paid, referrals };
    }),
  );

  return NextResponse.json({ affiliates: withStats });
}

/** POST /api/admin/affiliates — create affiliate (email only; Clerk ID optional) */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body: {
    email: string;
    userId?: string;
    code?: string;
    commissionPercent?: number;
  } = await req.json();

  const email = normalizeAffiliateEmail(body.email ?? '');
  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  const existing = await db.collection('affiliates').where('email', '==', email).limit(1).get();
  if (!existing.empty) {
    return NextResponse.json({ error: 'Staff member with this email already exists' }, { status: 409 });
  }

  const userId = body.userId?.trim() || null;
  if (userId) {
    const linked = await db.collection('affiliates').where('userId', '==', userId).limit(1).get();
    if (!linked.empty) {
      return NextResponse.json({ error: 'This Clerk user is already linked to another affiliate' }, { status: 409 });
    }
  }

  const code = body.code?.trim().toUpperCase() || generateCode(email);
  const codeTaken = await db.collection('affiliates').where('code', '==', code).limit(1).get();
  if (!codeTaken.empty) {
    return NextResponse.json({ error: 'Referral code already in use' }, { status: 409 });
  }

  const ref = db.collection('affiliates').doc();
  await ref.set({
    email,
    userId,
    code,
    commissionPercent: body.commissionPercent ?? 15,
    manualTotalEarnings: 0,
    manualPendingEarnings: 0,
    manualPaidEarnings: 0,
    manualActiveMembers: 0,
    manualInactiveMembers: 0,
    manualStarterCount: 0,
    manualProCount: 0,
    manualExclusiveCount: 0,
    manualChart: DEFAULT_AFFILIATE_CHART,
    note: '',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return NextResponse.json({ id: ref.id, code, linked: Boolean(userId) }, { status: 201 });
}
