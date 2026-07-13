import { requireUser } from '@/lib/auth/session';
import { NextRequest, NextResponse } from 'next/server';
import { CREDIT_PACKS, createTopUpCheckout } from '@/lib/lemonsqueezy';
import { getUser } from '@/lib/firestore/users';

export async function POST(req: NextRequest) {
  const authResult = await requireUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult.user;

  const userDoc = await getUser(userId).catch(() => null);
  if (!userDoc || userDoc.licenseStatus !== 'active') {
    return NextResponse.json(
      { error: 'Active subscription required to purchase credit top-ups.' },
      { status: 403 },
    );
  }

  let body: { packId?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const pack = CREDIT_PACKS.find((p) => p.id === body.packId);
  if (!pack) {
    return NextResponse.json({ error: 'Invalid pack ID' }, { status: 400 });
  }

  const url = createTopUpCheckout(pack, userId);
  return NextResponse.json({ url });
}
