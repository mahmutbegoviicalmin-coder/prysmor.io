import { NextRequest, NextResponse } from 'next/server';
import { db }                        from '@/lib/firebaseAdmin';
import { validatePanelToken }        from '@/lib/motionforge/auth';

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
 * POST /api/panel/auth/logout
 *
 * Revokes the panel session:
 *   1. Deletes the device doc from users/{userId}/devices/{deviceId}
 *      so the device slot is freed and re-login never hits device_limit_reached.
 *   2. Deletes the panel_sessions/{token} doc.
 *
 * Called by the panel logout() function before clearing localStorage.
 * Safe to call even if the session is already expired / missing.
 */
export async function POST(req: NextRequest) {
  const auth  = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;

  if (!token) {
    return NextResponse.json({ ok: true }); // nothing to revoke
  }

  try {
    const sessionRef = db.collection('panel_sessions').doc(token);
    const sessionDoc = await sessionRef.get();

    if (sessionDoc.exists) {
      const { userId, deviceId } = sessionDoc.data()!;

      // Remove device so the slot is freed for the next login
      if (userId && deviceId) {
        await db
          .collection('users')
          .doc(userId)
          .collection('devices')
          .doc(deviceId)
          .delete()
          .catch(() => {}); // non-fatal if already gone
      }

      // Delete the session token
      await sessionRef.delete();
    }
  } catch (err) {
    console.error('[panel/auth/logout]', err);
    // Always return ok — panel should clear local state regardless
  }

  return NextResponse.json({ ok: true });
}
