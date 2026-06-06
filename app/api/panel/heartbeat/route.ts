import { NextRequest, NextResponse } from 'next/server';
import { validatePanelToken }        from '@/lib/motionforge/auth';
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
  const session = await validatePanelToken(req);
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

  return NextResponse.json({ ok: true, ts: Date.now() });
}
