import { auth }         from '@clerk/nextjs/server';
import { CreditCard }   from 'lucide-react';
import Link             from 'next/link';
import { db }           from '@/lib/firebaseAdmin';
import { PLAN_LABELS, PLAN_ALLOWANCE } from '@/lib/firestore/users';

export const metadata = { title: 'Billing — Dashboard' };

interface UserDoc {
  plan:             string;
  licenseStatus:    string;
  lsSubscriptionId?: string;
  renewalDate?:     string;
  deviceLimit?:     number;
}

async function getUserDoc(userId: string): Promise<UserDoc | null> {
  const doc = await db.collection('users').doc(userId).get();
  if (!doc.exists) return null;
  return doc.data() as UserDoc;
}

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0">
      <span className="text-[12px] text-[#6B7280]">{label}</span>
      <span className="text-[12px] font-medium text-[#D1D5DB]">{value}</span>
    </div>
  );
}

export default async function BillingPage() {
  const { userId } = await auth();
  const userDoc = userId ? await getUserDoc(userId).catch(() => null) : null;

  const plan          = userDoc?.plan ?? 'starter';
  const planName      = PLAN_LABELS[plan] ?? 'Starter';
  const allowance     = PLAN_ALLOWANCE[plan] ?? 25;
  const licenseStatus = userDoc?.licenseStatus ?? 'inactive';
  const renewalDate   = userDoc?.renewalDate;
  const isActive      = licenseStatus === 'active';

  const upgradedParam = typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('upgraded');

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-[800px]">
      <div className="mb-8">
        <h1 className="text-[28px] font-semibold text-white tracking-tight mb-1.5">Billing</h1>
        <p className="text-[14px] text-[#6B7280]">Plan details, usage, and invoices.</p>
      </div>

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
          {isActive && userDoc?.lsSubscriptionId ? (
            <a
              href={`https://app.lemonsqueezy.com/my-orders`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-[8px] text-[12px] font-medium border border-white/[0.08] text-[#6B7280] hover:text-white hover:border-white/[0.14] transition-colors"
            >
              Manage subscription ↗
            </a>
          ) : null}
          <Link
            href="/#pricing"
            className="px-3.5 py-2 rounded-[8px] text-[12px] font-medium border border-white/[0.08] text-[#6B7280] hover:text-white hover:border-white/[0.14] transition-colors"
          >
            View all plans →
          </Link>
        </div>
      </div>

      {/* Upgrade CTAs */}
      {plan !== 'exclusive' && (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#374151] mb-3 mt-8">Upgrade your plan</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {plan === 'starter' && (
              <Link
                href="/checkout?plan=pro&billing=monthly"
                className="flex flex-col gap-1 p-4 rounded-[12px] border border-white/[0.08] bg-[#111113] hover:border-[#A3FF12]/30 hover:bg-[#A3FF12]/[0.03] transition-all group"
              >
                <span className="text-[14px] font-semibold text-white">Pro — $49/mo</span>
                <span className="text-[12px] text-[#6B7280]">50 renders/mo · Priority support</span>
                <span className="mt-2 text-[12px] text-[#A3FF12] group-hover:underline">Upgrade →</span>
              </Link>
            )}
            <Link
              href="/checkout?plan=exclusive&billing=monthly"
              className="flex flex-col gap-1 p-4 rounded-[12px] border border-white/[0.08] bg-[#111113] hover:border-[#A3FF12]/30 hover:bg-[#A3FF12]/[0.03] transition-all group"
            >
              <span className="text-[14px] font-semibold text-white">Exclusive — $149/mo</span>
              <span className="text-[12px] text-[#6B7280]">100 renders/mo · Studio features</span>
              <span className="mt-2 text-[12px] text-[#A3FF12] group-hover:underline">Upgrade →</span>
            </Link>
          </div>
        </>
      )}

      {/* Usage */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#374151] mb-3 mt-8">Usage this cycle</p>
      <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] p-5 mb-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] text-[#9CA3AF]">Monthly renders</span>
            <span className="text-[12px] font-medium text-[#D1D5DB]">– / {allowance}</span>
          </div>
          <div className="h-[3px] w-full rounded-full bg-white/[0.07] overflow-hidden">
            <div className="h-full rounded-full bg-[#A3FF12] transition-all" style={{ width: '0%', opacity: 0.85 }} />
          </div>
        </div>
        <p className="mt-4 text-[11px] text-[#4B5563]">Credits reset monthly on your billing date.</p>
      </div>

      {/* Payment method */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#374151] mb-3 mt-8">Payment</p>
      <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] p-5 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CreditCard className="w-4 h-4 text-[#4B5563]" />
            <span className="text-[13px] text-[#9CA3AF]">
              {isActive ? 'Managed by Lemon Squeezy' : 'No payment method on file'}
            </span>
          </div>
          {isActive && (
            <a
              href="https://app.lemonsqueezy.com/my-orders"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] text-[#A3FF12] hover:underline underline-offset-2"
            >
              Manage ↗
            </a>
          )}
        </div>
      </div>

      {/* Plans breakdown */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#374151] mb-3 mt-8">Plan limits</p>
      <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] overflow-hidden">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-white/[0.05]">
              {['Plan', 'Renders/mo', 'Price/mo', ''].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-[#374151] uppercase tracking-[0.07em]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {[
              { name: 'Starter',   renders: 25,  price: '$29',  planKey: 'starter'   },
              { name: 'Pro',       renders: 50,  price: '$49',  planKey: 'pro'       },
              { name: 'Exclusive', renders: 100, price: '$149', planKey: 'exclusive' },
            ].map((row) => (
              <tr key={row.name} className={`hover:bg-white/[0.02] transition-colors ${plan === row.planKey ? 'bg-[#A3FF12]/[0.03]' : ''}`}>
                <td className="px-4 py-3 font-medium text-[#D1D5DB]">
                  {row.name}
                  {plan === row.planKey && (
                    <span className="ml-2 text-[10px] text-[#A3FF12] bg-[#A3FF12]/10 px-1.5 py-0.5 rounded-full">Current</span>
                  )}
                </td>
                <td className="px-4 py-3 text-[#6B7280]">{row.renders}</td>
                <td className="px-4 py-3 text-[#D1D5DB]">{row.price}</td>
                <td className="px-4 py-3 text-right">
                  {plan !== row.planKey && (
                    <Link
                      href={`/checkout?plan=${row.planKey}&billing=monthly`}
                      className="text-[11px] text-[#A3FF12] hover:underline underline-offset-2"
                    >
                      {PLAN_ALLOWANCE[row.planKey] > allowance ? 'Upgrade' : 'Switch'}
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
