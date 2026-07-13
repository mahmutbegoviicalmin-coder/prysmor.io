import { getSessionUser } from '@/lib/auth/session';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createCheckout } from '@/lib/lemonsqueezy';

export default async function CheckoutPage() {
  const session = await getSessionUser();
  const userId = session?.userId ?? null;
  const email = session?.email ?? null;
  const jar = cookies();
  const rawRefCode = jar.get('prysmor_ref')?.value ?? null;
  const refCode = rawRefCode && /^[A-Z0-9_-]{1,20}$/i.test(rawRefCode)
    ? rawRefCode.toUpperCase()
    : null;
  const fbp = jar.get('_fbp')?.value ?? null;
  const fbc = jar.get('_fbc')?.value ?? null;

  let checkoutUrl: string;
  try {
    checkoutUrl = await createCheckout(undefined, { userId, email, refCode, fbp, fbc });
  } catch (err) {
    console.error('[checkout]', err);
    redirect('/#pricing');
  }

  redirect(checkoutUrl);
}
