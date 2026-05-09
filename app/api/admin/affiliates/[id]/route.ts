import { currentUser }            from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db }                        from '@/lib/firebaseAdmin';
import { getReferralsByCode }        from '@/lib/affiliates';

const ADMIN_EMAILS = ['mahmutbegoviic.almin@gmail.com'];

/** PATCH /api/admin/affiliates/[id] — update affiliate */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user  = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress ?? '';
  if (!ADMIN_EMAILS.includes(email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body: Partial<{
    commissionPerSale: number;
    status: 'active' | 'inactive';
    code: string;
    note: string;
  }> = await req.json();

  const allowed = ['commissionPerSale', 'status', 'code', 'note'];
  const update: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of allowed) {
    if (key in body) update[key] = (body as Record<string, unknown>)[key];
  }

  await db.collection('affiliates').doc(params.id).update(update);
  return NextResponse.json({ ok: true });
}

/** DELETE /api/admin/affiliates/[id] — delete affiliate */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user  = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress ?? '';
  if (!ADMIN_EMAILS.includes(email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await db.collection('affiliates').doc(params.id).delete();
  return NextResponse.json({ ok: true });
}

/** POST /api/admin/affiliates/[id]/mark-paid — mark referrals as paid */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user  = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress ?? '';
  if (!ADMIN_EMAILS.includes(email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const affDoc = await db.collection('affiliates').doc(params.id).get();
  if (!affDoc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const aff      = affDoc.data()!;
  const referrals = await getReferralsByCode(aff.code);
  const pending   = referrals.filter(r => r.status === 'pending');

  if (pending.length === 0) {
    return NextResponse.json({ message: 'No pending referrals to mark as paid' });
  }

  const batch = db.batch();
  for (const r of pending) {
    batch.update(db.collection('affiliateReferrals').doc(r.id), {
      status:   'paid',
      paidAt:   new Date(),
    });
  }

  const paidAmount = pending.reduce((sum, r) => sum + r.commission, 0);
  batch.update(db.collection('affiliates').doc(params.id), {
    paidEarnings:    (aff.paidEarnings ?? 0) + paidAmount,
    pendingEarnings: 0,
    updatedAt:       new Date(),
  });

  await batch.commit();
  return NextResponse.json({ marked: pending.length, amount: paidAmount });
}
