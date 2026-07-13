import { getSessionUser } from '@/lib/auth/session';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createCheckout } from '@/lib/lemonsqueezy';

export default async function CheckoutPage() {
  const session = await getSessionUser();
  const userId = session?.userId ?? null;
  const email = session?.email ?? null;
  const rawRefCode = cookies().get('prysmor_ref')?.value ?? null;
  const refCode = rawRefCode && /^[A-Z0-9_-]{1,20}$/i.test(rawRefCode)
    ? rawRefCode.toUpperCase()
    : null;

  let checkoutUrl: string;
  try {
    checkoutUrl = await createCheckout(undefined, { userId, email, refCode });
  } catch (err) {
    console.error('[checkout]', err);
    redirect('/#pricing');
  }

  redirect(checkoutUrl);
}
