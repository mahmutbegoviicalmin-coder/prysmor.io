import { auth }        from '@clerk/nextjs/server';
import { CreditCard, CheckCircle2, AlertTriangle, XCircle }  from 'lucide-react';
import Link            from 'next/link';
import { db }          from '@/lib/firebaseAdmin';
import { PLAN_LABELS, PLAN_CREDITS } from '@/lib/firestore/users';
import { getCustomerPortalUrl } from '@/lib/lemonsqueezy';
import { TopUpButton } from './TopUpButton';

export const dynamic  = 'force-dynamic';
export const metadata = { title: 'Billing — Dashboard' };

/** Formats any date value: ISO string, Firestore .NET-style, or already-formatted string. */
function formatDateDisplay(value: string | undefined | null): string | null {
  if (!value) return null;
  // Already human-readable (e.g. "May 7, 2026") — contains no 'T' ISO separator
  if (!value.includes('T') && !value.match(/^\d{4}-\d{2}-\d{2}$/)) return value;
  try {
    // Normalize .NET 7-digit fractional seconds
    const normalized = value.replace(/\.(\d{7})Z$/, (_, f) => `.${f.slice(0, 3)}Z`);
    const d = new Date(normalized);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } catch {
    return value;
  }
}

interface UserDoc {
  plan:              string;
  licenseStatus:     string;
  lsSubscriptionId?: string;
  renewalDate?:      string;
  deviceLimit?:      number;
  credits?:          number;
  creditsTotal?:     number;
}

async function getUserDoc(userId: string): Promise<UserDoc | null> {
  const doc = await db.collection('users').doc(userId).get();
  if (!doc.exists) return null;
  return doc.data() as UserDoc;
}

function CreditsBar({ credits, total }: { credits: number; total: number }) {
  const pct = total > 0 ? Math.min(Math.round((credits / total) * 100), 100) : 0;
  const low = pct < 20;
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] text-[#9CA3AF]">Credits remaining</span>
        <span className={`text-[12px] font-semibold ${low ? 'text-orange-400' : 'text-[#D1D5DB]'}`}>
          {credits.toLocaleString()} / {total.toLocaleString()}
        </span>
      </div>
      <div className="h-[4px] w-full rounded-full bg-white/[0.07] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${low ? 'bg-orange-400' : 'bg-[#A3FF12]'}`}
          style={{ width: `${pct}%`, opacity: 0.9 }}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-[#4B5563]">
        {credits} credits ≈ {Math.floor(credits / 4)}s of AI VFX remaining
      </p>
    </div>
  );
}

interface PageProps {
  searchParams: { upgraded?: string; error?: string; topup?: string };
}

