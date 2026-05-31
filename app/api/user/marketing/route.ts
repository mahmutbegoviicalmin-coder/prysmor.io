import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const snap = await db.collection('users').doc(userId).get();
  const d = snap.data() ?? {};

  return NextResponse.json({
    marketingOptIn: d.marketingOptIn !== false,
    unsubscribed:   !!d.marketingUnsubscribedAt,
  });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { marketingOptIn?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof body.marketingOptIn !== 'boolean') {
    return NextResponse.json({ error: 'marketingOptIn boolean required' }, { status: 400 });
  }

  const update: Record<string, unknown> = {
    marketingOptIn: body.marketingOptIn,
    updatedAt:      new Date(),
  };

  if (!body.marketingOptIn) {
    update.marketingUnsubscribedAt = new Date();
  } else {
    update.marketingUnsubscribedAt = null;
  }

  await db.collection('users').doc(userId).set(update, { merge: true });

  if (body.marketingOptIn) {
    const { enrollInFunnel, loadUserEmailProfile, isEligibleForFunnel } = await import('@/lib/email/enrollments');
    const profile = await loadUserEmailProfile(userId);
    if (profile?.licenseStatus !== 'active') {
      await enrollInFunnel(userId, 'unpaid-starter');
    } else if (profile.plan === 'starter' && isEligibleForFunnel(profile, 'starter-pro')) {
      await enrollInFunnel(userId, 'starter-pro');
    }
  } else {
    const { cancelAllFunnelsForUser } = await import('@/lib/email/enrollments');
    await cancelAllFunnelsForUser(userId, 'opt_out');
  }

  return NextResponse.json({ marketingOptIn: body.marketingOptIn });
}
