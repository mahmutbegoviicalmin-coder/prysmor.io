import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import {
  getEmailAdminStats,
  processEmailQueue,
  enrollAllUnpaidInFunnel,
  enrollAllStarterPro,
} from '@/lib/email/enrollments';
import { updateEmailSettings, type CampaignOverride } from '@/lib/email/settings';
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
    campaign?: { id: FunnelId; override: CampaignOverride };
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

  const campaignOverrides: Partial<Record<FunnelId, CampaignOverride>> = {};
  if (body.campaign?.id && body.campaign.override) {
    campaignOverrides[body.campaign.id] = body.campaign.override;
  }

  try {
    const settings = await updateEmailSettings({
      dailyMarketingCap:
        typeof body.dailyMarketingCap === 'number' && body.dailyMarketingCap > 0
          ? Math.min(body.dailyMarketingCap, 500)
          : undefined,
      funnels: Object.keys(funnelPatch).length ? funnelPatch : undefined,
      campaignOverrides: Object.keys(campaignOverrides).length ? campaignOverrides : undefined,
    });
    const stats = await getEmailAdminStats();
    return NextResponse.json({ settings, ...stats });
  } catch (err) {
    console.error('[admin/email] PATCH', err);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}

/** POST { action, funnelId? } */
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
      const enroll = funnelId === 'starter-pro'
        ? await enrollAllStarterPro()
        : await enrollAllUnpaidInFunnel(funnelId);
      const queue = await processEmailQueue();
      return NextResponse.json({ ok: true, action, enroll, queue });
    }

    if (action === 'enroll-unpaid') {
      const enroll = await enrollAllUnpaidInFunnel(funnelId);
      return NextResponse.json({ ok: true, action, enroll });
    }

    const queue = await processEmailQueue();
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
