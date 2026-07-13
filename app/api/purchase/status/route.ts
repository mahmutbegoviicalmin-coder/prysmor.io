import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
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
  const { userId } = await auth();
  const fulfilledForCurrentUser =
    data.status === 'fulfilled' && !!userId && data.userId === userId;
  const planKey = typeof data.plan === 'string' ? data.plan : null;
  const activationUrl =
    data.status === 'awaiting_account' && typeof data.activationUrl === 'string'
      ? data.activationUrl
      : null;

  return NextResponse.json(
    {
      status: data.status,
      fulfilledForCurrentUser,
      plan: planKey ? (PLAN_LABELS[planKey] ?? planKey) : null,
      activationUrl,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
