import crypto from 'node:crypto';
import { db } from '@/lib/firebaseAdmin';

const LS_API_BASE = 'https://api.lemonsqueezy.com';

export const LS_STORE_ID = '216284';

/** Variant IDs per plan and billing interval */
export const PLAN_VARIANTS: Record<string, { monthly: string; yearly: string; label: string }> = {
  starter:   { monthly: '1455040', yearly: '1455046', label: 'Starter'   },
  pro:       { monthly: '1455043', yearly: '1455047', label: 'Pro'        },
  exclusive: { monthly: '1455044', yearly: '1455048', label: 'Exclusive'  },
};

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

/** Reverse map: variant ID → plan slug */
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
 * Creates a Lemon Squeezy hosted checkout and returns the checkout URL.
 * Embeds userId in custom_data so the webhook can map the payment to a user.
 */
export async function createCheckout(
  variantId: string,
  options: {
    billing?: 'monthly' | 'yearly';
    userId?: string | null;
    email?: string | null;
    refCode?: string | null;
    overrideRedirect?: string;
  } = {},
): Promise<string> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prysmor.io';
  const claimId = crypto.randomBytes(32).toString('hex');
  const redirectUrl = options.overrideRedirect
    ?? `${appUrl}/purchase/complete?claim=${encodeURIComponent(claimId)}`;
  const plan = VARIANT_TO_PLAN[variantId];
  if (!plan) throw new Error(`Unknown Lemon Squeezy variant: ${variantId}`);
  const checkoutUuid = PLAN_CHECKOUT_UUIDS[plan]?.[options.billing ?? 'monthly'];
  if (!checkoutUuid) throw new Error(`Missing checkout URL for ${plan}`);

  await db.collection('purchase_claims').doc(claimId).set({
    status: 'pending',
    plan,
    variantId,
    userId: options.userId ?? null,
    createdAt: new Date(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  });

  const base = `https://vfxpilot1.lemonsqueezy.com/checkout/buy/${checkoutUuid}`;
  const query = [
    'embed=1',
    'dark=1',
    `checkout[custom][claim_id]=${encodeURIComponent(claimId)}`,
    `checkout[redirect_url]=${encodeURIComponent(redirectUrl)}`,
  ];
  if (options.userId) {
    query.push(`checkout[custom][user_id]=${encodeURIComponent(options.userId)}`);
  }
  if (options.refCode) {
    query.push(`checkout[custom][ref_code]=${encodeURIComponent(options.refCode)}`);
  }
  if (options.email) {
    query.push(`checkout[email]=${encodeURIComponent(options.email)}`);
  }
  return `${base}?${query.join('&')}`;
}

/**
 * Builds a LemonSqueezy checkout URL for a credit top-up pack.
 * Embeds user_id and pack_id as custom data so the order_created webhook
 * can identify the buyer and the pack without needing a variant ID lookup.
 * No API call needed, just constructs the URL with query parameters.
 */
export function createTopUpCheckout(pack: CreditPack, userId: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prysmor.io';
  const base   = `https://vfxpilot1.lemonsqueezy.com/checkout/buy/${pack.checkoutUuid}`;
  // Build query string manually, URLSearchParams encodes brackets (%5B%5D) which
  // LemonSqueezy does not recognise. We need literal brackets for custom_data to
  // be forwarded correctly in the webhook payload.
  const query = [
    `checkout[custom][user_id]=${encodeURIComponent(userId)}`,
    `checkout[custom][pack_id]=${encodeURIComponent(pack.id)}`,
    `checkout[redirect_url]=${encodeURIComponent(`${appUrl}/dashboard/billing?topup=true`)}`,
  ].join('&');
  return `${base}?${query}`;
}

/**
 * Returns the LemonSqueezy customer portal URL for a subscription.
 * Used by the "Manage subscription" button in the dashboard.
 */
export async function getCustomerPortalUrl(subscriptionId: string): Promise<string | null> {
  const res = await fetch(`${LS_API_BASE}/v1/subscriptions/${subscriptionId}`, {
    headers: lsHeaders(),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return (json.data.attributes.urls?.customer_portal as string | undefined) ?? null;
}
