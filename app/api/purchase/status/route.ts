import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/firebaseAdmin';

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

  return NextResponse.json(
    {
      status: data.status,
      fulfilledForCurrentUser,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
