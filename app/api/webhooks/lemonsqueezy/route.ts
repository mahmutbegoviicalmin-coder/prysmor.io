import crypto                        from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db }                        from '@/lib/firebaseAdmin';
import { VARIANT_TO_PLAN, CREDIT_PACK_ID_TO_CREDITS, LIFETIME_PRODUCT } from '@/lib/lemonsqueezy';
import { recordReferral }            from '@/lib/affiliates';
import { resolvePurchaseValue, sendMetaPurchaseEvent } from '@/lib/meta/capi';
import {
  ensurePurchaseMagicLink,
  fulfillLifetimeOrder,
  processSubscriptionEvent,
} from '@/lib/billing/fulfillment';

export const runtime = 'nodejs';

function metaFromCustom(customData: Record<string, string> | undefined) {
  return {
    fbp: customData?.fbp || null,
    fbc: customData?.fbc || null,
  };
}

async function trackPaidOrder(opts: {
  orderId: string;
  attrs: Record<string, unknown>;
  email: string;
  contentName: string;
  contentIds: string[];
  customData?: Record<string, string>;
  claimId?: string | null;
  fallbackValue?: number;
}) {
  const value = resolvePurchaseValue(opts.attrs, opts.fallbackValue || 0);
  const currency = String(opts.attrs.currency ?? 'USD');
  const eventId = `purchase_${opts.orderId}`;
  const { fbp, fbc } = metaFromCustom(opts.customData);

  if (opts.claimId) {
    await db.collection('purchase_claims').doc(opts.claimId).set({
      orderId: opts.orderId,
      purchaseValue: value,
      purchaseCurrency: currency.toUpperCase(),
      metaEventId: eventId,
      updatedAt: new Date(),
    }, { merge: true }).catch(() => {});
  }

  await sendMetaPurchaseEvent({
    orderId: opts.orderId,
    value,
    currency,
    email: opts.email,
    contentName: opts.contentName,
    contentIds: opts.contentIds,
    fbp,
    fbc,
    eventId,
    eventSourceUrl: 'https://prysmor.io/purchase/complete',
  });
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
          const orderId = String(attrs?.order_id ?? subscriptionId);
          await trackPaidOrder({
            orderId,
            attrs: attrs ?? {},
            email: (attrs?.user_email as string) ?? '',
            contentName: plan,
            contentIds: [plan],
            customData,
            claimId,
            fallbackValue: 0,
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
        const orderStatus = attrs?.status as string | undefined;
        if (orderStatus !== 'paid') {
          console.log(`[ls-webhook] order_created skipped, status=${orderStatus}`);
          break;
        }

        const packId = customData?.pack_id;
        const product = customData?.product;
        const orderClaimId = customData?.claim_id ?? claimId;
        const orderId = String(data?.id ?? '');
        const buyerEmail = (attrs?.user_email as string) ?? '';

        // Lifetime license purchase
        if (product === 'lifetime' || (orderClaimId && !packId)) {
          const result = await fulfillLifetimeOrder({
            eventFingerprint: crypto.createHash('sha256')
              .update(`lifetime_order:${orderId}`)
              .digest('hex'),
            orderId,
            claimId: orderClaimId,
            suppliedUserId: userId,
            buyerEmail,
            customerId: attrs?.customer_id ? String(attrs.customer_id) : undefined,
            refCode,
          });

          if (result.needsMagicLink && result.buyerEmail) {
            await ensurePurchaseMagicLink(result.claimId, result.buyerEmail, 'lifetime');
          }
          if (result.fresh && result.userId) {
            const { onUserBecamePaid } = await import('@/lib/email/enrollments');
            await onUserBecamePaid(result.userId, 'lifetime').catch(() => {});
            if (!isTestMode && refCode) {
              await recordReferral({
                affiliateCode: refCode,
                referredUserId: result.userId,
                referredEmail: result.buyerEmail,
                orderId,
                plan: 'lifetime',
                commission: 15,
              }).catch(() => {});
            }
          }
          if (result.fresh && !isTestMode) {
            await trackPaidOrder({
              orderId,
              attrs: attrs ?? {},
              email: buyerEmail,
              contentName: LIFETIME_PRODUCT.label,
              contentIds: [LIFETIME_PRODUCT.slug],
              customData,
              claimId: orderClaimId,
              fallbackValue: LIFETIME_PRODUCT.price,
            });
          }
          break;
        }

        // Credit top-up pack
        const creditsToAdd = packId ? CREDIT_PACK_ID_TO_CREDITS[packId] : undefined;
        if (!creditsToAdd) {
          console.warn(`[ls-webhook] order_created, unknown pack_id "${packId}", no credits added`);
          break;
        }
        if (!userId) {
          console.warn('[ls-webhook] Credit top-up has no user_id, skipping');
          break;
        }
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
        if (!isTestMode) {
          await trackPaidOrder({
            orderId,
            attrs: attrs ?? {},
            email: buyerEmail,
            contentName: `Credit pack: ${packId}`,
            contentIds: [String(packId)],
            customData,
          });
        }
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
