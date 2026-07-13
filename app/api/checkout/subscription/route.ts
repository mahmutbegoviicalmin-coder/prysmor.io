import { getSessionUser } from '@/lib/auth/session';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createCheckout, PLAN_VARIANTS } from '@/lib/lemonsqueezy';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    plan?: string;
    billing?: string;
  };
  const plan = (body.plan ?? '').toLowerCase();
  const billing = (body.billing ?? '').toLowerCase();
  if (!PLAN_VARIANTS[plan] || !['monthly', 'yearly'].includes(billing)) {
    return NextResponse.json({ error: 'Invalid plan or billing period' }, { status: 400 });
  }

  const session = await getSessionUser();
  const userId = session?.userId ?? null;
  const email = session?.email ?? null;
  const rawRefCode = cookies().get('prysmor_ref')?.value ?? null;
  const refCode = rawRefCode && /^[A-Z0-9_-]{1,20}$/i.test(rawRefCode)
    ? rawRefCode.toUpperCase()
    : null;
  const variants = PLAN_VARIANTS[plan];
  const variantId = billing === 'yearly' ? variants.yearly : variants.monthly;

  try {
    const url = await createCheckout(variantId, {
      billing: billing as 'monthly' | 'yearly',
      userId,
      email,
      refCode,
    });
    return NextResponse.json({ url });
  } catch (error) {
    console.error('[checkout/subscription]', error);
    return NextResponse.json({ error: 'Unable to create checkout' }, { status: 500 });
  }
}
