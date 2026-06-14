import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { getReferralsByCode } from '@/lib/affiliates';
import { requireAdmin } from '@/lib/admin/auth';

/** PATCH /api/admin/affiliates/[id] */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body: Partial<{
    commissionPercent: number;
    status: 'active' | 'inactive';
    code: string;
    note: string;
    userId: string | null;
    manualTotalEarnings: number;
    manualPendingEarnings: number;
    manualPaidEarnings: number;
    manualActiveMembers: number;
    manualInactiveMembers: number;
    manualStarterCount: number;
    manualProCount: number;
    manualExclusiveCount: number;
    manualChart?: { title: string; points: { label: string; value: number }[] };
  }> = await req.json();

  const allowed = [
    'commissionPercent', 'status', 'code', 'note', 'userId',
    'manualTotalEarnings', 'manualPendingEarnings', 'manualPaidEarnings',
    'manualActiveMembers', 'manualInactiveMembers',
    'manualStarterCount', 'manualProCount', 'manualExclusiveCount',
    'manualChart',
  ];
  const update: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of allowed) {
    if (key in body) {
      if (key === 'userId') {
        update[key] = body.userId?.trim() || null;
      } else {
        update[key] = (body as Record<string, unknown>)[key];
      }
    }
  }

  if ('manualChart' in body && body.manualChart) {
    update.manualChart = body.manualChart;
  }

  await db.collection('affiliates').doc(params.id).update(update);
  return NextResponse.json({ ok: true });
}

/** DELETE /api/admin/affiliates/[id] */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  await db.collection('affiliates').doc(params.id).delete();
  return NextResponse.json({ ok: true });
}

/** POST /api/admin/affiliates/[id] — legacy mark referrals paid */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

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
