import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { db } from '@/lib/firebaseAdmin';
import { PLAN_LABELS } from '@/lib/firestore/users';

export async function GET(req: NextRequest) {
  const claimId = req.nextUrl.searchParams.get('claim') ?? '';
  if (!/^[a-f0-9]{64}$/.test(claimId)) {
    return NextResponse.json({ status: 'invalid' }, { status: 400 });
  }

  const snap = await db.collection('purchase_claims').doc(claimId).get();
  if (!snap.exists) {
    return NextResponse.json({ status: 'invalid' }, { status: 404 });
  }

  const data = snap.data()!;
  const session = await getSessionUser();
  const fulfilledForCurrentUser =
    data.status === 'fulfilled' && !!session && data.userId === session.userId;
  const planKey = typeof data.plan === 'string' ? data.plan : null;

  return NextResponse.json(
    {
      status: data.status,
      fulfilledForCurrentUser,
      plan: planKey ? (PLAN_LABELS[planKey] ?? planKey) : null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
