import { CreditCard, ChevronRight } from "lucide-react";
import Link from "next/link";
import { mockLicense, mockLimits } from "@/lib/mockData";

export const metadata = { title: "Billing — Dashboard" };

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0">
      <span className="text-[12px] text-[#6B7280]">{label}</span>
      <span className="text-[12px] font-medium text-[#D1D5DB]">{value}</span>
    </div>
  );
}

const usageItems = [
  { label: "Monthly renders", used: mockLimits.usedThisCycle, total: mockLimits.monthlyAllowance },
  { label: "Device seats",    used: mockLimits.devicesUsed,   total: mockLimits.deviceLimit },
];

const invoices = [
  { id: "INV-2026-003", date: "Mar 3, 2026",  amount: "$99.00", status: "Paid" },
  { id: "INV-2026-002", date: "Feb 3, 2026",  amount: "$99.00", status: "Paid" },
  { id: "INV-2026-001", date: "Jan 3, 2026",  amount: "$99.00", status: "Paid" },
];

export default function BillingPage() {
  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-[800px]">
      <div className="mb-8">
        <h1 className="text-[28px] font-semibold text-white tracking-tight mb-1.5">Billing</h1>
        <p className="text-[14px] text-[#6B7280]">Plan details, usage, and invoices.</p>
      </div>

      {/* Plan */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#374151] mb-3">Current plan</p>
      <div className="rounded-[12px] border border-[#A3FF12]/[0.14] bg-[#111113] p-5 mb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-[20px] font-semibold text-white">{mockLicense.planName}</p>
            <p className="text-[13px] text-[#6B7280] mt-0.5">Renews {mockLicense.renewalDate}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-full border text-[#A3FF12] border-[#A3FF12]/20 bg-[#A3FF12]/[0.07]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#A3FF12]" />
            Active
          </span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="px-3.5 py-2 rounded-[8px] text-[12px] font-medium border border-white/[0.08] text-[#6B7280] hover:text-white hover:border-white/[0.14] transition-colors">
            Manage subscription
          </button>
          <Link href="/pricing" className="px-3.5 py-2 rounded-[8px] text-[12px] font-medium border border-white/[0.08] text-[#6B7280] hover:text-white hover:border-white/[0.14] transition-colors">
            View all plans <ChevronRight className="inline w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* Usage */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#374151] mb-3 mt-8">Usage this cycle</p>
      <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] p-5 mb-4">
        <div className="space-y-5">
          {usageItems.map((u) => {
            const pct = Math.round((u.used / u.total) * 100);
            return (
              <div key={u.label}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[13px] text-[#9CA3AF]">{u.label}</span>
                  <span className="text-[12px] font-medium text-[#D1D5DB]">{u.used} / {u.total}</span>
                </div>
                <div className="h-[3px] w-full rounded-full bg-white/[0.07] overflow-hidden">
                  <div className="h-full rounded-full bg-[#A3FF12] transition-all" style={{ width: `${pct}%`, opacity: 0.85 }} />
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-[11px] text-[#4B5563]">Credits reset on {mockLimits.resetDate}.</p>
      </div>

      {/* Payment method */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#374151] mb-3 mt-8">Payment method</p>
      <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] p-5 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CreditCard className="w-4 h-4 text-[#4B5563]" />
            <span className="text-[13px] text-[#9CA3AF]">Visa ending in 4242</span>
          </div>
          <button className="text-[12px] text-[#A3FF12] hover:underline underline-offset-2">Update</button>
        </div>
      </div>

      {/* Invoices */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#374151] mb-3 mt-8">Invoice history</p>
      <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] overflow-hidden">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-white/[0.05]">
              {["Invoice", "Date", "Amount", "Status", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-[#374151] uppercase tracking-[0.07em]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {invoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3 font-medium text-[#D1D5DB]">{inv.id}</td>
                <td className="px-4 py-3 text-[#6B7280]">{inv.date}</td>
                <td className="px-4 py-3 text-[#D1D5DB]">{inv.amount}</td>
                <td className="px-4 py-3">
                  <span className="text-[#A3FF12] text-[11px]">{inv.status}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button className="text-[11px] text-[#4B5563] hover:text-[#9CA3AF] transition-colors">Download</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
