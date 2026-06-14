import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/admin/auth';
import { docToPayoutRequest } from '@/lib/payouts';

function buildPayoutUpdate(fields: {
  status: 'paid' | 'rejected';
  adminNote?: string;
  paidAt?: Date;
}) {
  const update: Record<string, unknown> = {
    status: fields.status,
    updatedAt: new Date(),
  };
  if (fields.adminNote) update.adminNote = fields.adminNote;
  if (fields.paidAt) update.paidAt = fields.paidAt;
  return update;
}

/** PATCH /api/admin/payouts/[id] — mark paid or rejected */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
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
      await ref.update(buildPayoutUpdate({ status: 'rejected', adminNote }));
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
    const amount = Number(payout.amount);

    if (amount > pending + 0.001) {
      return NextResponse.json(
        {
          error: `Payout amount ($${amount.toFixed(2)}) exceeds available balance ($${pending.toFixed(2)})`,
        },
        { status: 400 },
      );
    }

    const batch = db.batch();
    batch.update(ref, buildPayoutUpdate({ status: 'paid', adminNote, paidAt: now }));
    batch.update(affRef, {
      manualPendingEarnings: Math.max(0, pending - amount),
      manualPaidEarnings: paid + amount,
      updatedAt: now,
    });
    await batch.commit();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[admin/payouts] PATCH failed:', err);
    const message = err instanceof Error ? err.message : 'Failed to update payout';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
