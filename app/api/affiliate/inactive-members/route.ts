import { NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { PLAN_LABELS } from '@/lib/firestore/users';
import { resolveAffiliateForUser } from '@/lib/affiliates';
import { requireUser } from '@/lib/auth/session';

export const runtime = 'nodejs';

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
 * Returns users whose subscription is NOT active (Firestore users collection only).
 */
export async function GET() {
  const authResult = await requireUser();
  if (!authResult.ok) return authResult.response;
  const { userId, email } = authResult.user;

  const affiliate = await resolveAffiliateForUser(userId, email);
  if (!affiliate || affiliate.status !== 'active') {
    return NextResponse.json({ error: 'No affiliate profile found' }, { status: 404 });
  }

  const snap = await db.collection('users').limit(500).get();
  const members: InactiveMember[] = [];

  for (const doc of snap.docs) {
    const d = doc.data();
    const status = (d.licenseStatus as string) ?? 'inactive';
    if (status === 'active' || status === 'trialing') continue;

    const plan = (d.plan as string) ?? 'unpaid';
    const firstName = d.firstName ?? '';
    const lastName = d.lastName ?? '';
    const resolvedEmail = d.userEmail || d.email || '';
    const displayName =
      firstName || lastName
        ? [firstName, lastName].filter(Boolean).join(' ')
        : (d.displayName ?? String(resolvedEmail).split('@')[0] ?? '');

    let createdAt: string | null = null;
    if (d.createdAt?.toDate) createdAt = d.createdAt.toDate().toISOString();
    else if (d.createdAt instanceof Date) createdAt = d.createdAt.toISOString();

    members.push({
      id: doc.id,
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
