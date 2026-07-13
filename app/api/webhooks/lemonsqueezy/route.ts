import crypto                        from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db }                        from '@/lib/firebaseAdmin';
import { VARIANT_TO_PLAN, CREDIT_PACK_ID_TO_CREDITS } from '@/lib/lemonsqueezy';
import { recordReferral }            from '@/lib/affiliates';
import { FB_PIXEL_ID }               from '@/lib/pixel';
import {
  ensurePurchaseMagicLink,
  processSubscriptionEvent,
} from '@/lib/billing/fulfillment';

export const runtime = 'nodejs';

// ─── Meta CAPI ───────────────────────────────────────────────────────────────

async function sendMetaPurchaseEvent(order: {
  id: string;
  total: number;
  currency: string;
  email: string;
}) {
  const token = process.env.META_CAPI_TOKEN;
  if (!token) return;
  try {
    const hashBuffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(order.email.toLowerCase().trim()),
    );
    const hashedEmail = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const res = await fetch(`https://graph.facebook.com/v19.0/${FB_PIXEL_ID}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [{
          event_name:    'Purchase',
          event_time:    Math.floor(Date.now() / 1000),
          event_id:      `purchase_${order.id}`,
          action_source: 'website',
          user_data:     { em: [hashedEmail] },
          custom_data: {
            value:        order.total / 100,
            currency:     order.currency.toUpperCase(),
            order_id:     order.id,
            content_type: 'product',
          },
        }],
        access_token: token,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.warn('[meta-capi] Purchase event failed:', body);
    } else {
      console.log(`[meta-capi] Purchase event sent: order=${order.id}`);
    }
  } catch (e) {
    console.warn('[meta-capi] Error sending purchase event:', e);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  if (!signature || !rawBody) return false;
  const hmac = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[ls-webhook] LEMONSQUEEZY_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Misconfigured' }, { status: 500 });
  }

  const rawBody   = await req.text();
  const sigHeader = req.headers.get('x-signature') ?? '';

  if (!verifySignature(rawBody, sigHeader, secret)) {
    console.warn('[ls-webhook] Invalid signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventName  = (payload.meta as Record<string, unknown>)?.event_name as string;
  const customData = (payload.meta as Record<string, unknown>)?.custom_data as Record<string, string> | undefined;
  const userId     = customData?.user_id;
  const claimId    = customData?.claim_id;
  const refCode    = customData?.ref_code;
  const data       = payload.data as Record<string, unknown>;
  const attrs      = data?.attributes as Record<string, unknown>;
  const isTestMode = attrs?.test_mode === true;

  console.log(`[ls-webhook] event=${eventName} userId=${userId}`);

  // Subscription events: variant_id lives directly on attrs (first_subscription_item has price_id, not variant_id)
  // Order events: variant_id is on first_order_item or order_items[0]
  const subItem        = attrs?.first_subscription_item as Record<string, unknown> | undefined;
  const orderItem      = (attrs?.first_order_item as Record<string, unknown> | undefined)
                      ?? ((attrs?.order_items as unknown[])?.[0] as Record<string, unknown> | undefined);
  const variantId      = String(
    attrs?.variant_id         // subscription_created / subscription_payment_success (direct on attrs)
    ?? subItem?.variant_id    // fallback
    ?? orderItem?.variant_id  // order events
    ?? ''
  );
  const subscriptionId = String(attrs?.subscription_id ?? data?.id ?? '');
  const isMapped       = variantId in VARIANT_TO_PLAN;
  const renewsAt       = attrs?.renews_at as string | undefined;

  // Log variant ID to help debug plan mapping issues
  console.log(`[ls-webhook] variantId="${variantId}" → mapped=${isMapped}`);

  // If variant is unknown, resolve plan from existing Firestore doc to avoid
  // incorrectly downgrading the user to 'starter' (e.g. subscription_payment_success
  // events sometimes arrive without a variant_id on attrs).
  let plan: string;
  if (isMapped) {
    plan = VARIANT_TO_PLAN[variantId];
  } else {
    const existingDoc = userId ? await db.collection('users').doc(userId).get() : null;
    plan = (existingDoc?.exists ? (existingDoc.data()?.plan as string) : undefined) ?? 'starter';
    console.log(`[ls-webhook] variantId unknown, using existing plan="${plan}"`);
  }

  console.log(`[ls-webhook] resolved plan="${plan}" for event=${eventName}`);

  try {
    const subscriptionEvents = new Set([
      'subscription_created',
      'subscription_payment_success',
      'subscription_updated',
      'subscription_resumed',
      'subscription_cancelled',
      'subscription_expired',
      'subscription_paused',
    ]);

    if (subscriptionEvents.has(eventName)) {
      if (!isMapped && eventName === 'subscription_created') {
        throw new Error(`Unknown subscription variant "${variantId}"`);
      }
      const result = await processSubscriptionEvent({
        eventFingerprint: crypto.createHash('sha256').update(rawBody).digest('hex'),
        eventName,
        objectId: String(data?.id ?? ''),
        subscriptionId,
        claimId,
        suppliedUserId: userId,
        buyerEmail: attrs?.user_email as string | undefined,
        customerId: attrs?.customer_id ? String(attrs.customer_id) : undefined,
        variantId,
        plan,
        renewsAt,
        refCode,
      });

      if (result.needsMagicLink && result.buyerEmail) {
        // Prefer magic dashboard link for guests; shorter confirm if we somehow already had user session context
        await ensurePurchaseMagicLink(result.claimId, result.buyerEmail, plan);
      }

      if (result.fresh && ['subscription_created', 'subscription_updated', 'subscription_resumed'].includes(eventName) && result.userId) {
        const { onUserBecamePaid } = await import('@/lib/email/enrollments');
        await onUserBecamePaid(result.userId, plan).catch((e) => {
          console.warn('[ls-webhook] email funnel update failed:', e);
        });
      }

      if (result.fresh && eventName === 'subscription_expired' && result.userId) {
        const { cancelAllFunnelsForUser, enrollInFunnel } = await import('@/lib/email/enrollments');
        await cancelAllFunnelsForUser(result.userId, 'subscription_expired').catch(() => {});
        await enrollInFunnel(result.userId, 'unpaid-starter').catch(() => {});
      }

      if (result.fresh && eventName === 'subscription_created') {
        if (!isTestMode) {
          await sendMetaPurchaseEvent({
            id: subscriptionId,
            total: (attrs?.total as number) ?? 0,
            currency: (attrs?.currency as string) ?? 'USD',
            email: (attrs?.user_email as string) ?? '',
          });
        }
        if (!isTestMode && refCode && result.userId) {
          await recordReferral({
            affiliateCode: refCode,
            referredUserId: result.userId,
            referredEmail: result.buyerEmail,
            orderId: subscriptionId,
            plan,
            commission: 15,
          });
        }
      }

      return NextResponse.json({ received: true });
    }

    switch (eventName) {
      case 'order_created': {
        // One-time credit top-up purchase
        const orderStatus = attrs?.status as string | undefined;
        if (orderStatus !== 'paid') {
          console.log(`[ls-webhook] order_created skipped, status=${orderStatus}`);
          break;
        }
        // pack_id is embedded in custom_data when the checkout URL was built
        const packId       = customData?.pack_id;
        const creditsToAdd = packId ? CREDIT_PACK_ID_TO_CREDITS[packId] : undefined;
        if (!creditsToAdd) {
          console.warn(`[ls-webhook] order_created, unknown pack_id "${packId}", no credits added`);
          break;
        }
        if (!userId) {
          console.warn('[ls-webhook] Credit top-up has no user_id, skipping');
          break;
        }
        const orderId = String(data?.id ?? '');
        const orderEventRef = db.collection('ls_webhook_events').doc(
          crypto.createHash('sha256').update(`order_created:${orderId}`).digest('hex'),
        );
        const userRef = db.collection('users').doc(userId);
        const shouldAdd = await db.runTransaction(async (tx: any) => {
          const [processed, userSnap] = await Promise.all([
            tx.get(orderEventRef),
            tx.get(userRef),
          ]);
          if (processed.exists) return false;
          if (!userSnap.exists) throw new Error(`User ${userId} not found`);
          const current = typeof userSnap.data()?.credits === 'number'
            ? userSnap.data()!.credits
            : 0;
          tx.update(userRef, { credits: current + creditsToAdd, updatedAt: new Date() });
          tx.set(orderEventRef, { eventName, orderId, userId, processedAt: new Date() });
          return true;
        });
        if (!shouldAdd) break;
        console.log(`[ls-webhook] +${creditsToAdd} credits added: userId=${userId} pack=${packId}`);
        // Meta CAPI Purchase event for one-time top-up
        await sendMetaPurchaseEvent({
          id:       String(data?.id ?? ''),
          total:    (attrs?.total as number) ?? 0,
          currency: (attrs?.currency as string) ?? 'USD',
          email:    (attrs?.user_email as string) ?? '',
        });
        break;
      }

      default:
        console.log(`[ls-webhook] Unhandled event: ${eventName}`);
    }
  } catch (err) {
    console.error('[ls-webhook] DB update failed:', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
