import crypto                        from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db }                        from '@/lib/firebaseAdmin';
import { VARIANT_TO_PLAN, CREDIT_PACK_ID_TO_CREDITS } from '@/lib/lemonsqueezy';
import { topUpCredits, addCredits }  from '@/lib/firestore/users';

export const runtime = 'nodejs';

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
    deviceLimit:    1,        // enforce 1 device seat on every plan activation
    updatedAt:      new Date(),
    ...extra,
  };
  if (subscriptionId) data.lsSubscriptionId = subscriptionId;
  // Store as human-readable string, not raw ISO
  if (renewalDate) data.renewalDate = formatLsDate(renewalDate) ?? renewalDate;

  if (doc.exists) {
    await ref.update(data);
  } else {
    await ref.set({ ...data, createdAt: new Date() });
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
  const plan           = VARIANT_TO_PLAN[variantId] ?? 'starter';
  const renewsAt       = attrs?.renews_at as string | undefined;

  // Log variant ID to help debug plan mapping issues
  console.log(`[ls-webhook] variantId="${variantId}" → plan="${plan}" (mapped=${variantId in VARIANT_TO_PLAN})`);

  try {
    switch (eventName) {
      case 'subscription_created':
        // New subscription — set plan + top-up credits to plan cap
        await setUserPlan(userId, plan, 'active', subscriptionId, renewsAt);
        await topUpCredits(userId, plan);
        console.log(`[ls-webhook] Credits topped up for new subscription: userId=${userId} plan=${plan}`);
        break;

      case 'subscription_payment_success':
        // Monthly renewal — set plan + reset credits to plan cap
        await setUserPlan(userId, plan, 'active', subscriptionId, renewsAt);
        await topUpCredits(userId, plan);
        console.log(`[ls-webhook] Credits reset on renewal: userId=${userId} plan=${plan}`);
        break;

      case 'subscription_updated':
        // Plan change (upgrade/downgrade) — update plan + top-up to new plan cap
        await setUserPlan(userId, plan, 'active', subscriptionId, renewsAt);
        await topUpCredits(userId, plan);
        console.log(`[ls-webhook] Credits updated on plan change: userId=${userId} plan=${plan}`);
        break;

      case 'subscription_resumed':
        await setUserPlan(userId, plan, 'active', subscriptionId, renewsAt);
        await topUpCredits(userId, plan);
        break;

      case 'subscription_cancelled':
        // User cancelled but keeps access until end of billing period.
        // Do NOT revoke here — subscription_expired fires when access truly ends.
        // Use set+merge so this is safe even if the user doc doesn't exist yet.
        await db.collection('users').doc(userId).set({
          lsCancelledAt:    new Date(),
          lsCancellationAt: renewsAt ?? null,
          updatedAt:        new Date(),
        }, { merge: true });
        console.log(`[ls-webhook] subscription cancelled, access valid until: ${renewsAt}`);
        break;

      case 'subscription_expired':
        // Billing period ended — revoke access, zero credits, downgrade to free.
        // All fields written atomically in one setUserPlan call via `extra`.
        await setUserPlan(userId, 'starter', 'inactive', subscriptionId, undefined, {
          credits:      0,
          creditsTotal: 0,
          renewalDate:  null,
        });
        console.log(`[ls-webhook] subscription expired, access revoked: userId=${userId}`);
        break;

      case 'subscription_paused':
        // Plan is paused (e.g. payment failure grace period ended)
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
          console.log(`[ls-webhook] order_created skipped — status=${orderStatus}`);
          break;
        }
        // pack_id is embedded in custom_data when the checkout URL was built
        const packId       = customData?.pack_id;
        const creditsToAdd = packId ? CREDIT_PACK_ID_TO_CREDITS[packId] : undefined;
        if (!creditsToAdd) {
          console.warn(`[ls-webhook] order_created — unknown pack_id "${packId}", no credits added`);
          break;
        }
        await addCredits(userId, creditsToAdd);
        console.log(`[ls-webhook] +${creditsToAdd} credits added: userId=${userId} pack=${packId}`);
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
