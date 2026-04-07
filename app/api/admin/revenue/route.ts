import { currentUser } from '@clerk/nextjs/server';
import { NextResponse }  from 'next/server';
import { LS_STORE_ID, VARIANT_TO_PLAN } from '@/lib/lemonsqueezy';

const ADMIN_EMAILS = ['mahmutbegoviic.almin@gmail.com'];

const LS_API = 'https://api.lemonsqueezy.com/v1';

/** Monthly price in USD per plan (for MRR calc) */
const PLAN_MONTHLY_USD: Record<string, number> = {
  starter:   29,
  pro:       49,
  exclusive: 149,
};

function lsHeaders() {
  return {
    Authorization:  `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
    Accept:         'application/vnd.api+json',
  };
}

/** Fetch all pages of a LS resource. */
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
  mrr:         number;   // USD/month
  createdAt:   string;
  renewsAt:    string | null;
  cancelledAt: string | null;
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
  orderRevenue:     number;  // one-time USD
}

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

export async function GET() {
  const user  = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress ?? '';
  if (!ADMIN_EMAILS.includes(email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const apiKey = process.env.LEMONSQUEEZY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'LEMONSQUEEZY_API_KEY not set' }, { status: 500 });
  }

  try {
    const [rawSubs, rawOrders] = await Promise.all([
      fetchAllPages(`${LS_API}/subscriptions?filter[store_id]=${LS_STORE_ID}&page[size]=100`),
      fetchAllPages(`${LS_API}/orders?filter[store_id]=${LS_STORE_ID}&page[size]=100`),
    ]);

    // ── Subscriptions ────────────────────────────────────────────────────────

    const now          = new Date();
    const monthStart   = new Date(now.getFullYear(), now.getMonth(), 1);

    let mrr              = 0;
    let activeCount      = 0;
    let cancelledCount   = 0;
    let pausedCount      = 0;
    let trialingCount    = 0;
    let newThisMonth     = 0;
    let churnedThisMonth = 0;

    const planCounts: Record<string, number> = {};
    const planMrr:    Record<string, number> = {};
    const subs: LsSub[] = [];

    for (const sub of rawSubs) {
      const attrs = sub.attributes as Record<string, unknown>;
      const subItem = (attrs.first_subscription_item as Record<string, unknown> | undefined);
      const variantId = String(subItem?.variant_id ?? '');
      const plan      = VARIANT_TO_PLAN[variantId] ?? 'other';
      const status    = String(attrs.status ?? '');
      const createdAt = String(attrs.created_at ?? '');
      const renewsAt  = attrs.renews_at ? String(attrs.renews_at) : null;
      const cancelAt  = attrs.cancelled ? String(attrs.updated_at ?? '') : null;

      // MRR contribution (only active/trialing)
      const monthlyUsd = PLAN_MONTHLY_USD[plan] ?? 0;
      if (status === 'active') {
        activeCount++;
        mrr += monthlyUsd;
        planCounts[plan] = (planCounts[plan] ?? 0) + 1;
        planMrr[plan]    = (planMrr[plan]    ?? 0) + monthlyUsd;
      } else if (status === 'trialing') {
        trialingCount++;
      } else if (status === 'cancelled' || status === 'expired') {
        cancelledCount++;
      } else if (status === 'paused') {
        pausedCount++;
      }

      // New this month
      if (createdAt && new Date(createdAt) >= monthStart) newThisMonth++;
      // Churned this month (cancelled this month)
      if (attrs.cancelled && attrs.updated_at && new Date(String(attrs.updated_at)) >= monthStart) {
        churnedThisMonth++;
      }

      subs.push({
        id:          String(sub.id),
        email:       String(attrs.user_email  ?? ''),
        name:        String(attrs.user_name   ?? ''),
        plan,
        planLabel:   PLAN_LABEL[plan] ?? plan,
        status,
        mrr:         monthlyUsd,
        createdAt,
        renewsAt,
        cancelledAt: cancelAt,
      });
    }

    // Sort subs newest first
    subs.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));

    // Plan breakdown
    const allPlans = ['exclusive', 'pro', 'starter', 'other'];
    const planBreakdown = allPlans
      .filter(p => (planCounts[p] ?? 0) > 0)
      .map(p => ({
        plan:     p,
        label:    PLAN_LABEL[p],
        count:    planCounts[p] ?? 0,
        mrr:      planMrr[p]   ?? 0,
        color:    PLAN_COLOR[p],
      }));

    // ── Orders (one-time: credit packs) ──────────────────────────────────────

    let orderCount   = 0;
    let orderRevenue = 0;

    for (const order of rawOrders) {
      const attrs  = order.attributes as Record<string, unknown>;
      const status = String(attrs.status ?? '');
      if (status !== 'paid') continue;
      orderCount++;
      // total is in cents
      const total = typeof attrs.total === 'number' ? attrs.total : 0;
      orderRevenue += total / 100;
    }

    const data: RevenueData = {
      mrr,
      arr:              mrr * 12,
      activeCount,
      cancelledCount,
      pausedCount,
      trialingCount,
      newThisMonth,
      churnedThisMonth,
      planBreakdown,
      recentSubs:       subs.slice(0, 20),
      orderCount,
      orderRevenue,
    };

    return NextResponse.json(data);

  } catch (err) {
    console.error('[admin/revenue]', err);
    return NextResponse.json({ error: 'Failed to fetch revenue data' }, { status: 500 });
  }
}
