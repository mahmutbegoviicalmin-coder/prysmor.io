import { currentUser, clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse }  from 'next/server';
import { db }                         from '@/lib/firebaseAdmin';
import { PLAN_CREDITS }               from '@/lib/firestore/users';

const ADMIN_EMAILS = ['mahmutbegoviic.almin@gmail.com'];

async function checkAdmin() {
  const user  = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress ?? '';
  return ADMIN_EMAILS.includes(email);
}

// ─── PATCH — update user ──────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: {
    action:        'set_plan' | 'set_credits' | 'adjust_credits' | 'set_status' | 'refresh_location' | 'set_device_limit';
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
        if (body.resetCredits) {
          const cap           = PLAN_CREDITS[plan] ?? 1000;
          update.credits      = cap;
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

        // When suspending, immediately delete all registered devices so the
        // panel loses access on its next request (no active device = no auth).
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

      case 'refresh_location': {
        let country:     string | null = null;
        let countryCode: string | null = null;

        try {
          // Fetch user's latest Clerk session to get IP address
          const sessionsRes = await clerkClient.sessions.getSessionList({
            userId: params.id,
            limit:  1,
          });
          // Clerk SDK returns either an array or { data: [] } depending on version
          const sessions = Array.isArray(sessionsRes)
            ? sessionsRes
            : (sessionsRes as { data?: unknown[] }).data ?? [];
          const session   = (sessions as { latestActivity?: { ipAddress?: string | null; country?: string | null } }[])[0];
          const ipAddress = session?.latestActivity?.ipAddress ?? null;

          // Try ip-api.com with the session IP (skip private/localhost IPs)
          const isPrivate = !ipAddress
            || ipAddress === '::1'
            || ipAddress.startsWith('127.')
            || ipAddress.startsWith('10.')
            || ipAddress.startsWith('192.168.')
            || ipAddress.startsWith('172.16.');

          if (!isPrivate && ipAddress) {
            const geoRes = await fetch(
              `http://ip-api.com/json/${ipAddress}?fields=country,countryCode,status`,
            );
            if (geoRes.ok) {
              const geo = await geoRes.json();
              if (geo.status === 'success') {
                country     = geo.country;
                countryCode = geo.countryCode;
              }
            }
          }

          // Fallback: Clerk's own country from session activity
          if (!country && session?.latestActivity?.country) {
            country = session.latestActivity.country;
          }
        } catch (e) {
          console.warn('[admin refresh_location] session lookup failed:', e);
        }

        if (country) {
          await ref.update({
            country,
            ...(countryCode ? { countryCode } : {}),
            updatedAt: new Date(),
          });
        }

        return NextResponse.json({ ok: true, data: { country, countryCode } });
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

// ─── DELETE — permanently remove user ────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const ref = db.collection('users').doc(params.id);

    // Delete jobs subcollection (Firestore doesn't auto-delete subcollections)
    const jobsSnap = await ref.collection('jobs').limit(500).get();
    if (jobsSnap.docs.length > 0) {
      const batch = db.batch();
      jobsSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    // Delete Firestore user doc
    await ref.delete();

    // Delete from Clerk (last — so we can retry if Firestore fails)
    await clerkClient.users.deleteUser(params.id);

    console.log(`[admin] Deleted user ${params.id}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[admin DELETE user]', err);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
