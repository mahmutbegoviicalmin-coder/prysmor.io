import { requireUser } from '@/lib/auth/session';
import { cookies } from 'next/headers';
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
      { error: 'Active license required to purchase credit top-ups.' },
      { status: 403 },
    );
  }

  let body: { packId?: string; fbp?: string; fbc?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const pack = CREDIT_PACKS.find((p) => p.id === body.packId);
  if (!pack) {
    return NextResponse.json({ error: 'Invalid pack ID' }, { status: 400 });
  }

  const jar = cookies();
  const fbp = body.fbp || jar.get('_fbp')?.value || null;
  const fbc = body.fbc || jar.get('_fbc')?.value || null;

  const url = createTopUpCheckout(pack, userId, { fbp, fbc });
  return NextResponse.json({ url });
}
