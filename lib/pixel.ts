/** Prysmor Meta Pixel / Dataset ID. Do not swap for other brands (e.g. Cartly). */
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

function newEventId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rand}`;
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

/** Mirror a browser Pixel event to Conversions API with the same event_id. */
function mirrorToCapi(
  eventName: string,
  eventId: string,
  customData?: Record<string, unknown>,
) {
  if (typeof window === 'undefined') return;
  const name = typeof eventName === 'string' ? eventName.trim() : '';
  const id = typeof eventId === 'string' ? eventId.trim() : '';
  if (!name || !id) {
    console.error('[meta-pixel] refused CAPI mirror: missing event_name or event_id', {
      eventName,
      eventId,
    });
    return;
  }
  const meta = getMetaClickIds();
  const payload = {
    event_name: name,
    event_id: id,
    event_source_url: window.location.href,
    custom_data: customData,
    ...meta,
  };
  // Fire-and-forget — never block UX
  fetch('/api/meta/capi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}

function trackBrowser(eventName: string, data: Record<string, unknown>, eventId: string) {
  const name = typeof eventName === 'string' ? eventName.trim() : '';
  if (!name) {
    console.error('[meta-pixel] refused fbq track: missing event_name', { eventName, eventId });
    return;
  }
  if (!canTrack()) return;
  window.fbq!('track', name, data, { eventID: eventId });
}

export function trackPageView(eventId?: string) {
  const id = eventId || newEventId('pv');
  trackBrowser('PageView', {}, id);
  mirrorToCapi('PageView', id);
  return id;
}

export function initiateCheckout(planName: string, value: number, currency = 'USD') {
  const eventId = newEventId('ic');
  const data = {
    content_name: planName,
    content_ids: [planName.toLowerCase().replace(/\s+/g, '_')],
    content_type: 'product',
    value,
    currency,
    num_items: 1,
  };
  trackBrowser('InitiateCheckout', data, eventId);
  mirrorToCapi('InitiateCheckout', eventId, data);
  return eventId;
}

/**
 * Browser Purchase — fire on thank-you page with the same event_id as webhook CAPI.
 * Also mirrors to our CAPI bridge (deduped by event_id if webhook already sent).
 */
export function trackPurchase(payload: MetaPurchasePayload) {
  if (!(payload.value > 0)) return;

  const eventId = payload.eventId || (payload.orderId ? `purchase_${payload.orderId}` : newEventId('purchase'));
  const data: Record<string, unknown> = {
    value: payload.value,
    currency: (payload.currency || 'USD').toUpperCase(),
    content_type: 'product',
    num_items: 1,
  };
  if (payload.contentName) data.content_name = payload.contentName;
  if (payload.contentIds?.length) data.content_ids = payload.contentIds;
  if (payload.orderId) data.order_id = payload.orderId;

  trackBrowser('Purchase', data, eventId);
  mirrorToCapi('Purchase', eventId, data);
  return eventId;
}
