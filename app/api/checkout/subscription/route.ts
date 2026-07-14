import { getSessionUser } from '@/lib/auth/session';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createCheckout } from '@/lib/lemonsqueezy';
import { normalizeEmail } from '@/lib/auth/identity';

function readMetaIds(reqBody: Record<string, unknown>, jar: ReturnType<typeof cookies>) {
  const bodyFbp = typeof reqBody.fbp === 'string' ? reqBody.fbp : null;
  const bodyFbc = typeof reqBody.fbc === 'string' ? reqBody.fbc : null;
  return {
    fbp: bodyFbp || jar.get('_fbp')?.value || null,
    fbc: bodyFbc || jar.get('_fbc')?.value || null,
  };
}

/** Lifetime license checkout (path kept for existing frontend callers). */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const session = await getSessionUser();
  const userId = session?.userId ?? null;
  // Prefill Lemon when logged in; guests enter email inside Lemon checkout.
  const email = normalizeEmail(
    (typeof body.email === 'string' ? body.email : null) || session?.email || '',
  ) || null;

  const jar = cookies();
  const rawRefCode = jar.get('prysmor_ref')?.value ?? null;
  const refCode = rawRefCode && /^[A-Z0-9_-]{1,20}$/i.test(rawRefCode)
    ? rawRefCode.toUpperCase()
    : null;
  const { fbp, fbc } = readMetaIds(body, jar);

  try {
    const url = await createCheckout(undefined, {
      userId,
      email,
      refCode,
      fbp,
      fbc,
    });
    return NextResponse.json({ url });
  } catch (error) {
    console.error('[checkout/subscription]', error);
    return NextResponse.json({ error: 'Unable to create checkout' }, { status: 500 });
  }
}
