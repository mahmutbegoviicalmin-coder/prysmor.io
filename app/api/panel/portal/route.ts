import { NextRequest, NextResponse } from 'next/server';
import { validatePanelToken } from '@/lib/motionforge/auth';
import { getCustomerPortalUrl } from '@/lib/lemonsqueezy';
import { db } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await validatePanelToken(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const snap = await db.collection('users').doc(session.userId).get();
  const lsSubscriptionId = snap.data()?.lsSubscriptionId as string | undefined;
  if (!lsSubscriptionId) {
    return NextResponse.json({ error: 'No subscription to manage' }, { status: 404 });
  }

  const url = await getCustomerPortalUrl(lsSubscriptionId);
  if (!url) {
    return NextResponse.json({ error: 'Portal unavailable' }, { status: 502 });
  }

  return NextResponse.json({ url }, { headers: { 'Cache-Control': 'no-store' } });
}
