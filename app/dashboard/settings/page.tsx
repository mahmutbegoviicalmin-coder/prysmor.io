import { currentUser } from "@clerk/nextjs";
import { ShieldAlert } from "lucide-react";
import { mockSecurity } from "@/lib/mockData";

export const metadata = { title: "Settings — Dashboard" };

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0">
      <span className="text-[12px] text-[#6B7280]">{label}</span>
      <span className="text-[12px] font-medium text-[#D1D5DB]">{value}</span>
    </div>
  );
}

export default async function SettingsPage() {
  const user = await currentUser();
  const fields = [
    { label: "First name",    value: user?.firstName ?? "" },
    { label: "Last name",     value: user?.lastName  ?? "" },
    { label: "Email address", value: user?.emailAddresses?.[0]?.emailAddress ?? "" },
  ];

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-[800px]">
      <div className="mb-8">
        <h1 className="text-[28px] font-semibold text-white tracking-tight mb-1.5">Settings</h1>
        <p className="text-[14px] text-[#6B7280]">Account profile, security, and preferences.</p>
      </div>

      {/* Profile */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#374151] mb-3">Profile</p>
      <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] p-5 mb-8">
        <div className="space-y-4">
          {fields.map((f) => (
            <div key={f.label}>
              <label className="block text-[10px] font-semibold text-[#374151] uppercase tracking-[0.08em] mb-1.5">
                {f.label}
              </label>
              <input
                defaultValue={f.value}
                readOnly
                className="w-full rounded-[8px] border border-white/[0.07] bg-[#0D0D0F] px-3.5 py-2.5 text-[13px] text-[#6B7280] outline-none cursor-default"
              />
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11px] text-[#374151]">
          To update your profile, use the account button in the sidebar.
        </p>
      </div>

      {/* Security */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#374151] mb-3">Security</p>
      <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] p-5 mb-8">
        <div className="space-y-0">
          <DataRow label="Two-factor authentication"
            value={
              <span className={mockSecurity.mfaEnabled ? "text-[#A3FF12]" : "text-[#F59E0B]"}>
                {mockSecurity.mfaEnabled ? "Enabled" : "Not enabled"}
              </span>
            }
          />
          <DataRow label="Last sign in"       value={mockSecurity.lastLoginAt} />
          <DataRow label="Active sessions"    value={`${mockSecurity.activeSessions} session`} />
        </div>
        <p className="mt-4 text-[11px] text-[#374151]">
          Manage two-factor authentication and active sessions from the Clerk account portal.
        </p>
      </div>

      {/* Danger */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#374151] mb-3">Danger zone</p>
      <div className="rounded-[12px] border border-red-500/[0.12] bg-red-500/[0.03] p-5">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-4 h-4 text-red-500/70 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-[13px] font-medium text-[#D1D5DB] mb-1">Delete account</p>
            <p className="text-[12px] text-[#6B7280] mb-4">
              Permanently delete your Prysmor account. This will cancel your subscription and remove all associated data. This action cannot be undone.
            </p>
            <button className="px-3.5 py-2 rounded-[8px] text-[12px] font-medium border border-red-500/20 text-red-400/80 hover:bg-red-500/10 transition-colors">
              Delete account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
