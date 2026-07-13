import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { db } from '@/lib/firebaseAdmin';
import { PLAN_LABELS } from '@/lib/firestore/users';
import { LIFETIME_PRODUCT } from '@/lib/lemonsqueezy';

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
  const orderId = typeof data.orderId === 'string' ? data.orderId : null;
  const purchaseValue =
    typeof data.purchaseValue === 'number' && data.purchaseValue > 0
      ? data.purchaseValue
      : LIFETIME_PRODUCT.price;
  const purchaseCurrency =
    typeof data.purchaseCurrency === 'string' ? data.purchaseCurrency : 'USD';
  const metaEventId =
    typeof data.metaEventId === 'string'
      ? data.metaEventId
      : orderId
        ? `purchase_${orderId}`
        : null;

  return NextResponse.json(
    {
      status: data.status,
      fulfilledForCurrentUser,
      plan: planKey ? (PLAN_LABELS[planKey] ?? planKey) : null,
      planKey,
      // Meta Pixel Purchase (browser) — same event_id as CAPI
      purchase: {
        value: purchaseValue,
        currency: purchaseCurrency,
        orderId,
        eventId: metaEventId,
        contentName: planKey === 'lifetime' ? LIFETIME_PRODUCT.label : (planKey ?? 'Prysmor'),
        contentIds: [planKey ?? 'lifetime'],
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
