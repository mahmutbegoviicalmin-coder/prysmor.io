export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { db }                        from '@/lib/firebaseAdmin';

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

export async function POST(req: NextRequest) {
  const auth  = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;

  if (!token) {
    return NextResponse.json({ ok: true });
  }

  try {
    const sessionSnap = await db.collection('panel_sessions').doc(token).get();

    if (sessionSnap.exists) {
      const session = sessionSnap.data()!;

      // Free device slot in Firestore
      if (session.userId && session.deviceId) {
        await db
          .collection('users')
          .doc(session.userId)
          .collection('devices')
          .doc(session.deviceId)
          .delete()
          .catch(() => {});
      }

      // Delete session
      await sessionSnap.ref.delete();
    }
  } catch (err) {
    console.error('[panel/auth/logout]', err);
  }

  return NextResponse.json({ ok: true });
}
