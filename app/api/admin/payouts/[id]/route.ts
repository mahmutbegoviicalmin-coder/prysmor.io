import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/admin/auth';
import { docToPayoutRequest } from '@/lib/payouts';

/** PATCH /api/admin/payouts/[id] — mark paid or rejected */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as { status?: 'paid' | 'rejected'; adminNote?: string };
  const status = body.status;
  if (status !== 'paid' && status !== 'rejected') {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const ref = db.collection('payoutRequests').doc(params.id);
  const doc = await ref.get();
  if (!doc.exists) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const payout = docToPayoutRequest(doc);
  if (payout.status !== 'pending') {
    return NextResponse.json({ error: 'Request is no longer pending' }, { status: 400 });
  }

  const now = new Date();
  const adminNote = typeof body.adminNote === 'string' ? body.adminNote.trim() : '';

  if (status === 'rejected') {
    await ref.update({
      status: 'rejected',
      adminNote: adminNote || undefined,
      updatedAt: now,
    });
    return NextResponse.json({ ok: true });
  }

  const affRef = db.collection('affiliates').doc(payout.affiliateId);
  const affDoc = await affRef.get();
  if (!affDoc.exists) {
    return NextResponse.json({ error: 'Affiliate not found' }, { status: 404 });
  }

  const aff = affDoc.data()!;
  const pending = Number(aff.manualPendingEarnings ?? 0);
  const paid = Number(aff.manualPaidEarnings ?? 0);

  if (payout.amount > pending) {
    return NextResponse.json({ error: 'Payout amount exceeds pending balance' }, { status: 400 });
  }

  const batch = db.batch();
  batch.update(ref, {
    status: 'paid',
    adminNote: adminNote || undefined,
    updatedAt: now,
    paidAt: now,
  });
  batch.update(affRef, {
    manualPendingEarnings: Math.max(0, pending - payout.amount),
    manualPaidEarnings: paid + payout.amount,
    updatedAt: now,
  });
  await batch.commit();

  return NextResponse.json({ ok: true });
}
