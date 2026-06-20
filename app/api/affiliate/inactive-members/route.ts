import { currentUser, createClerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { PLAN_LABELS } from '@/lib/firestore/users';
import { resolveAffiliateForUser } from '@/lib/affiliates';

export const runtime = 'nodejs';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

interface InactiveMember {
  id: string;
  email: string;
  displayName: string;
  plan: string;
  planLabel: string;
  country: string;
  countryCode: string;
  createdAt: string | null;
}

/**
 * GET /api/affiliate/inactive-members
 *
 * Returns ALL users (global, not tied to this staff member's referrals) whose
 * subscription is NOT active — i.e. only inactive members, with their email
 * address and location. Active and trialing users are filtered out server-side
 * and never returned. Accessible to any active staff member.
 */
export async function GET() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const email = user.emailAddresses[0]?.emailAddress ?? '';
  const affiliate = await resolveAffiliateForUser(user.id, email);
  if (!affiliate || affiliate.status !== 'active') {
    return NextResponse.json({ error: 'No affiliate profile found' }, { status: 404 });
  }

  // Firestore docs + Clerk users (for accurate emails / names), same as admin.
  const [snap, clerkRes] = await Promise.all([
    db.collection('users').limit(500).get(),
    clerk.users.getUserList({ limit: 500 }).catch((err) => {
      console.error('[inactive-members] getUserList error:', err);
      return { data: [] };
    }),
  ]);

  type ClerkUserShape = {
    id: string;
    firstName: string | null;
    lastName: string | null;
    emailAddresses: { emailAddress: string }[];
    createdAt: number;
  };

  const rawList = Array.isArray(clerkRes)
    ? clerkRes
    : ((clerkRes as { data: unknown[] }).data ?? []);
  const clerkUserList = rawList as ClerkUserShape[];

  const fsMap = new Map<string, FirebaseFirestore.DocumentData>();
  for (const doc of snap.docs) {
    fsMap.set(doc.id, doc.data());
  }

  const members: InactiveMember[] = [];
  for (const cu of clerkUserList) {
    const d = fsMap.get(cu.id) ?? {};
    const status = (d.licenseStatus as string) ?? 'inactive';

    // Only inactive — never active or trialing.
    if (status === 'active' || status === 'trialing') continue;

    const plan = (d.plan as string) ?? 'unpaid';
    const firstName = cu.firstName ?? d.firstName ?? '';
    const lastName = cu.lastName ?? d.lastName ?? '';
    const clerkEmail = cu.emailAddresses?.[0]?.emailAddress ?? '';
    const resolvedEmail = clerkEmail || d.userEmail || d.email || '';

    const displayName =
      firstName || lastName
        ? [firstName, lastName].filter(Boolean).join(' ')
        : (d.displayName ?? resolvedEmail.split('@')[0] ?? '');

    let createdAt: string | null = null;
    if (d.createdAt?.toDate) createdAt = d.createdAt.toDate().toISOString();
    else if (d.createdAt instanceof Date) createdAt = d.createdAt.toISOString();
    else if (cu.createdAt) createdAt = new Date(cu.createdAt).toISOString();

    members.push({
      id: cu.id,
      email: resolvedEmail || '—',
      displayName,
      plan,
      planLabel: PLAN_LABELS[plan] ?? plan,
      country: (d.country as string) || 'Unknown',
      countryCode: (d.countryCode as string) || '',
      createdAt,
    });
  }

  members.sort((a, b) => {
    if (!a.createdAt) return 1;
    if (!b.createdAt) return -1;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return NextResponse.json({ members });
}
