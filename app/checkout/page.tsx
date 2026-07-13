import { auth, currentUser } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createCheckout, PLAN_VARIANTS } from '@/lib/lemonsqueezy';

interface Props {
  searchParams: { plan?: string; billing?: string };
}

export default async function CheckoutPage({ searchParams }: Props) {
  const { userId } = await auth();

  const plan    = (searchParams.plan    ?? 'starter').toLowerCase();
  const billing = (searchParams.billing ?? 'monthly').toLowerCase();

  if (!PLAN_VARIANTS[plan] || !['monthly', 'yearly'].includes(billing)) {
    redirect('/#pricing');
  }

  const variants  = PLAN_VARIANTS[plan];
  const variantId = billing === 'yearly' ? variants.yearly : variants.monthly;
  const user = userId ? await currentUser() : null;
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const rawRefCode = cookies().get('prysmor_ref')?.value ?? null;
  const refCode = rawRefCode && /^[A-Z0-9_-]{1,20}$/i.test(rawRefCode)
    ? rawRefCode.toUpperCase()
    : null;

  let checkoutUrl: string;
  try {
    checkoutUrl = await createCheckout(variantId, {
      billing: billing as 'monthly' | 'yearly',
      userId,
      email,
      refCode,
    });
  } catch (err) {
    console.error('[checkout]', err);
    redirect('/#pricing');
  }

  redirect(checkoutUrl);
}
