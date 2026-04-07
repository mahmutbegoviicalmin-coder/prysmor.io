const LS_API_BASE = 'https://api.lemonsqueezy.com';

export const LS_STORE_ID = '216284';

/** Variant IDs per plan and billing interval */
export const PLAN_VARIANTS: Record<string, { monthly: string; yearly: string; label: string }> = {
  starter:   { monthly: '1455040', yearly: '1455046', label: 'Starter'   },
  pro:       { monthly: '1455043', yearly: '1455047', label: 'Pro'        },
  exclusive: { monthly: '1455044', yearly: '1455048', label: 'Exclusive'  },
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

/** Credit top-up packs — one-time LemonSqueezy products. */
export const CREDIT_PACKS: CreditPack[] = [
  {
    id:           'boost',
    label:        'Boost',
    credits:      500,
    seconds:      125,
    price:        '$9.99',
    priceUsd:     9.99,
    checkoutUuid: '89842d4b-16c8-4c37-a404-1afad2526f9e',
  },
  {
    id:           'creator',
    label:        'Creator',
    credits:      1500,
    seconds:      375,
    price:        '$24.99',
    priceUsd:     24.99,
    checkoutUuid: 'c0a7f9cf-4453-4cc3-9e7e-6448b4699b98',
    popular:      true,
  },
  {
    id:           'power',
    label:        'Power',
    credits:      4000,
    seconds:      1000,
    price:        '$59.99',
    priceUsd:     59.99,
    checkoutUuid: '4eafc2a9-a73d-4a3f-8f66-c6dd24699e3d',
  },
];

/** Pack ID → credits granted (used by webhook to validate order_created payloads). */
export const CREDIT_PACK_ID_TO_CREDITS: Record<string, number> = {
  boost:   500,
  creator: 1500,
  power:   4000,
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
export async function createCheckout(variantId: string, userId: string, overrideRedirect?: string): Promise<string> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prysmor-io.vercel.app';
  const redirectUrl = overrideRedirect ?? `${appUrl}/dashboard/billing?upgraded=true`;

  const res = await fetch(`${LS_API_BASE}/v1/checkouts`, {
    method:  'POST',
    headers: lsHeaders(),
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            custom: { user_id: userId },
          },
          checkout_options: {
            dark:         true,
            button_color: '#A3FF12',
          },
          product_options: {
            redirect_url:         redirectUrl,
            receipt_button_text:  'Go to Dashboard',
            receipt_link_url:     `${appUrl}/dashboard/billing`,
          },
        },
        relationships: {
          store:   { data: { type: 'stores',   id: LS_STORE_ID } },
          variant: { data: { type: 'variants', id: variantId   } },
        },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LemonSqueezy checkout error ${res.status}: ${body}`);
  }

  const json = await res.json();
  return json.data.attributes.url as string;
}

/**
 * Builds a LemonSqueezy checkout URL for a credit top-up pack.
 * Embeds user_id and pack_id as custom data so the order_created webhook
 * can identify the buyer and the pack without needing a variant ID lookup.
 * No API call needed — just constructs the URL with query parameters.
 */
export function createTopUpCheckout(pack: CreditPack, userId: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prysmor-io.vercel.app';
  const base   = `https://vfxpilot1.lemonsqueezy.com/checkout/buy/${pack.checkoutUuid}`;
  const params = new URLSearchParams({
    'checkout[custom][user_id]':   userId,
    'checkout[custom][pack_id]':   pack.id,
    'checkout[redirect_url]':      `${appUrl}/dashboard/billing?topup=true`,
  });
  return `${base}?${params.toString()}`;
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
