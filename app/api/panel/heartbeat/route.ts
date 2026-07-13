import { NextRequest, NextResponse } from 'next/server';
import { PANEL_SESSION_TTL_MS, validatePanelToken } from '@/lib/motionforge/auth';
import { db }                        from '@/lib/firebaseAdmin';

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
  const session = await validatePanelToken(req, { skipMachineCheck: true });
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { userId, deviceId, machineFingerprint } = session;

  // Machine binding check, if the session was issued with a fingerprint,
  // the request must come from the same machine.
  if (machineFingerprint) {
    const incomingMachineId = req.headers.get('x-machine-id') ?? '';
    if (incomingMachineId !== machineFingerprint) {
      return NextResponse.json(
        { error: 'Machine mismatch', code: 'machine_mismatch' },
        { status: 401 },
      );
    }
  }

  if (deviceId) {
    // Just update lastActive, 1 write, no reads needed for a heartbeat.
    // Full device registration (with limit checks) only happens at panel auth/start.
    db.collection('users').doc(userId)
      .collection('devices').doc(deviceId)
      .update({ lastActive: new Date() })
      .catch(() => {});
  }

  const now = Date.now();
  const expiresAt = now + PANEL_SESSION_TTL_MS;
  await db.collection('panel_sessions').doc(session.token).update({
    expiresAt,
    lastActiveAt: now,
  });

  return NextResponse.json({ ok: true, ts: now, expiresAt });
}
