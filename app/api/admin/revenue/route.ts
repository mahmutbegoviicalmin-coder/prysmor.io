import { currentUser } from '@clerk/nextjs/server';
import { NextResponse }  from 'next/server';
import { LS_STORE_ID, VARIANT_TO_PLAN } from '@/lib/lemonsqueezy';
import { db } from '@/lib/firebaseAdmin';

const ADMIN_EMAILS = ['mahmutbegoviic.almin@gmail.com'];

const LS_API = 'https://api.lemonsqueezy.com/v1';

const PLAN_MONTHLY_USD: Record<string, number> = {
  starter:   29,
  pro:       49,
  exclusive: 149,
};

const PLAN_COLOR: Record<string, string> = {
  starter:   '#6B7280',
  pro:       '#60A5FA',
  exclusive: '#F59E0B',
  other:     '#374151',
};

const PLAN_LABEL: Record<string, string> = {
  starter:   'Starter',
  pro:       'Pro',
  exclusive: 'Exclusive',
  other:     'Other',
};

function lsHeaders() {
  return {
    Authorization:  `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
    Accept:         'application/vnd.api+json',
  };
}

async function fetchAllPages(url: string): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let next: string | null = url;
  while (next) {
    const res  = await fetch(next, { headers: lsHeaders() });
    if (!res.ok) break;
    const json = await res.json() as {
      data:  Record<string, unknown>[];
      links: { next?: string };
    };
    all.push(...json.data);
    next = json.links?.next ?? null;
  }
  return all;
}

export interface LsSub {
  id:          string;
  email:       string;
  name:        string;
  plan:        string;
  planLabel:   string;
  status:      string;
  mrr:         number;
  createdAt:   string;
  renewsAt:    string | null;
  cancelledAt: string | null;
  source:      'firestore' | 'lemonsqueezy';
}

export interface RevenueData {
  mrr:              number;
  arr:              number;
  activeCount:      number;
  cancelledCount:   number;
  pausedCount:      number;
  trialingCount:    number;
  newThisMonth:     number;
  churnedThisMonth: number;
  planBreakdown:    { plan: string; label: string; count: number; mrr: number; color: string }[];
  recentSubs:       LsSub[];
  orderCount:       number;
  orderRevenue:     number;
}

export async function GET() {
  const user  = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress ?? '';
  if (!ADMIN_EMAILS.includes(email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const apiKey = process.env.LEMONSQUEEZY_API_KEY;

  const now        = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // ── 1. Firestore — source of truth for active plans ───────────────────────
  const fsSnap = await db.collection('users').limit(1000).get();

  const fsPlanCounts: Record<string, number> = {};
  const fsPlanMrr:    Record<string, number> = {};
  let fsActiveCount   = 0;
  let fsNewThisMonth  = 0;
  const fsSubs: LsSub[] = [];

  for (const doc of fsSnap.docs) {
    const d     = doc.data();
    const plan  = String(d.plan ?? 'none');
    const stat  = String(d.licenseStatus ?? 'inactive');
    if (stat !== 'active') continue;
    if (!['starter', 'pro', 'exclusive'].includes(plan)) continue;

    const monthlyUsd = PLAN_MONTHLY_USD[plan] ?? 0;
    fsActiveCount++;
    fsPlanCounts[plan] = (fsPlanCounts[plan] ?? 0) + 1;
    fsPlanMrr[plan]    = (fsPlanMrr[plan]    ?? 0) + monthlyUsd;

    const createdAtRaw = d.createdAt?.toDate?.() ?? (d.createdAt ? new Date(d.createdAt) : null);
    if (createdAtRaw && createdAtRaw >= monthStart) fsNewThisMonth++;

    fsSubs.push({
      id:          doc.id,
      email:       String(d.email       ?? ''),
      name:        String(d.displayName ?? d.email ?? ''),
      plan,
      planLabel:   PLAN_LABEL[plan] ?? plan,
      status:      'active',
      mrr:         monthlyUsd,
      createdAt:   createdAtRaw?.toISOString() ?? '',
      renewsAt:    d.renewalDate ? String(d.renewalDate) : null,
      cancelledAt: null,
      source:      'firestore',
    });
  }

  // Sort newest first
  fsSubs.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));

  const planBreakdown = ['exclusive', 'pro', 'starter']
    .filter(p => (fsPlanCounts[p] ?? 0) > 0)
    .map(p => ({
      plan:  p,
      label: PLAN_LABEL[p],
      count: fsPlanCounts[p] ?? 0,
      mrr:   fsPlanMrr[p]   ?? 0,
      color: PLAN_COLOR[p],
    }));

  const fsMrr = Object.values(fsPlanMrr).reduce((s, v) => s + v, 0);

  // ── 2. LemonSqueezy — subscription history & one-time orders ─────────────
  let lsCancelledCount   = 0;
  let lsPausedCount      = 0;
  let lsTrialingCount    = 0;
  let lsChurnedThisMonth = 0;
  let orderCount         = 0;
  let orderRevenue       = 0;

  if (apiKey) {
    try {
      const [rawSubs, rawOrders] = await Promise.all([
        fetchAllPages(`${LS_API}/subscriptions?filter[store_id]=${LS_STORE_ID}&page[size]=100`),
        fetchAllPages(`${LS_API}/orders?filter[store_id]=${LS_STORE_ID}&page[size]=100`),
      ]);

      for (const sub of rawSubs) {
        const attrs  = sub.attributes as Record<string, unknown>;
        const status = String(attrs.status ?? '');
        if (status === 'trialing') lsTrialingCount++;
        else if (status === 'cancelled' || status === 'expired') lsCancelledCount++;
        else if (status === 'paused') lsPausedCount++;
        if (attrs.cancelled && attrs.updated_at && new Date(String(attrs.updated_at)) >= monthStart) {
          lsChurnedThisMonth++;
        }
      }

      for (const order of rawOrders) {
        const attrs  = order.attributes as Record<string, unknown>;
        if (String(attrs.status ?? '') !== 'paid') continue;
        orderCount++;
        const total = typeof attrs.total === 'number' ? attrs.total : 0;
        orderRevenue += total / 100;
      }
    } catch (err) {
      console.error('[admin/revenue] LS fetch error (non-fatal):', err);
    }
  }

  const data: RevenueData = {
    mrr:              fsMrr,
    arr:              fsMrr * 12,
    activeCount:      fsActiveCount,
    cancelledCount:   lsCancelledCount,
    pausedCount:      lsPausedCount,
    trialingCount:    lsTrialingCount,
    newThisMonth:     fsNewThisMonth,
    churnedThisMonth: lsChurnedThisMonth,
    planBreakdown,
    recentSubs:       fsSubs.slice(0, 20),
    orderCount,
    orderRevenue,
  };

  return NextResponse.json(data);
}
