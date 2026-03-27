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
export async function createCheckout(variantId: string, userId: string): Promise<string> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prysmor-io.vercel.app';

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
            redirect_url:         `${appUrl}/dashboard/billing?upgraded=true`,
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
