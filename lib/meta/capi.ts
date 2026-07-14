import crypto from 'node:crypto';
import { FB_PIXEL_ID } from '@/lib/pixel';

export type MetaUserData = {
  email?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
};

export type MetaCapiEventInput = {
  eventName: 'PageView' | 'InitiateCheckout' | 'Purchase' | 'ViewContent' | 'Lead' | string;
  eventId: string;
  eventSourceUrl?: string;
  customData?: Record<string, unknown>;
  userData?: MetaUserData;
};

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
  eventId?: string;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
};

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function buildUserData(input: MetaUserData = {}): Record<string, unknown> {
  const userData: Record<string, unknown> = {};
  const email = (input.email || '').trim().toLowerCase();
  if (email) userData.em = [sha256(email)];
  if (input.fbp) userData.fbp = input.fbp;
  if (input.fbc) userData.fbc = input.fbc;
  if (input.clientIpAddress) userData.client_ip_address = input.clientIpAddress;
  if (input.clientUserAgent) userData.client_user_agent = input.clientUserAgent;
  return userData;
}

/** Normalize Lemon totals (cents int or dollar float) → major units. */
export function lemonTotalToValue(attrs: Record<string, unknown> | null | undefined): number {
  if (!attrs) return 0;

  const usd = attrs.total_usd;
  if (typeof usd === 'number' && Number.isFinite(usd) && usd > 0) {
    return Math.round(usd) / 100;
  }

  const total = attrs.total;
  if (typeof total !== 'number' || !Number.isFinite(total) || total <= 0) return 0;

  if (!Number.isInteger(total)) {
    return Math.round(total * 100) / 100;
  }

  return total / 100;
}

export function resolvePurchaseValue(
  attrs: Record<string, unknown> | null | undefined,
  fallbackValue = 0,
): number {
  const parsed = lemonTotalToValue(attrs);
  if (parsed <= 0) return fallbackValue;
  if (fallbackValue > 0 && parsed < fallbackValue * 0.25) return fallbackValue;
  return parsed;
}

/** Generic Conversions API sender — pairs with browser fbq via matching event_id. */
export async function sendMetaEvent(input: MetaCapiEventInput): Promise<boolean> {
  const token = process.env.META_CAPI_TOKEN;
  if (!token) {
    console.warn('[meta-capi] META_CAPI_TOKEN missing');
    return false;
  }
  if (!input.eventName || !input.eventId) return false;

  const payload = {
    data: [{
      event_name: input.eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: input.eventId,
      action_source: 'website' as const,
      event_source_url: input.eventSourceUrl || 'https://prysmor.io',
      user_data: buildUserData(input.userData),
      ...(input.customData && Object.keys(input.customData).length
        ? { custom_data: input.customData }
        : {}),
    }],
    access_token: token,
  };

  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${FB_PIXEL_ID}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn(`[meta-capi] ${input.eventName} failed:`, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[meta-capi] ${input.eventName} error:`, e);
    return false;
  }
}

export async function sendMetaPurchaseEvent(input: MetaPurchaseInput): Promise<boolean> {
  if (!(input.value > 0) || !input.orderId) {
    console.warn('[meta-capi] skipped Purchase — missing value or orderId');
    return false;
  }

  const eventId = input.eventId || `purchase_${input.orderId}`;
  const customData: Record<string, unknown> = {
    value: Math.round(input.value * 100) / 100,
    currency: (input.currency || 'USD').toUpperCase(),
    order_id: input.orderId,
    content_type: 'product',
    num_items: 1,
  };
  if (input.contentName) customData.content_name = input.contentName;
  if (input.contentIds?.length) customData.content_ids = input.contentIds;

  const ok = await sendMetaEvent({
    eventName: 'Purchase',
    eventId,
    eventSourceUrl: input.eventSourceUrl || 'https://prysmor.io/purchase/complete',
    customData,
    userData: {
      email: input.email,
      fbp: input.fbp,
      fbc: input.fbc,
      clientIpAddress: input.clientIpAddress,
      clientUserAgent: input.clientUserAgent,
    },
  });

  if (ok) {
    console.log(`[meta-capi] Purchase sent: order=${input.orderId} value=${input.value} event_id=${eventId}`);
  }
  return ok;
}
