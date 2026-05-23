import { currentUser } from '@clerk/nextjs/server';
import { NextResponse }  from 'next/server';
import { LS_STORE_ID, VARIANT_TO_PLAN } from '@/lib/lemonsqueezy';

const ADMIN_EMAILS = ['mahmutbegoviic.almin@gmail.com'];
const LS_API       = 'https://api.lemonsqueezy.com/v1';

// Variant IDs that belong to plans (not credit packs)
const PLAN_VARIANT_IDS = new Set(Object.keys(VARIANT_TO_PLAN));

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
    Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
    Accept:        'application/vnd.api+json',
  };
}

async function fetchAllPages(url: string): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let next: string | null = url;
  while (next) {
    const res  = await fetch(next, { headers: lsHeaders(), next: { revalidate: 0 } });
    if (!res.ok) {
      console.error('[revenue] LS fetch failed', res.status, await res.text().catch(() => ''));
      break;
    }
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
  mrr:         number; // USD
  createdAt:   string;
  renewsAt:    string | null;
  cancelledAt: string | null;
  source:      'lemonsqueezy';
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
  const user   = await currentUser();
  const emails = user?.emailAddresses?.map(e => e.emailAddress) ?? [];
  if (!emails.some(e => ADMIN_EMAILS.includes(e))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const apiKey = process.env.LEMONSQUEEZY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'LEMONSQUEEZY_API_KEY not configured' }, { status: 500 });
  }

  const now        = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // ── Pull all subscriptions + orders from LemonSqueezy ─────────────────────
  const [rawSubs, rawOrders] = await Promise.all([
    fetchAllPages(`${LS_API}/subscriptions?filter[store_id]=${LS_STORE_ID}&page[size]=100`),
    fetchAllPages(`${LS_API}/orders?filter[store_id]=${LS_STORE_ID}&page[size]=100`),
  ]);

  // ── Process subscriptions ──────────────────────────────────────────────────
  let activeCount      = 0;
  let cancelledCount   = 0;
  let pausedCount      = 0;
  let trialingCount    = 0;
  let newThisMonth     = 0;
  let churnedThisMonth = 0;

  const planCounts: Record<string, number> = {};
  const planMrr:    Record<string, number> = {};
  const allSubs:    LsSub[]                = [];

  for (const sub of rawSubs) {
    const attrs     = sub.attributes as Record<string, unknown>;
    const status    = String(attrs.status ?? '');
    const variantId = String(
      (sub.relationships as Record<string, unknown> | undefined)
        ? ((sub.relationships as Record<string, Record<string, unknown>>)?.variant?.data as Record<string, unknown>)?.id ?? ''
        : attrs.variant_id ?? ''
    );

    // Map variant → plan
    const plan      = VARIANT_TO_PLAN[variantId] ?? 'other';
    const planLabel = PLAN_LABEL[plan] ?? plan;

    // MRR from LS in cents → USD
    const mrrCents  = typeof attrs.mrr === 'number' ? attrs.mrr : 0;
    const mrrUsd    = mrrCents / 100;

    const createdAt  = String(attrs.created_at  ?? '');
    const renewsAt   = attrs.renews_at    ? String(attrs.renews_at)   : null;
    const cancelledAt = attrs.ends_at     ? String(attrs.ends_at)     : null;

    const createdDate = createdAt ? new Date(createdAt) : null;

    if (status === 'active') {
      activeCount++;
      if (createdDate && createdDate >= monthStart) newThisMonth++;
      if (plan !== 'other') {
        planCounts[plan] = (planCounts[plan] ?? 0) + 1;
        planMrr[plan]    = (planMrr[plan]    ?? 0) + mrrUsd;
      }
    } else if (status === 'cancelled' || status === 'expired') {
      cancelledCount++;
      // Churned this month: cancelled + updated this month
      const updatedAt = attrs.updated_at ? new Date(String(attrs.updated_at)) : null;
      if (attrs.cancelled && updatedAt && updatedAt >= monthStart) churnedThisMonth++;
    } else if (status === 'paused') {
      pausedCount++;
    } else if (status === 'trialing') {
      trialingCount++;
      if (createdDate && createdDate >= monthStart) newThisMonth++;
    }

    allSubs.push({
      id:          String(sub.id ?? ''),
      email:       String(attrs.user_email ?? ''),
      name:        String(attrs.user_name  ?? attrs.user_email ?? ''),
      plan,
      planLabel,
      status,
      mrr:         mrrUsd,
      createdAt,
      renewsAt,
      cancelledAt,
      source:      'lemonsqueezy',
    });
  }

  // Sort newest first
  allSubs.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));

  const grossMrr = Object.values(planMrr).reduce((s, v) => s + v, 0);

  const planBreakdown = ['exclusive', 'pro', 'starter']
    .filter(p => (planCounts[p] ?? 0) > 0)
    .map(p => ({
      plan:  p,
      label: PLAN_LABEL[p],
      count: planCounts[p] ?? 0,
      mrr:   planMrr[p]   ?? 0,
      color: PLAN_COLOR[p],
    }));

  // ── Process orders — only count credit pack one-time purchases ─────────────
  // Subscription payments also create orders in LS; we exclude them by checking
  // whether the order's first_order_item variant belongs to a subscription plan.
  let orderCount   = 0;
  let orderRevenue = 0;

  for (const order of rawOrders) {
    const attrs = order.attributes as Record<string, unknown>;
    if (String(attrs.status ?? '') !== 'paid') continue;

    // Check if this order contains a subscription plan variant — if so, skip it.
    const firstItem = (attrs.first_order_item as Record<string, unknown> | null) ?? null;
    const itemVariantId = firstItem ? String(firstItem.variant_id ?? '') : '';
    if (PLAN_VARIANT_IDS.has(itemVariantId)) continue; // subscription payment, not a credit pack

    // This is a one-time / credit pack order
    orderCount++;
    const total = typeof attrs.total === 'number' ? attrs.total : 0;
    orderRevenue += total / 100;
  }

  const data: RevenueData = {
    mrr:              grossMrr,
    arr:              grossMrr * 12,
    activeCount,
    cancelledCount,
    pausedCount,
    trialingCount,
    newThisMonth,
    churnedThisMonth,
    planBreakdown,
    recentSubs:       allSubs.slice(0, 20),
    orderCount,
    orderRevenue,
  };

  return NextResponse.json(data);
}
