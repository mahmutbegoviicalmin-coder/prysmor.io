import { NextRequest, NextResponse } from 'next/server';
import { validatePanelToken } from '@/lib/motionforge/auth';
import { getCustomerPortalUrl } from '@/lib/lemonsqueezy';
import { db } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

const BILLING_URL = 'https://prysmor.io/dashboard/billing';

/**
 * Panel "Manage" link:
 * - Legacy subscribers → Lemon Squeezy customer portal
 * - Lifetime / no subscription id → dashboard billing (top-ups)
 */
export async function GET(req: NextRequest) {
  const session = await validatePanelToken(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const snap = await db.collection('users').doc(session.userId).get();
  const lsSubscriptionId = snap.data()?.lsSubscriptionId as string | undefined;

  if (!lsSubscriptionId) {
    return NextResponse.json(
      { url: BILLING_URL, mode: 'billing' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const url = await getCustomerPortalUrl(lsSubscriptionId);
  if (!url) {
    return NextResponse.json(
      { url: BILLING_URL, mode: 'billing' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return NextResponse.json(
    { url, mode: 'portal' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
