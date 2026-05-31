import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { getEmailAdminStats } from '@/lib/email/enrollments';
import { updateEmailSettings } from '@/lib/email/settings';
import { processEmailQueue } from '@/lib/email/enrollments';
import type { FunnelId } from '@/lib/email/constants';
import { FUNNEL_IDS } from '@/lib/email/constants';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  try {
    const stats = await getEmailAdminStats();
    return NextResponse.json(stats);
  } catch (err) {
    console.error('[admin/email] GET', err);
    return NextResponse.json({ error: 'Failed to load email stats' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  let body: {
    dailyMarketingCap?: number;
    funnels?: Partial<Record<FunnelId, { enabled?: boolean }>>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const funnelPatch: Partial<Record<FunnelId, { enabled: boolean }>> = {};
  if (body.funnels) {
    for (const id of FUNNEL_IDS) {
      if (body.funnels[id]?.enabled !== undefined) {
        funnelPatch[id] = { enabled: !!body.funnels[id]!.enabled };
      }
    }
  }

  try {
    const settings = await updateEmailSettings({
      dailyMarketingCap:
        typeof body.dailyMarketingCap === 'number' && body.dailyMarketingCap > 0
          ? Math.min(body.dailyMarketingCap, 500)
          : undefined,
      funnels: Object.keys(funnelPatch).length ? funnelPatch : undefined,
    });
    return NextResponse.json({ settings });
  } catch (err) {
    console.error('[admin/email] PATCH', err);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}

/** Manual trigger — process queue now (respects daily cap) */
export async function POST() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  try {
    const result = await processEmailQueue(30);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[admin/email] POST run', err);
    return NextResponse.json({ error: 'Queue processing failed' }, { status: 500 });
  }
}
