import { NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { PLAN_LABELS, PLAN_CREDITS } from '@/lib/firestore/users';
import { requireAdmin, ADMIN_EMAILS } from '@/lib/admin/auth';
import { deleteUserDeep } from '@/lib/admin/deleteUser';
import { formatBillingAddress, syncUserBillingFromLs } from '@/lib/billing/lsCustomer';

export interface AdminUser {
  id:               string;
  email:            string;
  displayName:      string;
  firstName:        string;
  lastName:         string;
  plan:             string;
  planLabel:        string;
  licenseStatus:    string;
  credits:          number;
  creditsTotal:     number;
  renewalDate:      string | null;
  deviceLimit:      number;
  createdAt:        string | null;
  lastSignInAt:     string | null;
  country:          string | null;
  countryCode:      string | null;
  /** Billing address from Lemon Squeezy (city, region, country). */
  address:          string | null;
  billingName:      string | null;
  lsSubscriptionId?: string;
  lsOrderId?:       string;
  lsCustomerId?:    string;
  trialUsed:        boolean;
  trialUsedAt:      string | null;
  isPaid:           boolean;
}

function toIso(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (v instanceof Date) return v.toISOString();
  if (typeof (v as { toDate?: () => Date }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

function mapUser(docId: string, d: Record<string, any>): AdminUser {
  const plan         = d.plan ?? 'unpaid';
  const planCap      = PLAN_CREDITS[plan] ?? PLAN_CREDITS.starter;
  const credits      = typeof d.credits === 'number' ? d.credits : 0;
  const creditsTotal = typeof d.creditsTotal === 'number' ? d.creditsTotal : planCap;
  const licenseStatus = d.licenseStatus ?? 'inactive';
  const firstName     = d.firstName ?? '';
  const lastName      = d.lastName  ?? '';
  const resolvedEmail = d.userEmail || d.email || '';
  const displayName = (firstName || lastName)
    ? [firstName, lastName].filter(Boolean).join(' ')
    : (d.billingName || d.displayName || String(resolvedEmail).split('@')[0] || '');

  const isPaid = licenseStatus === 'active'
    || !!d.lsOrderId
    || !!d.lsSubscriptionId;

  return {
    id:               docId,
    email:            resolvedEmail,
    displayName,
    firstName,
    lastName,
    plan,
    planLabel:        PLAN_LABELS[plan] ?? plan,
    licenseStatus,
    credits,
    creditsTotal,
    renewalDate:      d.renewalDate ?? null,
    deviceLimit:      d.deviceLimit ?? 1,
    createdAt:        toIso(d.createdAt),
    lastSignInAt:     toIso(d.lastSignInAt),
    country:          d.billingCountryName || d.country || null,
    countryCode:      d.billingCountry || d.countryCode || null,
    address:          formatBillingAddress(d) || null,
    billingName:      typeof d.billingName === 'string' ? d.billingName : null,
    lsSubscriptionId: d.lsSubscriptionId,
    lsOrderId:        d.lsOrderId,
    lsCustomerId:     d.lsCustomerId ? String(d.lsCustomerId) : undefined,
    trialUsed:        d.trialUsed === true,
    trialUsedAt:      toIso(d.trialUsedAt),
    isPaid,
  };
}

export async function GET() {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) return admin.response;

    const snap = await db.collection('users').limit(1000).get();

    // Backfill LS billing for active buyers missing address (best-effort, capped)
    const needsBilling = snap.docs
      .filter((doc) => {
        const d = doc.data();
        return d.licenseStatus === 'active'
          && d.lsCustomerId
          && !d.billingCountry
          && !d.billingCity;
      })
      .slice(0, 25);

    await Promise.all(
      needsBilling.map((doc) =>
        syncUserBillingFromLs(doc.id, String(doc.data().lsCustomerId)).catch(() => {}),
      ),
    );

    const refreshed = needsBilling.length > 0
      ? await db.collection('users').limit(1000).get()
      : snap;

    const users: AdminUser[] = refreshed.docs.map((doc) => mapUser(doc.id, doc.data()));

    users.sort((a, b) => {
      // Active / paid first, then newest
      if (a.licenseStatus === 'active' && b.licenseStatus !== 'active') return -1;
      if (b.licenseStatus === 'active' && a.licenseStatus !== 'active') return 1;
      if (!a.createdAt) return 1;
      if (!b.createdAt) return -1;
      return b.createdAt.localeCompare(a.createdAt);
    });

    return NextResponse.json({ users });
  } catch (err) {
    console.error('[admin GET /api/admin/users]', err);
    return NextResponse.json({ error: 'Internal server error', detail: String(err) }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/users
 * Purge inactive / unpaid registrations. Keeps active license holders and admin emails.
 */
export async function DELETE() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  try {
    const snap = await db.collection('users').limit(2000).get();
    const adminSet = new Set(ADMIN_EMAILS.map((e) => e.toLowerCase()));
    const toDelete = snap.docs.filter((doc) => {
      const d = doc.data();
      const email = String(d.email || d.userEmail || '').toLowerCase();
      if (email && adminSet.has(email)) return false;
      if (d.licenseStatus === 'active') return false;
      return true;
    });

    let deleted = 0;
    const errors: string[] = [];
    for (const doc of toDelete) {
      try {
        await deleteUserDeep(doc.id);
        deleted += 1;
      } catch (err) {
        errors.push(`${doc.id}: ${String(err)}`);
      }
    }

    return NextResponse.json({
      ok: true,
      deleted,
      scanned: snap.size,
      kept: snap.size - deleted,
      errors: errors.slice(0, 20),
      message: `Deleted ${deleted} inactive user(s). Kept ${snap.size - deleted} (active + admins).`,
    });
  } catch (err) {
    console.error('[admin DELETE /api/admin/users]', err);
    return NextResponse.json({ error: 'Purge failed', detail: String(err) }, { status: 500 });
  }
}
