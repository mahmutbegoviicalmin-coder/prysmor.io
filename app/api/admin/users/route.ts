import { currentUser, clerkClient } from '@clerk/nextjs/server';
import { NextResponse }              from 'next/server';
import { db }                        from '@/lib/firebaseAdmin';
import { PLAN_LABELS, PLAN_CREDITS } from '@/lib/firestore/users';

const ADMIN_EMAILS = ['mahmutbegoviic.almin@gmail.com'];

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
}

export async function GET() {
  const user  = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress ?? '';
  if (!ADMIN_EMAILS.includes(email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch Firestore docs + Clerk users in parallel
  const [snap, clerkUsers] = await Promise.all([
    db.collection('users').orderBy('createdAt', 'desc').limit(500).get(),
    clerkClient.users.getUserList({ limit: 500 }).catch(() => []),
  ]);

  // Build Clerk lookup map: userId → Clerk user
  const clerkMap = new Map<string, (typeof clerkUsers)[0]>();
  for (const cu of clerkUsers) {
    clerkMap.set(cu.id, cu);
  }

  const users: AdminUser[] = snap.docs.map((doc) => {
    const d  = doc.data();
    const cu = clerkMap.get(doc.id);

    const plan         = d.plan ?? 'starter';
    const planCap      = PLAN_CREDITS[plan] ?? 1000;
    const credits      = typeof d.credits      === 'number' ? d.credits      : 0;
    const creditsTotal = typeof d.creditsTotal === 'number' ? d.creditsTotal : planCap;

    let createdAt: string | null = null;
    if (d.createdAt?.toDate) {
      createdAt = d.createdAt.toDate().toISOString();
    } else if (d.createdAt instanceof Date) {
      createdAt = d.createdAt.toISOString();
    }

    // Prefer Clerk data for name/email (always authoritative), fall back to Firestore
    const firstName  = cu?.firstName  ?? d.firstName  ?? '';
    const lastName   = cu?.lastName   ?? d.lastName   ?? '';
    const clerkEmail = cu?.emailAddresses?.[0]?.emailAddress ?? '';
    const fsEmail    = d.userEmail ?? d.email ?? '';
    const resolvedEmail = clerkEmail || fsEmail;

    let displayName = '';
    if (firstName || lastName) {
      displayName = [firstName, lastName].filter(Boolean).join(' ');
    } else {
      displayName = d.displayName ?? '';
    }

    const lastSignInAt = cu?.lastSignInAt
      ? new Date(cu.lastSignInAt).toISOString()
      : null;

    return {
      id:              doc.id,
      email:           resolvedEmail,
      displayName,
      firstName,
      lastName,
      plan,
      planLabel:       PLAN_LABELS[plan] ?? plan,
      licenseStatus:   d.licenseStatus   ?? 'inactive',
      credits,
      creditsTotal,
      renewalDate:     d.renewalDate     ?? null,
      deviceLimit:     d.deviceLimit     ?? 1,
      createdAt,
      lastSignInAt,
      country:         d.country         ?? null,
      countryCode:     d.countryCode     ?? null,
      lsSubscriptionId: d.lsSubscriptionId,
    };
  });

  return NextResponse.json({ users });
}
