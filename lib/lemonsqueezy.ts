import crypto from 'node:crypto';
import { db } from '@/lib/firebaseAdmin';

const LS_API_BASE = 'https://api.lemonsqueezy.com';

export const LS_STORE_ID = '216284';

/** Lifetime one-time Prysmor license (Premiere + AE). */
export const LIFETIME_PRODUCT = {
  slug: 'lifetime',
  label: 'Prysmor',
  checkoutUuid: '41852cde-e7c2-45fb-bf7b-bcb952dddab0',
  credits: 800, // 200 seconds × 4 credits/sec
  seconds: 200,
  price: 99,
  compareAt: 199,
  priceLabel: '$99',
  compareAtLabel: '$199',
} as const;

/** @deprecated Legacy subscription variants — kept for existing subscriber webhooks only */
export const PLAN_VARIANTS: Record<string, { monthly: string; yearly: string; label: string }> = {
  starter:   { monthly: '1455040', yearly: '1455046', label: 'Starter'   },
  pro:       { monthly: '1455043', yearly: '1455047', label: 'Pro'        },
  exclusive: { monthly: '1455044', yearly: '1455048', label: 'Exclusive'  },
};

/** @deprecated Legacy checkout UUIDs */
export const PLAN_CHECKOUT_UUIDS: Record<string, { monthly: string; yearly: string }> = {
  starter: {
    monthly: 'c44b1138-5022-4a77-9ffc-f34a141f8999',
    yearly: 'ec075c85-1c0b-43f2-a19a-5f92d6b8e652',
  },
  pro: {
    monthly: '85a598e3-f100-466b-be78-7d7a90c933ab',
    yearly: 'f6e4d82f-75dc-4eaa-897c-981119375475',
  },
  exclusive: {
    monthly: '717c1894-de84-4710-9936-c53946d4777e',
    yearly: '8a5a6b84-56a9-46e3-a576-5f0b56d502c6',
  },
};

/** Reverse map: variant ID → plan slug (legacy subscriptions) */
export const VARIANT_TO_PLAN: Record<string, string> = {
  '1455040': 'starter',
  '1455046': 'starter',
  '1455043': 'pro',
  '1455047': 'pro',
  '1455044': 'exclusive',
  '1455048': 'exclusive',
};

// ─── Credit top-up packs (one-time purchases) ─────────────────────────────────

export interface CreditPack {
  id:           string;
  label:        string;
  credits:      number;
  seconds:      number;
  price:        string;
  priceUsd:     number;
  checkoutUuid: string;
  popular?:     boolean;
}

/** Credit top-up packs, one-time LemonSqueezy products. */
export const CREDIT_PACKS: CreditPack[] = [
  {
    id:           'boost',
    label:        'Boost',
    credits:      160,
    seconds:      40,
    price:        '$14.99',
    priceUsd:     14.99,
    checkoutUuid: '89842d4b-16c8-4c37-a404-1afad2526f9e',
  },
  {
    id:           'creator',
    label:        'Creator',
    credits:      375,
    seconds:      94,
    price:        '$34.90',
    priceUsd:     34.90,
    checkoutUuid: 'c0a7f9cf-4453-4cc3-9e7e-6448b4699b98',
    popular:      true,
  },
  {
    id:           'power',
    label:        'Power',
    credits:      1000,
    seconds:      250,
    price:        '$89.90',
    priceUsd:     89.90,
    checkoutUuid: '4eafc2a9-a73d-4a3f-8f66-c6dd24699e3d',
  },
];

/** Pack ID → credits granted (used by webhook to validate order_created payloads). */
export const CREDIT_PACK_ID_TO_CREDITS: Record<string, number> = {
  boost:   160,
  creator: 375,
  power:   1000,
};

function lsHeaders() {
  const key = process.env.LEMONSQUEEZY_API_KEY;
  if (!key) throw new Error('LEMONSQUEEZY_API_KEY is not set');
  return {
    Authorization:  `Bearer ${key}`,
    Accept:         'application/vnd.api+json',
    'Content-Type': 'application/vnd.api+json',
  };
}

/**
 * Creates a Lemon Squeezy hosted checkout for the lifetime license.
 * Embeds claim_id + product=lifetime so order_created can fulfill.
 */
