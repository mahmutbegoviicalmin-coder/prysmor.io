import crypto from 'node:crypto';
import { FB_PIXEL_ID } from '@/lib/pixel';

export type MetaPurchaseInput = {
  orderId: string;
  /** Amount in major currency units (e.g. 99.00), not cents. */
  value: number;
  currency: string;
  email?: string | null;
  contentName?: string;
  contentIds?: string[];
  fbp?: string | null;
  fbc?: string | null;
  eventSourceUrl?: string;
  /** Defaults to purchase_${orderId} — must match browser fbq eventID. */
  eventId?: string;
};

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Normalize Lemon totals (cents int or dollar float) → major units. */
export function lemonTotalToValue(attrs: Record<string, unknown> | null | undefined): number {
  if (!attrs) return 0;
  const usd = attrs.total_usd;
  if (typeof usd === 'number' && Number.isFinite(usd) && usd > 0) {
    // API/docs: total_usd is integer cents
    return Number.isInteger(usd) ? usd / 100 : usd;
  }
  const total = attrs.total;
  if (typeof total !== 'number' || !Number.isFinite(total) || total <= 0) return 0;
  // Webhook examples sometimes send dollar floats (e.g. 1859.76); API uses integer cents.
  if (!Number.isInteger(total) || total < 50) return Math.round(total * 100) / 100;
  return total / 100;
}

/**
 * Server-side Meta Conversions API Purchase.
 * Pair with browser trackPurchase() using the same event_id for deduplication.
 */
export async function sendMetaPurchaseEvent(input: MetaPurchaseInput): Promise<boolean> {
  const token = process.env.META_CAPI_TOKEN;
  if (!token) {
    console.warn('[meta-capi] META_CAPI_TOKEN missing — Purchase not sent');
    return false;
  }
  if (!(input.value > 0) || !input.orderId) {
    console.warn('[meta-capi] skipped Purchase — missing value or orderId');
    return false;
  }

  const eventId = input.eventId || `purchase_${input.orderId}`;
  const email = (input.email || '').trim().toLowerCase();
  const userData: Record<string, unknown> = {};
  if (email) userData.em = [sha256(email)];
  if (input.fbp) userData.fbp = input.fbp;
  if (input.fbc) userData.fbc = input.fbc;

  const customData: Record<string, unknown> = {
    value: Math.round(input.value * 100) / 100,
    currency: (input.currency || 'USD').toUpperCase(),
    order_id: input.orderId,
    content_type: 'product',
    num_items: 1,
  };
  if (input.contentName) customData.content_name = input.contentName;
  if (input.contentIds?.length) customData.content_ids = input.contentIds;

  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${FB_PIXEL_ID}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [{
          event_name: 'Purchase',
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId,
          action_source: 'website',
          event_source_url: input.eventSourceUrl || 'https://prysmor.io/purchase/complete',
          user_data: userData,
          custom_data: customData,
        }],
        access_token: token,
      }),
    });

    if (!res.ok) {
      console.warn('[meta-capi] Purchase failed:', await res.text());
      return false;
    }
    console.log(`[meta-capi] Purchase sent: order=${input.orderId} value=${input.value} event_id=${eventId}`);
    return true;
  } catch (e) {
    console.warn('[meta-capi] Purchase error:', e);
    return false;
  }
}
