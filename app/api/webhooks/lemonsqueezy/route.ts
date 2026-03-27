import crypto                        from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db }                        from '@/lib/firebaseAdmin';
import { VARIANT_TO_PLAN }           from '@/lib/lemonsqueezy';

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

async function setUserPlan(
  userId: string,
  plan: string,
  status: 'active' | 'inactive' | 'cancelled',
  subscriptionId?: string,
  renewalDate?: string,
) {
  const ref = db.collection('users').doc(userId);
  const doc = await ref.get();

  const data: Record<string, unknown> = {
    plan,
    licenseStatus:  status,
    updatedAt:      new Date(),
  };
  if (subscriptionId) data.lsSubscriptionId = subscriptionId;
  if (renewalDate)    data.renewalDate = renewalDate;

  if (doc.exists) {
    await ref.update(data);
  } else {
    await ref.set({ ...data, deviceLimit: 2, createdAt: new Date() });
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

  const rawBody  = await req.text();
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
    // No user ID — can happen for test events without custom_data
    console.warn('[ls-webhook] No user_id in custom_data, skipping');
    return NextResponse.json({ received: true });
  }

  const variantId      = String((attrs?.first_subscription_item as Record<string, unknown>)?.variant_id ?? '');
  const subscriptionId = String(data?.id ?? '');
  const plan           = VARIANT_TO_PLAN[variantId] ?? 'starter';
  const renewsAt       = attrs?.renews_at as string | undefined;

  try {
    switch (eventName) {
      case 'subscription_created':
      case 'subscription_payment_success':
        await setUserPlan(userId, plan, 'active', subscriptionId, renewsAt);
        break;

      case 'subscription_updated':
        // Handle plan changes (upgrade/downgrade)
        await setUserPlan(userId, plan, 'active', subscriptionId, renewsAt);
        break;

      case 'subscription_cancelled':
        // Still active until end of period — keep plan, mark as cancelled
        await db.collection('users').doc(userId).update({
          licenseStatus:  'inactive',
          lsCancelledAt:  new Date(),
          updatedAt:      new Date(),
        });
        break;

      case 'subscription_expired':
        // Access fully ended — downgrade
        await setUserPlan(userId, 'starter', 'inactive', subscriptionId);
        break;

      case 'subscription_resumed':
        await setUserPlan(userId, plan, 'active', subscriptionId, renewsAt);
        break;

      default:
        console.log(`[ls-webhook] Unhandled event: ${eventName}`);
    }
  } catch (err) {
    console.error('[ls-webhook] DB update failed:', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
