import { getSessionUser } from '@/lib/auth/session';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createCheckout } from '@/lib/lemonsqueezy';

/** Lifetime license checkout (path kept for existing frontend callers). */
export async function POST(req: NextRequest) {
  // Accept optional body for backward compatibility; always sells lifetime.
  await req.json().catch(() => ({}));

  const session = await getSessionUser();
  const userId = session?.userId ?? null;
  const email = session?.email ?? null;
  const rawRefCode = cookies().get('prysmor_ref')?.value ?? null;
  const refCode = rawRefCode && /^[A-Z0-9_-]{1,20}$/i.test(rawRefCode)
    ? rawRefCode.toUpperCase()
    : null;

  try {
    const url = await createCheckout(undefined, {
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
