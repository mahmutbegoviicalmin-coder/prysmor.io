import { NextRequest, NextResponse } from 'next/server';
import { validatePanelToken }        from '@/lib/motionforge/auth';
import { registerDevice }            from '@/lib/firestore/devices';

export const runtime = 'nodejs';

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

/**
 * POST /api/panel/heartbeat
 * Called by the panel every ~5 minutes to keep the device "Online" in the dashboard.
 * Updates the device's lastActive timestamp in Firestore.
 */
export async function POST(req: NextRequest) {
  const session = await validatePanelToken(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { userId, deviceId } = session;

  if (deviceId) {
    // Fire-and-forget — don't block the response on the write
    registerDevice(userId, deviceId, 'Unknown').catch(() => {});
  }

  return NextResponse.json({ ok: true, ts: Date.now() });
}