export async function createCheckout(
  _variantIdOrIgnored?: string,
  options: {
    billing?: 'monthly' | 'yearly';
    userId?: string | null;
    email?: string | null;
    refCode?: string | null;
    overrideRedirect?: string;
    /** Meta Pixel cookies for CAPI attribution */
    fbp?: string | null;
    fbc?: string | null;
  } = {},
): Promise<string> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prysmor.io';
  const claimId = crypto.randomBytes(32).toString('hex');
  const redirectUrl = options.overrideRedirect
    ?? `${appUrl}/purchase/complete?claim=${encodeURIComponent(claimId)}`;

  await db.collection('purchase_claims').doc(claimId).set({
    status: 'pending',
    plan: LIFETIME_PRODUCT.slug,
    product: LIFETIME_PRODUCT.slug,
    userId: options.userId ?? null,
    buyerEmail: options.email ? String(options.email).trim().toLowerCase() : null,
    purchaseValue: LIFETIME_PRODUCT.price,
    purchaseCurrency: 'USD',
    fbp: options.fbp ?? null,
    fbc: options.fbc ?? null,
    createdAt: new Date(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  });

  const email = options.email ? String(options.email).trim().toLowerCase() : '';
  if (!email || !email.includes('@')) {
    throw new Error('checkout email is required');
  }

  const base = `https://vfxpilot1.lemonsqueezy.com/checkout/buy/${LIFETIME_PRODUCT.checkoutUuid}`;
  const query = [
    'embed=1',
    'dark=1',
    `checkout[email]=${encodeURIComponent(email)}`,
    `checkout[custom][claim_id]=${encodeURIComponent(claimId)}`,
    `checkout[custom][product]=${encodeURIComponent(LIFETIME_PRODUCT.slug)}`,
    `checkout[redirect_url]=${encodeURIComponent(redirectUrl)}`,
  ];
  if (options.userId) {
    query.push(`checkout[custom][user_id]=${encodeURIComponent(options.userId)}`);
  }
  if (options.refCode) {
    query.push(`checkout[custom][ref_code]=${encodeURIComponent(options.refCode)}`);
  }
  if (options.fbp) {
    query.push(`checkout[custom][fbp]=${encodeURIComponent(options.fbp)}`);
  }
  if (options.fbc) {
    query.push(`checkout[custom][fbc]=${encodeURIComponent(options.fbc)}`);
  }
  return `${base}?${query.join('&')}`;
}

/**
 * Builds a LemonSqueezy checkout URL for a credit top-up pack.
 */
export function createTopUpCheckout(
  pack: CreditPack,
  userId: string,
  meta?: { fbp?: string | null; fbc?: string | null },
): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prysmor.io';
  const base   = `https://vfxpilot1.lemonsqueezy.com/checkout/buy/${pack.checkoutUuid}`;
  const query = [
    `checkout[custom][user_id]=${encodeURIComponent(userId)}`,
    `checkout[custom][pack_id]=${encodeURIComponent(pack.id)}`,
    `checkout[redirect_url]=${encodeURIComponent(`${appUrl}/dashboard/billing?topup=true&pack=${encodeURIComponent(pack.id)}&value=${pack.priceUsd}`)}`,
  ];
  if (meta?.fbp) query.push(`checkout[custom][fbp]=${encodeURIComponent(meta.fbp)}`);
  if (meta?.fbc) query.push(`checkout[custom][fbc]=${encodeURIComponent(meta.fbc)}`);
  return `${base}?${query.join('&')}`;
}

/**
 * Returns the LemonSqueezy customer portal URL for a legacy subscription.
 */
export async function getCustomerPortalUrl(subscriptionId: string): Promise<string | null> {
  const res = await fetch(`${LS_API_BASE}/v1/subscriptions/${subscriptionId}`, {
    headers: lsHeaders(),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return (json.data.attributes.urls?.customer_portal as string | undefined) ?? null;
}

export type LsCustomerBilling = {
  name: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  countryFormatted: string | null;
};

/** Fetch Lemon Squeezy customer billing location (city / region / country). */
export async function fetchLsCustomerBilling(customerId: string): Promise<LsCustomerBilling | null> {
  if (!customerId) return null;
  try {
    const res = await fetch(`${LS_API_BASE}/v1/customers/${customerId}`, {
      headers: lsHeaders(),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const a = json?.data?.attributes ?? {};
    return {
      name: typeof a.name === 'string' ? a.name : null,
      city: typeof a.city === 'string' ? a.city : null,
      region: typeof a.region === 'string' ? a.region : null,
      country: typeof a.country === 'string' ? a.country : null,
      countryFormatted: typeof a.country_formatted === 'string' ? a.country_formatted : null,
    };
  } catch {
    return null;
  }
}
