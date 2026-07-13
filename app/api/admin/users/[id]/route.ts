import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { PLAN_CREDITS } from '@/lib/firestore/users';
import { requireAdmin } from '@/lib/admin/auth';

// ─── PATCH, update user ──────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  let body: {
    action:        'set_plan' | 'set_credits' | 'adjust_credits' | 'set_status' | 'set_device_limit' | 'refresh_location';
    plan?:         string;
    status?:       string;
    credits?:      number;
    delta?:        number;
    resetCredits?: boolean;
    deviceLimit?:  number;
    clearDevices?: boolean;
  };

  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (admin.user.userId === params.id && body.action === 'set_plan') {
    return NextResponse.json({ error: 'You cannot change your own plan via the admin panel.' }, { status: 403 });
  }

  const ref = db.collection('users').doc(params.id);
  const doc = await ref.get();
  if (!doc.exists) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const data = doc.data()!;

  try {
    switch (body.action) {
      case 'set_plan': {
        const plan   = body.plan   ?? data.plan ?? 'starter';
        const status = body.status ?? 'active';
        const update: Record<string, unknown> = {
          plan,
          licenseStatus: status,
          updatedAt:     new Date(),
        };
        if (!data.createdAt) update.createdAt = new Date();
        if (body.resetCredits) {
          const cap           = PLAN_CREDITS[plan] ?? 1000;
          update.credits = cap;
          update.creditsTotal = cap;
        }
        await ref.update(update);
        break;
      }

      case 'set_credits': {
        if (typeof body.credits !== 'number') {
          return NextResponse.json({ error: 'credits must be a number' }, { status: 400 });
        }
        await ref.update({ credits: Math.max(0, body.credits), updatedAt: new Date() });
        break;
      }

      case 'adjust_credits': {
        if (typeof body.delta !== 'number') {
          return NextResponse.json({ error: 'delta must be a number' }, { status: 400 });
        }
        const current = typeof data.credits === 'number' ? data.credits : 0;
        const next    = Math.max(0, current + body.delta);
        await ref.update({ credits: next, updatedAt: new Date() });
        break;
      }

      case 'set_status': {
        const status = body.status ?? 'inactive';
        await ref.update({ licenseStatus: status, updatedAt: new Date() });

        if (status === 'inactive') {
          const devicesSnap = await ref.collection('devices').get();
          if (!devicesSnap.empty) {
            const batch = db.batch();
            devicesSnap.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
            console.log(`[admin] Revoked ${devicesSnap.size} device(s) for suspended user ${params.id}`);
          }
        }
        break;
      }

      case 'set_device_limit': {
        const limit = typeof body.deviceLimit === 'number' ? body.deviceLimit : 1;
        await ref.update({ deviceLimit: Math.max(0, limit), updatedAt: new Date() });

        if (body.clearDevices) {
          const devicesSnap = await ref.collection('devices').get();
          if (!devicesSnap.empty) {
            const batch = db.batch();
            devicesSnap.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
            console.log(`[admin] Cleared ${devicesSnap.size} device(s) for user ${params.id}`);
          }
        }
        break;
      }

      case 'refresh_location': {
        // Location is synced via /api/sync-location from the client; nothing to refresh from Clerk.
        return NextResponse.json({
          ok: true,
          data: {
            country: data.country ?? null,
            countryCode: data.countryCode ?? null,
          },
        });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    const updated = await ref.get();
    return NextResponse.json({ ok: true, data: updated.data() });
  } catch (err) {
    console.error('[admin PATCH]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}

// ─── DELETE, permanently remove user ────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  try {
    const ref = db.collection('users').doc(params.id);

    const [jobsSnap, devicesSnap] = await Promise.all([
      ref.collection('jobs').limit(500).get(),
      ref.collection('devices').get(),
    ]);
    if (jobsSnap.docs.length > 0 || devicesSnap.docs.length > 0) {
      const batch = db.batch();
      jobsSnap.docs.forEach(d => batch.delete(d.ref));
      devicesSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    await ref.delete();

    // Also wipe web sessions for this user
    const sessions = await db.collection('web_sessions').where('userId', '==', params.id).limit(100).get();
    if (!sessions.empty) {
      const batch = db.batch();
      sessions.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    console.log(`[admin] Deleted user ${params.id}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[admin DELETE user]', err);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
