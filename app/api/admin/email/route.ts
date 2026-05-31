import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import {
  getEmailAdminStats,
  processEmailQueue,
  enrollAllUnpaidInFunnel,
} from '@/lib/email/enrollments';
import { updateEmailSettings } from '@/lib/email/settings';
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

/** POST { action?: 'process-queue' | 'start-campaign', funnelId?: FunnelId } */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  let body: { action?: string; funnelId?: FunnelId } = {};
  try {
    const raw = await req.text();
    if (raw) body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const action = body.action ?? 'process-queue';
  const funnelId = body.funnelId ?? 'unpaid-starter';

  try {
    if (action === 'start-campaign') {
      const enroll = await enrollAllUnpaidInFunnel(funnelId);
      const queue = await processEmailQueue(30);
      return NextResponse.json({ ok: true, action, enroll, queue });
    }

    if (action === 'enroll-unpaid') {
      const enroll = await enrollAllUnpaidInFunnel(funnelId);
      return NextResponse.json({ ok: true, action, enroll });
    }

    const queue = await processEmailQueue(30);
    return NextResponse.json({ ok: true, action: 'process-queue', ...queue });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Request failed';
    console.error('[admin/email] POST', action, err);
    const hint = /index/i.test(message)
      ? 'Deploy Firestore indexes: firebase deploy --only firestore:indexes'
      : undefined;
    return NextResponse.json({ error: message, hint }, { status: 500 });
  }
}
