import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { sendMetaEvent } from '@/lib/meta/capi';

export const runtime = 'nodejs';

const ALLOWED = new Set([
  'PageView',
  'InitiateCheckout',
  'Purchase',
  'ViewContent',
  'Lead',
  'AddToCart',
  'CompleteRegistration',
]);

function clientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || null;
  return req.headers.get('x-real-ip');
}

/**
 * Browser → server CAPI bridge.
 * Client fires fbq + this endpoint with the SAME event_id for deduplication.
 * Raises Meta "Pixel events covered by Conversions API" coverage / quality score.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventNameRaw = body.event_name;
  const eventIdRaw = body.event_id;
  const eventName = typeof eventNameRaw === 'string' ? eventNameRaw.trim() : '';
  const eventId = typeof eventIdRaw === 'string' ? eventIdRaw.trim() : '';

  if (!eventName || !ALLOWED.has(eventName)) {
    console.error('[meta-capi/bridge] refused: invalid or missing event_name', {
      event_name: eventNameRaw,
      event_id: eventIdRaw,
    });
    return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
  }
  if (!eventId || eventId.length > 128) {
    console.error('[meta-capi/bridge] refused: invalid or missing event_id', {
      event_name: eventName,
      event_id: eventIdRaw,
    });
    return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
  }

  const eventSourceUrl = typeof body.event_source_url === 'string'
    ? body.event_source_url.slice(0, 2048)
    : 'https://prysmor.io';

  const customData =
    body.custom_data && typeof body.custom_data === 'object' && !Array.isArray(body.custom_data)
      ? (body.custom_data as Record<string, unknown>)
      : undefined;

  const jarFbp = req.cookies.get('_fbp')?.value ?? null;
  const jarFbc = req.cookies.get('_fbc')?.value ?? null;
  const bodyFbp = typeof body.fbp === 'string' ? body.fbp : null;
  const bodyFbc = typeof body.fbc === 'string' ? body.fbc : null;

  const session = await getSessionUser().catch(() => null);

  const ok = await sendMetaEvent({
    eventName,
    eventId,
    eventSourceUrl,
    customData,
    userData: {
      email: session?.email ?? (typeof body.email === 'string' ? body.email : null),
      fbp: bodyFbp || jarFbp,
      fbc: bodyFbc || jarFbc,
      clientIpAddress: clientIp(req),
      clientUserAgent: req.headers.get('user-agent'),
    },
  });

  return NextResponse.json(
    { ok },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
