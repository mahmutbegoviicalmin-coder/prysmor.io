import { NextRequest, NextResponse } from 'next/server';
import { Webhook }                   from 'svix';
import { createUser, syncUserProfile } from '@/lib/firestore/users';

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
      console.log(`[clerk-webhook] user.created synced: ${userId}`);

    } else if (type === 'user.updated') {
      // Keep profile in sync when user changes name / email in Clerk
      await syncUserProfile(userId, {
        email:     extractEmail(data),
        firstName: data.first_name  ?? undefined,
        lastName:  data.last_name   ?? undefined,
      });
      console.log(`[clerk-webhook] user.updated synced: ${userId}`);
    }
  } catch (err) {
    console.error('[clerk-webhook] Firestore sync failed:', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
