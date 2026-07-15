import { getSessionUser } from '@/lib/auth/session';
import { CreditCard, CheckCircle2, AlertTriangle, XCircle }  from 'lucide-react';
import Link            from 'next/link';
import { db }          from '@/lib/firebaseAdmin';
import { PLAN_LABELS } from '@/lib/firestore/users';
import { getCustomerPortalUrl } from '@/lib/lemonsqueezy';
import { TopUpButton } from './TopUpButton';

export const dynamic  = 'force-dynamic';
export const metadata = { title: 'Billing | Dashboard' };

/** Formats any date value: ISO string, Firestore .NET-style, or already-formatted string. */
function formatDateDisplay(value: string | undefined | null): string | null {
  if (!value) return null;
  // Already human-readable (e.g. "May 7, 2026"), contains no 'T' ISO separator
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
          className={`h-full rounded-full transition-all duration-500 ${low ? 'bg-orange-400' : 'bg-[#39FF6A]'}`}
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
  const session = await getSessionUser();
  const userId = session?.userId ?? null;
  const userDoc = userId ? await getUserDoc(userId).catch(() => null) : null;

  const plan          = userDoc?.plan          ?? 'unpaid';
  const licenseStatus = userDoc?.licenseStatus ?? 'inactive';
  const renewalDate   = formatDateDisplay(userDoc?.renewalDate);
  const isActive      = licenseStatus === 'active';
  const isLifetime    = plan === 'lifetime';
  const isLegacySub   = Boolean(userDoc?.lsSubscriptionId);
  // Show "No Plan" until user actually purchases
  const planName      = isActive
    ? (isLifetime ? 'Lifetime' : (PLAN_LABELS[plan] ?? plan))
    : 'No Plan';

  // Default to 0, never show phantom credits to unlicensed users
  const credits      = typeof userDoc?.credits      === 'number' ? userDoc.credits      : 0;
  const creditsTotal = typeof userDoc?.creditsTotal === 'number' ? userDoc.creditsTotal : 0;

  // Lemon Squeezy customer portal — legacy subscribers only
  const portalUrl = isLegacySub
    ? await getCustomerPortalUrl(userDoc!.lsSubscriptionId!).catch(() => null)
    : null;

  const showUpgraded = searchParams.upgraded === 'true';
  const showTopUp    = searchParams.topup    === 'true';
  const showError    = searchParams.error;

  const planSubtitle = (() => {
    if (!isActive) return 'No active license';
    if (isLifetime) return 'Never expires · Premiere + After Effects';
    if (renewalDate) return `Renews ${renewalDate}`;
    return 'Active subscription';
  })();

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-[800px]">
      <div className="mb-8">
        <h1 className="text-[28px] font-semibold text-white tracking-tight mb-1.5">Billing</h1>
        <p className="text-[14px] text-[#6B7280]">License, credits, and usage.</p>
      </div>

      {/* ── Success banner (plan upgrade) ── */}
      {showUpgraded && (
        <div className="mb-6 flex items-start gap-3 rounded-[10px] border border-[#39FF6A]/20 bg-[#39FF6A]/[0.06] px-4 py-3">
          <CheckCircle2 className="w-4 h-4 text-[#39FF6A] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-[#39FF6A]">Payment received. Thank you!</p>
            <p className="text-[12px] text-[#6B7280] mt-0.5">
              Your license is being activated. If it doesn&apos;t appear as active within 30 seconds,{' '}
              <a href="/dashboard/billing" className="underline underline-offset-2 hover:text-white transition-colors">
                refresh this page
              </a>.
            </p>
          </div>
        </div>
      )}

      {/* ── Success banner (credit top-up) ── */}
      {showTopUp && (
        <div className="mb-6 flex items-start gap-3 rounded-[10px] border border-[#39FF6A]/20 bg-[#39FF6A]/[0.06] px-4 py-3">
          <CheckCircle2 className="w-4 h-4 text-[#39FF6A] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-[#39FF6A]">Credits added. Thank you!</p>
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

      {/* ── Inactive warning ── */}
      {!isActive && (
        <div className="mb-6 flex items-start gap-3 rounded-[10px] border border-[#F59E0B]/20 bg-[#F59E0B]/[0.06] px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-[#F59E0B] flex-shrink-0 mt-0.5" />
          <div>
            {isLegacySub ? (
              <>
                <p className="text-[13px] font-semibold text-[#F59E0B]">Subscription inactive</p>
                <p className="text-[12px] text-[#6B7280] mt-0.5">
                  VFX generation is disabled. Reactivate via Lemon Squeezy, or buy a lifetime license.
                </p>
              </>
            ) : (
              <>
                <p className="text-[13px] font-semibold text-[#F59E0B]">No active license</p>
                <p className="text-[12px] text-[#6B7280] mt-0.5">
                  Buy Prysmor to unlock VFX generation and the Premiere + After Effects panels.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Current plan */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#333] mb-3">Current plan</p>
      <div className="rounded-[12px] border border-[#39FF6A]/[0.14] bg-[#0c0c0c] p-5 mb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-[20px] font-semibold text-white">{planName}</p>
            <p className="text-[13px] text-[#6B7280] mt-0.5">{planSubtitle}</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${
            isActive
              ? 'text-[#39FF6A] border-[#39FF6A]/20 bg-[#39FF6A]/[0.07]'
              : 'text-[#6B7280] border-white/[0.08] bg-white/[0.03]'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-[#39FF6A]' : 'bg-[#4B5563]'}`} />
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
          ) : null}
          {!isActive ? (
            <Link
              href="/checkout"
              className="px-3.5 py-2 rounded-[8px] text-[12px] font-semibold bg-[#39FF6A] text-[#050505] hover:bg-[#4fff7e] transition-colors"
            >
              Buy Prysmor →
            </Link>
          ) : null}
          {isActive && (
            <Link
              href="/#pricing"
              className="px-3.5 py-2 rounded-[8px] text-[12px] font-medium border border-white/[0.08] text-[#6B7280] hover:text-white hover:border-white/[0.14] transition-colors"
            >
              View pricing →
            </Link>
          )}
        </div>
      </div>

      {/* Credits */}
      <div className="flex items-center justify-between mt-8 mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#333]">Credits</p>
        {isActive && <TopUpButton />}
      </div>
      <div className="rounded-[12px] border border-[#161616] bg-[#0c0c0c] p-5 mb-4">
        <CreditsBar credits={credits} total={creditsTotal} />
        <div className="mt-4 pt-4 border-t border-[#111] text-[12px] text-[#4B5563]">
          1 second of AI VFX = 4 credits
          {isLifetime
            ? ' · 200 seconds included · Never expires. Buy more credits anytime'
            : isLegacySub
              ? ' · Credits reset on each billing date'
              : ''}
        </div>
      </div>

      {/* License CTA for inactive users */}
      {!isActive && (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#333] mb-3 mt-8">Get Prysmor</p>
          <Link
            href="/checkout"
            className="flex flex-col gap-1 p-5 rounded-[12px] border border-[#39FF6A]/25 bg-[#39FF6A]/[0.04] hover:border-[#39FF6A]/40 transition-all group"
          >
            <div className="flex items-baseline gap-2">
              <span className="text-[14px] text-[#6B7280] line-through">$199</span>
              <span className="text-[18px] font-semibold text-white">$99</span>
              <span className="text-[12px] text-[#6B7280]">one-time</span>
            </div>
            <span className="text-[12px] text-[#6B7280]">
              Lifetime license · Never expires · 200 seconds of AI VFX · Premiere + After Effects
            </span>
            <span className="mt-2 text-[12px] text-[#39FF6A] group-hover:underline">Buy Prysmor →</span>
          </Link>
        </>
      )}

      {/* Payment */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#333] mb-3 mt-8">Payment</p>
      <div className="rounded-[12px] border border-[#161616] bg-[#0c0c0c] p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CreditCard className="w-4 h-4 text-[#4B5563]" />
            <span className="text-[13px] text-[#9CA3AF]">
              {isActive ? 'Managed by Lemon Squeezy' : 'No active license'}
            </span>
          </div>
          {portalUrl && (
            <a
              href={portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] text-[#39FF6A] hover:underline underline-offset-2"
            >
              Manage ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