export default async function BillingPage({ searchParams }: PageProps) {
  const { userId } = await auth();
  const userDoc = userId ? await getUserDoc(userId).catch(() => null) : null;

  const plan          = userDoc?.plan          ?? 'starter';
  const planCap       = PLAN_CREDITS[plan]     ?? 1000;
  const licenseStatus = userDoc?.licenseStatus ?? 'inactive';
  const renewalDate   = formatDateDisplay(userDoc?.renewalDate);
  const isActive      = licenseStatus === 'active';
  // Show "No Plan" until user actually purchases — stored plan is "starter" by default
  const planName      = isActive ? (PLAN_LABELS[plan] ?? 'Starter') : 'No Plan';

  // Default to 0 — never show phantom credits to unsubscribed users
  const credits      = typeof userDoc?.credits      === 'number' ? userDoc.credits      : 0;
  const creditsTotal = typeof userDoc?.creditsTotal === 'number' ? userDoc.creditsTotal : 0;

  // Resolve Lemon Squeezy customer portal URL
  const portalUrl = userDoc?.lsSubscriptionId
    ? await getCustomerPortalUrl(userDoc.lsSubscriptionId).catch(() => null)
    : null;

  const showUpgraded = searchParams.upgraded === 'true';
  const showTopUp    = searchParams.topup    === 'true';
  const showError    = searchParams.error;

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-[800px]">
      <div className="mb-8">
        <h1 className="text-[28px] font-semibold text-white tracking-tight mb-1.5">Billing</h1>
        <p className="text-[14px] text-[#6B7280]">Plan details, credits, and usage.</p>
      </div>

      {/* ── Success banner (plan upgrade) ── */}
      {showUpgraded && (
        <div className="mb-6 flex items-start gap-3 rounded-[10px] border border-[#A3FF12]/20 bg-[#A3FF12]/[0.06] px-4 py-3">
          <CheckCircle2 className="w-4 h-4 text-[#A3FF12] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-[#A3FF12]">Payment received — thank you!</p>
            <p className="text-[12px] text-[#6B7280] mt-0.5">
              Your plan is being activated. If it doesn&apos;t appear as active within 30 seconds,{' '}
              <a href="/dashboard/billing" className="underline underline-offset-2 hover:text-white transition-colors">
                refresh this page
              </a>.
            </p>
          </div>
        </div>
      )}

      {/* ── Success banner (credit top-up) ── */}
      {showTopUp && (
        <div className="mb-6 flex items-start gap-3 rounded-[10px] border border-[#A3FF12]/20 bg-[#A3FF12]/[0.06] px-4 py-3">
          <CheckCircle2 className="w-4 h-4 text-[#A3FF12] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-[#A3FF12]">Credits added — thank you!</p>
            <p className="text-[12px] text-[#6B7280] mt-0.5">
              Your credits are being added. If your balance doesn&apos;t update within 30 seconds,{' '}
              <a href="/dashboard/billing" className="underline underline-offset-2 hover:text-white transition-colors">
                refresh this page
              </a>.
            </p>
          </div>
        </div>
      )}

      {/* ── Error banner ── */}
      {showError === 'checkout_failed' && (
        <div className="mb-6 flex items-start gap-3 rounded-[10px] border border-[#F87171]/20 bg-[#F87171]/[0.06] px-4 py-3">
          <XCircle className="w-4 h-4 text-[#F87171] flex-shrink-0 mt-0.5" />
          <p className="text-[13px] text-[#F87171]">
            Checkout failed. Please try again or contact support.
          </p>
        </div>
      )}

      {/* ── Inactive subscription warning ── */}
      {!isActive && (
        <div className="mb-6 flex items-start gap-3 rounded-[10px] border border-[#F59E0B]/20 bg-[#F59E0B]/[0.06] px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-[#F59E0B] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-[#F59E0B]">Subscription inactive</p>
            <p className="text-[12px] text-[#6B7280] mt-0.5">
              VFX generation is disabled. Renew your plan to restore access.
            </p>
          </div>
        </div>
      )}

      {/* Current plan */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#374151] mb-3">Current plan</p>
      <div className="rounded-[12px] border border-[#A3FF12]/[0.14] bg-[#111113] p-5 mb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-[20px] font-semibold text-white">{planName}</p>
            {renewalDate ? (
              <p className="text-[13px] text-[#6B7280] mt-0.5">Renews {renewalDate}</p>
            ) : (
              <p className="text-[13px] text-[#6B7280] mt-0.5">
                {isActive ? 'Active subscription' : 'No active subscription'}
              </p>
            )}
          </div>
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${
            isActive
              ? 'text-[#A3FF12] border-[#A3FF12]/20 bg-[#A3FF12]/[0.07]'
              : 'text-[#6B7280] border-white/[0.08] bg-white/[0.03]'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-[#A3FF12]' : 'bg-[#4B5563]'}`} />
            {isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {portalUrl ? (
            <a
              href={portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-[8px] text-[12px] font-medium border border-white/[0.08] text-[#6B7280] hover:text-white hover:border-white/[0.14] transition-colors"
            >
              Manage subscription ↗
            </a>
          ) : !isActive ? (
            <Link
              href="/#pricing"
              className="px-3.5 py-2 rounded-[8px] text-[12px] font-semibold bg-[#A3FF12] text-[#050505] hover:bg-[#B6FF3C] transition-colors"
            >
              Subscribe now →
            </Link>
          ) : null}
          <Link
            href="/#pricing"
            className="px-3.5 py-2 rounded-[8px] text-[12px] font-medium border border-white/[0.08] text-[#6B7280] hover:text-white hover:border-white/[0.14] transition-colors"
          >
            View all plans →
          </Link>
        </div>
      </div>

      {/* Credits */}
      <div className="flex items-center justify-between mt-8 mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#374151]">Credits</p>
        {isActive && <TopUpButton />}
      </div>
      <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] p-5 mb-4">
        <CreditsBar credits={credits} total={creditsTotal} />
        <div className="mt-4 pt-4 border-t border-white/[0.05] text-[12px] text-[#4B5563]">
          1 second of AI VFX = 4 credits · Credits reset on each billing date
        </div>
      </div>

      {/* Upgrade CTAs — only for active subscribers not yet on Exclusive */}
      {isActive && plan !== 'exclusive' && (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#374151] mb-3 mt-8">Upgrade for more credits</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {plan === 'starter' && (
              <Link
                href="/checkout?plan=pro&billing=monthly"
                className="flex flex-col gap-1 p-4 rounded-[12px] border border-white/[0.08] bg-[#111113] hover:border-[#A3FF12]/30 hover:bg-[#A3FF12]/[0.03] transition-all group"
              >
                <span className="text-[14px] font-semibold text-white">Pro — $49/mo</span>
                <span className="text-[12px] text-[#6B7280]">2 000 credits · 500s of AI VFX</span>
                <span className="mt-2 text-[12px] text-[#A3FF12] group-hover:underline">Upgrade →</span>
              </Link>
            )}
            <Link
              href="/checkout?plan=exclusive&billing=monthly"
              className="flex flex-col gap-1 p-4 rounded-[12px] border border-white/[0.08] bg-[#111113] hover:border-[#A3FF12]/30 hover:bg-[#A3FF12]/[0.03] transition-all group"
            >
              <span className="text-[14px] font-semibold text-white">Exclusive — $149/mo</span>
              <span className="text-[12px] text-[#6B7280]">4 000 credits · 1 000s of AI VFX</span>
              <span className="mt-2 text-[12px] text-[#A3FF12] group-hover:underline">Upgrade →</span>
            </Link>
          </div>
        </>
      )}

      {/* Plan comparison */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#374151] mb-3 mt-8">Plan comparison</p>
      <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] overflow-hidden">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-white/[0.05]">
              {['Plan', 'Credits/mo', 'AI VFX time', 'Price/mo', ''].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-[#374151] uppercase tracking-[0.07em]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {[
              { name: 'Starter',   credits: 1000, seconds: '250s',  price: '$29',  planKey: 'starter'   },
              { name: 'Pro',       credits: 2000, seconds: '500s',  price: '$49',  planKey: 'pro'       },
              { name: 'Exclusive', credits: 4000, seconds: '1000s', price: '$149', planKey: 'exclusive' },
            ].map((row) => (
              <tr key={row.name} className={`hover:bg-white/[0.02] transition-colors ${plan === row.planKey ? 'bg-[#A3FF12]/[0.03]' : ''}`}>
                <td className="px-4 py-3 font-medium text-[#D1D5DB]">
                  {row.name}
                  {plan === row.planKey && (
                    <span className="ml-2 text-[10px] text-[#A3FF12] bg-[#A3FF12]/10 px-1.5 py-0.5 rounded-full">Current</span>
                  )}
                </td>
                <td className="px-4 py-3 text-[#9CA3AF]">{row.credits.toLocaleString()}</td>
                <td className="px-4 py-3 text-[#9CA3AF]">{row.seconds}</td>
                <td className="px-4 py-3 text-[#D1D5DB]">{row.price}</td>
                <td className="px-4 py-3 text-right">
                  {(!isActive || plan !== row.planKey) && (
                    <Link
                      href={`/checkout?plan=${row.planKey}&billing=monthly`}
                      className="text-[11px] text-[#A3FF12] hover:underline underline-offset-2"
                    >
                      {!isActive
                        ? 'Subscribe'
                        : PLAN_CREDITS[row.planKey] > planCap
                        ? 'Upgrade'
                        : 'Switch'}
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Payment */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#374151] mb-3 mt-8">Payment</p>
      <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CreditCard className="w-4 h-4 text-[#4B5563]" />
            <span className="text-[13px] text-[#9CA3AF]">
              {isActive ? 'Managed by Lemon Squeezy' : 'No active subscription'}
            </span>
          </div>
          {portalUrl && (
            <a
              href={portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] text-[#A3FF12] hover:underline underline-offset-2"
            >
              Manage ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
