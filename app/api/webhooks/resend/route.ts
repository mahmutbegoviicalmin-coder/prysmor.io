import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { trackResendEmailEvent } from '@/lib/email/enrollments';

export const runtime = 'nodejs';

type ResendEventType =
  | 'email.sent'
  | 'email.delivered'
  | 'email.opened'
  | 'email.clicked'
  | 'email.bounced'
  | 'email.complained';

interface ResendWebhookPayload {
  type: ResendEventType;
  data: { email_id: string };
}

const TRACKED: Partial<Record<ResendEventType, 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained'>> = {
  'email.delivered':  'delivered',
  'email.opened':     'opened',
  'email.clicked':    'clicked',
  'email.bounced':    'bounced',
  'email.complained': 'complained',
};

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[resend-webhook] RESEND_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Misconfigured' }, { status: 500 });
  }

  const rawBody = await req.text();
  const svixId        = req.headers.get('svix-id')        ?? '';
  const svixTimestamp = req.headers.get('svix-timestamp') ?? '';
  const svixSignature = req.headers.get('svix-signature') ?? '';

  let payload: ResendWebhookPayload;
  try {
    const wh = new Webhook(secret);
    payload = wh.verify(rawBody, {
      'svix-id':        svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ResendWebhookPayload;
  } catch (err) {
    console.error('[resend-webhook] verify failed', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const mapped = TRACKED[payload.type];
  if (!mapped || !payload.data?.email_id) {
    return NextResponse.json({ ok: true, ignored: payload.type });
  }

  try {
    const updated = await trackResendEmailEvent(payload.data.email_id, mapped);
    return NextResponse.json({ ok: true, updated });
  } catch (err) {
    console.error('[resend-webhook] track', err);
    return NextResponse.json({ error: 'Track failed' }, { status: 500 });
  }
}
