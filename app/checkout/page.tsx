import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { createCheckout, PLAN_VARIANTS } from '@/lib/lemonsqueezy';

interface Props {
  searchParams: { plan?: string; billing?: string };
}

export default async function CheckoutPage({ searchParams }: Props) {
  const { userId } = await auth();

  const plan    = (searchParams.plan    ?? 'starter').toLowerCase();
  const billing = (searchParams.billing ?? 'monthly').toLowerCase();

  if (!userId) {
    const returnUrl = `/checkout?plan=${plan}&billing=${billing}`;
    redirect(`/sign-in?redirect_url=${encodeURIComponent(returnUrl)}`);
  }

  const variants  = PLAN_VARIANTS[plan] ?? PLAN_VARIANTS.starter;
  const variantId = billing === 'yearly' ? variants.yearly : variants.monthly;

  let checkoutUrl: string;
  try {
    checkoutUrl = await createCheckout(variantId, userId);
  } catch (err) {
    console.error('[checkout]', err);
    redirect('/dashboard/billing?error=checkout_failed');
  }

  redirect(checkoutUrl);
}
