import { requireUser } from '@/lib/auth/session';
import { NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { resolveAffiliateForUser } from '@/lib/affiliates';
import { getOpenPayoutRequestForUser } from '@/lib/payouts';

interface PayoutBody {
  method: 'paypal' | 'bank';
  paypalMeLink?: string;
  bank?: {
    firstName?: string;
    lastName?: string;
    address?: string;
    city?: string;
    phone?: string;
    accountNumber?: string;
  };
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** POST /api/affiliate/payout-request */
export async function POST(req: Request) {
  const authResult = await requireUser();
  if (!authResult.ok) return authResult.response;
  const { userId, email } = authResult.user;
  const user = { id: userId };
  const affiliate = await resolveAffiliateForUser(user.id, email);
  if (!affiliate || affiliate.status !== 'active') {
    return NextResponse.json({ error: 'No affiliate profile found' }, { status: 404 });
  }

  const amount = affiliate.manualPendingEarnings;
  if (amount <= 0) {
    return NextResponse.json({ error: 'No pending balance available for payout' }, { status: 400 });
  }

  const existing = await getOpenPayoutRequestForUser(user.id);
  if (existing) {
    return NextResponse.json({ error: 'You already have a pending payout request' }, { status: 409 });
  }

  const body = (await req.json()) as PayoutBody;
  const method = body.method === 'bank' ? 'bank' : 'paypal';

  if (method === 'paypal') {
    const paypalMeLink = clean(body.paypalMeLink);
    if (!paypalMeLink) {
      return NextResponse.json({ error: 'PayPal.me link is required' }, { status: 400 });
    }
    if (!paypalMeLink.includes('paypal.me')) {
      return NextResponse.json({ error: 'Enter a valid PayPal.me link' }, { status: 400 });
    }

    const ref = await db.collection('payoutRequests').add({
      affiliateId: affiliate.id,
      userId: user.id,
      email: affiliate.email,
      amount,
      method: 'paypal',
      paypalMeLink,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json({ ok: true, id: ref.id });
  }

  const bank = {
    firstName: clean(body.bank?.firstName),
    lastName: clean(body.bank?.lastName),
    address: clean(body.bank?.address),
    city: clean(body.bank?.city),
    phone: clean(body.bank?.phone),
    accountNumber: clean(body.bank?.accountNumber),
  };

  if (!bank.firstName || !bank.lastName || !bank.address || !bank.city || !bank.phone || !bank.accountNumber) {
    return NextResponse.json({ error: 'All bank transfer fields are required' }, { status: 400 });
  }

  const ref = await db.collection('payoutRequests').add({
    affiliateId: affiliate.id,
    userId: user.id,
    email: affiliate.email,
    amount,
    method: 'bank',
    bank,
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return NextResponse.json({ ok: true, id: ref.id });
}
