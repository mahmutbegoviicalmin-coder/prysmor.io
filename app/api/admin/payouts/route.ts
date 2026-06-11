import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { getAllPayoutRequests } from '@/lib/payouts';

/** GET /api/admin/payouts */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const requests = await getAllPayoutRequests();
  return NextResponse.json({ requests });
}
