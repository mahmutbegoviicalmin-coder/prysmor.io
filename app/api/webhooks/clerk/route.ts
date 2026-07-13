import { NextRequest, NextResponse } from 'next/server';
import { Webhook }                   from 'svix';
import { db }                        from '@/lib/firebaseAdmin';
import { createUser, syncUserProfile } from '@/lib/firestore/users';
import { claimPendingEntitlements } from '@/lib/billing/fulfillment';
import { recordReferral } from '@/lib/affiliates';

export const runtime = 'nodejs';

interface ClerkEmailAddress { email_address: string; }
interface ClerkUserEvent {
  id:              string;
  first_name?:     string | null;
  last_name?:      string | null;
  email_addresses: ClerkEmailAddress[];
  primary_email_address_id?: string;
}

function extractEmail(event: ClerkUserEvent): string | undefined {
  if (!event.email_addresses?.length) return undefined;
  // Prefer the primary email, fall back to first in list
  if (event.primary_email_address_id) {
    const primary = event.email_addresses.find(
      (e: any) => e.id === event.primary_email_address_id,
    );
    if (primary) return primary.email_address;
  }
  return event.email_addresses[0].email_address;
}

export async function POST(req: NextRequest) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[clerk-webhook] CLERK_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Misconfigured' }, { status: 500 });
  }

  const rawBody = await req.text();
  const svixId        = req.headers.get('svix-id')        ?? '';
  const svixTimestamp = req.headers.get('svix-timestamp') ?? '';
  const svixSignature = req.headers.get('svix-signature') ?? '';

  let payload: { type: string; data: ClerkUserEvent };
  try {
    const wh = new Webhook(secret);
    payload = wh.verify(rawBody, {
      'svix-id':        svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as typeof payload;
  } catch (err) {
    console.warn('[clerk-webhook] Signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const { type, data } = payload;
  const userId = data.id;

  console.log(`[clerk-webhook] event=${type} userId=${userId}`);

  try {
    if (type === 'user.created') {
      // Ensure Firestore doc exists (inactive, 0 credits) + save profile
      await createUser(userId);
      await syncUserProfile(userId, {
        email:     extractEmail(data),
        firstName: data.first_name  ?? undefined,
        lastName:  data.last_name   ?? undefined,
      });
      const email = extractEmail(data);
      const claimed = email
        ? await claimPendingEntitlements(email, userId)
        : [];
      const activeClaims = claimed.filter((purchase) => purchase.active);
      if (activeClaims.length === 0) {
        const { enrollInFunnel } = await import('@/lib/email/enrollments');
        await enrollInFunnel(userId, 'unpaid-starter').catch((e) => {
          console.warn('[clerk-webhook] email enroll failed:', e);
        });
      } else {
        const { onUserBecamePaid } = await import('@/lib/email/enrollments');
        await onUserBecamePaid(userId, activeClaims[activeClaims.length - 1].plan).catch(() => {});
        for (const purchase of activeClaims) {
          if (!purchase.refCode) continue;
          await recordReferral({
            affiliateCode: purchase.refCode,
            referredUserId: userId,
            referredEmail: email!,
            orderId: purchase.subscriptionId,
            plan: purchase.plan,
            commission: 15,
          });
        }
      }
      console.log(`[clerk-webhook] user.created synced: ${userId}`);

    } else if (type === 'user.updated') {
      // Keep profile in sync when user changes name / email in Clerk
      await syncUserProfile(userId, {
        email:     extractEmail(data),
        firstName: data.first_name  ?? undefined,
        lastName:  data.last_name   ?? undefined,
      });
      console.log(`[clerk-webhook] user.updated synced: ${userId}`);

    } else if (type === 'user.deleted') {
      if (userId) {
        // Delete devices subcollection first (Firestore doesn't cascade)
        const devices = await db.collection('users')
          .doc(userId).collection('devices').get();
        for (const doc of devices.docs) await doc.ref.delete();

        // Delete user doc
        await db.collection('users').doc(userId).delete();

        // Delete all panel sessions for this user
        const sessions = await db.collection('panel_sessions')
          .where('userId', '==', userId).get();
        for (const doc of sessions.docs) await doc.ref.delete();

        console.log(`[clerk-webhook] user.deleted cleaned up: ${userId}`);
      }
    }
  } catch (err) {
    console.error('[clerk-webhook] Firestore sync failed:', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
