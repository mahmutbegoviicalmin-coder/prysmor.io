import { NextRequest, NextResponse }          from 'next/server';
import { validatePanelToken, validatePanelKey } from '@/lib/motionforge/auth';
import { getUser, createUser, PLAN_CREDITS }   from '@/lib/firestore/users';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await validatePanelToken(req);
  if (!session && !validatePanelKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!session) {
    return NextResponse.json({ error: 'Session required' }, { status: 401 });
  }

  // Auto-create doc for accounts made before the credits system
  await createUser(session.userId).catch(() => {});

  const user = await getUser(session.userId).catch(() => null);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const planCap = PLAN_CREDITS[user.plan] ?? PLAN_CREDITS.starter;
  const credits = typeof user.credits === 'number' ? user.credits : planCap;
  const creditsTotal = typeof user.creditsTotal === 'number' ? user.creditsTotal : planCap;

  return NextResponse.json({
    credits,
    creditsTotal,
    plan: user.plan,
  });
}
