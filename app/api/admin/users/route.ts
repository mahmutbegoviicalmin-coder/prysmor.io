import { NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { PLAN_LABELS, PLAN_CREDITS } from '@/lib/firestore/users';
import { requireAdmin } from '@/lib/admin/auth';

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
  lsSubscriptionId?: string;
  trialUsed:        boolean;
  trialUsedAt:      string | null;
}

export async function GET() {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) return admin.response;

    const snap = await db.collection('users').limit(500).get();

    const users: AdminUser[] = snap.docs.map((doc) => {
      const d = doc.data();
      const plan         = d.plan ?? 'unpaid';
      const planCap      = PLAN_CREDITS[plan] ?? PLAN_CREDITS.starter;
      const credits      = typeof d.credits === 'number' ? d.credits : 0;
      const creditsTotal = typeof d.creditsTotal === 'number' ? d.creditsTotal : planCap;

      let createdAt: string | null = null;
      if (d.createdAt?.toDate)              createdAt = d.createdAt.toDate().toISOString();
      else if (d.createdAt instanceof Date) createdAt = d.createdAt.toISOString();

      const firstName     = d.firstName ?? '';
      const lastName      = d.lastName  ?? '';
      const resolvedEmail = d.userEmail || d.email || '';

      const displayName = (firstName || lastName)
        ? [firstName, lastName].filter(Boolean).join(' ')
        : (d.displayName ?? String(resolvedEmail).split('@')[0] ?? '');

      return {
        id:               doc.id,
        email:            resolvedEmail,
        displayName,
        firstName,
        lastName,
        plan,
        planLabel:        PLAN_LABELS[plan] ?? plan,
        licenseStatus:    d.licenseStatus  ?? 'inactive',
        credits,
        creditsTotal,
        renewalDate:      d.renewalDate    ?? null,
        deviceLimit:      d.deviceLimit    ?? 1,
        createdAt,
        lastSignInAt:     null,
        country:          d.country     ?? null,
        countryCode:      d.countryCode ?? null,
        lsSubscriptionId: d.lsSubscriptionId,
        trialUsed:        d.trialUsed   === true,
        trialUsedAt:      d.trialUsedAt?.toDate?.()?.toISOString?.()
                          ?? (d.trialUsedAt instanceof Date ? d.trialUsedAt.toISOString() : null),
      };
    });

    users.sort((a, b) => {
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

/** DELETE /api/admin/users — disabled without Clerk; refuse destructive bulk purge */
export async function DELETE() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  return NextResponse.json({
    error: 'Orphan purge is disabled after Clerk removal. Delete users individually.',
    deleted: 0,
  }, { status: 400 });
}
