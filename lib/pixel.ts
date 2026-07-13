export const FB_PIXEL_ID = '1468737715025683';

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export type MetaPurchasePayload = {
  value: number;
  currency?: string;
  orderId?: string;
  /** Same id as CAPI — Meta dedupes browser + server events. */
  eventId?: string;
  contentName?: string;
  contentIds?: string[];
};

function canTrack(): boolean {
  return typeof window !== 'undefined' && typeof window.fbq === 'function';
}

/** Meta browser cookies used for CAPI attribution / ROAS. */
export function getMetaClickIds(): { fbp?: string; fbc?: string } {
  if (typeof document === 'undefined') return {};
  const cookies = document.cookie.split(';').map((c) => c.trim());
  const read = (name: string) => {
    const row = cookies.find((c) => c.startsWith(`${name}=`));
    return row ? decodeURIComponent(row.slice(name.length + 1)) : undefined;
  };
  return {
    fbp: read('_fbp'),
    fbc: read('_fbc'),
  };
}

export function initiateCheckout(planName: string, value: number, currency = 'USD') {
  if (!canTrack()) return;
  window.fbq!('track', 'InitiateCheckout', {
    content_name: planName,
    content_ids: [planName.toLowerCase().replace(/\s+/g, '_')],
    content_type: 'product',
    value,
    currency,
    num_items: 1,
  });
}

/**
 * Browser Purchase — fire on thank-you page with the same event_id as CAPI.
 * Dedupes against server Conversions API.
 */
export function trackPurchase(payload: MetaPurchasePayload) {
  if (!canTrack()) return;
  if (!(payload.value > 0)) return;

  const eventId = payload.eventId || (payload.orderId ? `purchase_${payload.orderId}` : undefined);
  const data: Record<string, unknown> = {
    value: payload.value,
    currency: (payload.currency || 'USD').toUpperCase(),
    content_type: 'product',
    num_items: 1,
  };
  if (payload.contentName) data.content_name = payload.contentName;
  if (payload.contentIds?.length) data.content_ids = payload.contentIds;
  if (payload.orderId) data.order_id = payload.orderId;

  if (eventId) {
    window.fbq!('track', 'Purchase', data, { eventID: eventId });
  } else {
    window.fbq!('track', 'Purchase', data);
  }
}
