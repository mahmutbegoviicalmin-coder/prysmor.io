import { currentUser, clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse }  from 'next/server';
import { db }                         from '@/lib/firebaseAdmin';
import { PLAN_CREDITS }               from '@/lib/firestore/users';

const CLERK_KEY = process.env.CLERK_SECRET_KEY ?? '';

/** Fetch the latest Clerk session country for a user and return country + code. */
async function fetchClerkCountry(userId: string): Promise<{ country: string | null; countryCode: string | null }> {
  if (!CLERK_KEY) return { country: null, countryCode: null };
  const NAME_TO_CODE: Record<string, string> = {
    "australia":"AU","austria":"AT","bangladesh":"BD","belgium":"BE","brazil":"BR",
    "canada":"CA","china":"CN","croatia":"HR","czech republic":"CZ","czechia":"CZ",
    "denmark":"DK","egypt":"EG","finland":"FI","france":"FR","germany":"DE",
    "ghana":"GH","greece":"GR","hungary":"HU","india":"IN","indonesia":"ID",
    "iran":"IR","iraq":"IQ","ireland":"IE","israel":"IL","italy":"IT","japan":"JP",
    "jordan":"JO","kenya":"KE","malaysia":"MY","mexico":"MX","morocco":"MA",
    "netherlands":"NL","new zealand":"NZ","nigeria":"NG","norway":"NO","pakistan":"PK",
    "philippines":"PH","poland":"PL","portugal":"PT","romania":"RO","russia":"RU",
    "saudi arabia":"SA","serbia":"RS","singapore":"SG","south africa":"ZA",
    "south korea":"KR","spain":"ES","sweden":"SE","switzerland":"CH","taiwan":"TW",
    "thailand":"TH","turkey":"TR","ukraine":"UA","united arab emirates":"AE",
    "united kingdom":"GB","united states":"US","vietnam":"VN",
  };
  try {
    const res = await fetch(
      `https://api.clerk.com/v1/sessions?user_id=${userId}&limit=5`,
      { headers: { Authorization: `Bearer ${CLERK_KEY}` }, signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return { country: null, countryCode: null };
    const sessions: { latest_activity?: { country?: string } }[] = await res.json();
    for (const s of sessions) {
      const c = s.latest_activity?.country ?? null;
      if (c) {
        const code = NAME_TO_CODE[c.toLowerCase().trim()] ?? c.slice(0, 2).toUpperCase();
        return { country: c, countryCode: code };
      }
    }
  } catch { /* ignore */ }
  return { country: null, countryCode: null };
}

const ADMIN_EMAILS = ['mahmutbegoviic.almin@gmail.com'];

async function checkAdmin() {
  const user   = await currentUser();
  const emails = user?.emailAddresses?.map(e => e.emailAddress) ?? [];
  return emails.some(e => ADMIN_EMAILS.includes(e));
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

  // Prevent admin from modifying their own account via admin panel
  const self = await currentUser();
  if (self?.id === params.id && body.action === 'set_plan') {
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
        // Back-fill createdAt if the document was created without it
        // (e.g. via syncUserProfile which doesn't set createdAt).
        // Without this field the admin GET orderBy would silently exclude the user.
        if (!data.createdAt) update.createdAt = new Date();
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
        const { country, countryCode } = await fetchClerkCountry(params.id);
        if (country) {
          await ref.update({ country, countryCode, updatedAt: new Date() });
          const updated2 = await ref.get();
          return NextResponse.json({ ok: true, data: { ...updated2.data(), country, countryCode } });
        }
        return NextResponse.json({ ok: true, data: { country: null, countryCode: null } });
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

    // Delete subcollections (Firestore doesn't auto-delete them)
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

    // Delete Firestore user doc
    await ref.delete();

    // Delete from Clerk (last — so we can retry if Firestore fails)
    const clerk = await clerkClient();
    await clerk.users.deleteUser(params.id);

    console.log(`[admin] Deleted user ${params.id}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[admin DELETE user]', err);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
