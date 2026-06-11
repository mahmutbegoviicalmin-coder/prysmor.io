import crypto                        from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db }                        from '@/lib/firebaseAdmin';
import { VARIANT_TO_PLAN, CREDIT_PACK_ID_TO_CREDITS } from '@/lib/lemonsqueezy';
import { topUpCredits, addCredits, PLAN_LABELS }  from '@/lib/firestore/users';
import { recordReferral }            from '@/lib/affiliates';
import { FB_PIXEL_ID }               from '@/lib/pixel';

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

/** Format an ISO date string from LS into "Month Day, Year" for display.
 *  LemonSqueezy sends .NET-style 7-digit fractional seconds (e.g. .0000000Z).
 *  We normalize to 3-digit millis before parsing. */
function formatLsDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  try {
    // Normalize .NET 7-digit fractional seconds → 3-digit millis
    const normalized = iso.replace(/\.(\d{7})Z$/, (_, frac) => `.${frac.slice(0, 3)}Z`);
    const d = new Date(normalized);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });
  } catch {
    return iso;
  }
}

async function setUserPlan(
  userId: string,
  plan: string,
  status: 'active' | 'inactive',
  subscriptionId?: string,
  renewalDate?: string,
  extra?: Record<string, unknown>,
) {
  const ref = db.collection('users').doc(userId);
  const doc = await ref.get();

  const data: Record<string, unknown> = {
    plan,
    licenseStatus:  status,
    updatedAt:      new Date(),
    ...extra,
  };
  if (subscriptionId) data.lsSubscriptionId = subscriptionId;
  // Store as human-readable string, not raw ISO
  if (renewalDate) data.renewalDate = formatLsDate(renewalDate) ?? renewalDate;

  if (doc.exists) {
    // Do NOT touch deviceLimit on existing docs, admin may have set a custom value.
    await ref.update(data);
  } else {
    // New user doc, seed deviceLimit to 1.
    await ref.set({ ...data, deviceLimit: 1, createdAt: new Date() });
  }

  console.log(`[ls-webhook] userId=${userId} → plan=${plan} status=${status}`);
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
  const refCode    = customData?.ref_code;
  const data       = payload.data as Record<string, unknown>;
  const attrs      = data?.attributes as Record<string, unknown>;

  console.log(`[ls-webhook] event=${eventName} userId=${userId}`);

  if (!userId) {
    console.warn('[ls-webhook] No user_id in custom_data, skipping');
    return NextResponse.json({ received: true });
  }

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
  const subscriptionId = String(data?.id ?? '');
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
    const existingDoc = await db.collection('users').doc(userId).get();
    plan = (existingDoc.exists ? (existingDoc.data()?.plan as string) : undefined) ?? 'starter';
    console.log(`[ls-webhook] variantId unknown, using existing plan="${plan}" for userId=${userId}`);
  }

  console.log(`[ls-webhook] resolved plan="${plan}" for event=${eventName}`);

  try {
    switch (eventName) {
      case 'subscription_created': {
        // New subscription, set plan + top-up credits to plan cap
        await setUserPlan(userId, plan, 'active', subscriptionId, renewsAt);
        await topUpCredits(userId, plan);
        const { onUserBecamePaid } = await import('@/lib/email/enrollments');
        await onUserBecamePaid(userId, plan).catch((e) => {
          console.warn('[ls-webhook] email funnel update failed:', e);
        });
        console.log(`[ls-webhook] Credits topped up for new subscription: userId=${userId} plan=${plan}`);
        // Meta CAPI Purchase event
        await sendMetaPurchaseEvent({
          id:       subscriptionId,
          total:    (attrs?.total as number) ?? 0,
          currency: (attrs?.currency as string) ?? 'USD',
          email:    (attrs?.user_email as string) ?? '',
        });
        // Affiliate referral tracking
        if (refCode) {
          await recordReferral({
            affiliateCode:   refCode,
            referredUserId:  userId,
            referredEmail:   (attrs?.user_email as string) ?? '',
            orderId:         subscriptionId,
            plan,
            commission:      15,
          });
        }
        break;
      }

      case 'subscription_payment_success':
        // Monthly renewal, set plan + reset credits to plan cap
        await setUserPlan(userId, plan, 'active', subscriptionId, renewsAt);
        await topUpCredits(userId, plan);
        console.log(`[ls-webhook] Credits reset on renewal: userId=${userId} plan=${plan}`);
        break;

      case 'subscription_updated':
        // Plan change (upgrade/downgrade), update plan + top-up to new plan cap
        await setUserPlan(userId, plan, 'active', subscriptionId, renewsAt);
        await topUpCredits(userId, plan);
        {
          const { onUserBecamePaid } = await import('@/lib/email/enrollments');
          await onUserBecamePaid(userId, plan).catch(() => {});
        }
        console.log(`[ls-webhook] Credits updated on plan change: userId=${userId} plan=${plan}`);
        break;

      case 'subscription_resumed':
        await setUserPlan(userId, plan, 'active', subscriptionId, renewsAt);
        await topUpCredits(userId, plan);
        {
          const { onUserBecamePaid } = await import('@/lib/email/enrollments');
          await onUserBecamePaid(userId, plan).catch(() => {});
        }
        break;

      case 'subscription_cancelled':
        // User cancelled but keeps access until end of billing period.
        // Do NOT revoke here, subscription_expired fires when access truly ends.
        // Use set+merge so this is safe even if the user doc doesn't exist yet.
        await db.collection('users').doc(userId).set({
          lsCancelledAt:    new Date(),
          lsCancellationAt: renewsAt ?? null,
          updatedAt:        new Date(),
        }, { merge: true });
        console.log(`[ls-webhook] subscription cancelled, access valid until: ${renewsAt}`);
        break;

      case 'subscription_expired':
        // Billing period ended, revoke access, downgrade to free.
        await setUserPlan(userId, 'starter', 'inactive', subscriptionId, undefined, {
          renewalDate: null,
        });
        {
          const { cancelAllFunnelsForUser, enrollInFunnel } = await import('@/lib/email/enrollments');
          await cancelAllFunnelsForUser(userId, 'subscription_expired').catch(() => {});
          await enrollInFunnel(userId, 'unpaid-starter').catch(() => {});
        }
        console.log(`[ls-webhook] subscription expired, access revoked: userId=${userId}`);
        break;

      case 'subscription_paused':
        await db.collection('users').doc(userId).set({
          licenseStatus: 'inactive',
          lsPausedAt:    new Date(),
          updatedAt:     new Date(),
        }, { merge: true });
        console.log(`[ls-webhook] subscription paused: userId=${userId}`);
        break;

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
        await addCredits(userId, creditsToAdd);
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
