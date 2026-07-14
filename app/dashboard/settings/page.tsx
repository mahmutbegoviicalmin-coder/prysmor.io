import { getSessionUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { ShieldAlert, Mail } from "lucide-react";
import { DeleteAccountButton } from "./DeleteAccountButton";
import { MarketingPreferences } from "@/components/settings/MarketingPreferences";
import { getUser } from "@/lib/firestore/users";

export const metadata = { title: "Settings | Dashboard" };

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0">
      <span className="text-[12px] text-[#6B7280]">{label}</span>
      <span className="text-[12px] font-medium text-[#D1D5DB]">{value}</span>
    </div>
  );
}

function Badge({ children, color = "gray" }: { children: React.ReactNode; color?: "green" | "yellow" | "gray" | "blue" }) {
  const styles = {
    green:  "text-[#A3FF12] bg-[#A3FF12]/[0.08] border-[#A3FF12]/20",
    yellow: "text-[#F59E0B] bg-amber-500/[0.08] border-amber-500/20",
    blue:   "text-[#60A5FA] bg-blue-500/[0.08] border-blue-500/20",
    gray:   "text-[#6B7280] bg-white/[0.03] border-white/[0.06]",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${styles[color]}`}>
      {children}
    </span>
  );
}

function formatDate(ts: Date | { toDate?: () => Date } | null | undefined): string {
  if (!ts) return "-";
  try {
    const d = typeof (ts as { toDate?: () => Date }).toDate === "function"
      ? (ts as { toDate: () => Date }).toDate()
      : new Date(ts as Date);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "-";
  }
}

export default async function SettingsPage() {
  const session = await getSessionUser();
  if (!session) redirect("/sign-in");

  const userDoc = await getUser(session.userId).catch(() => null);
  const displayName = (userDoc as { displayName?: string; firstName?: string } | null)?.displayName
    || (userDoc as { firstName?: string } | null)?.firstName
    || session.email.split("@")[0]
    || "Account";
  const initial = (displayName[0] || session.email[0] || "?").toUpperCase();

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-[800px]">
      <div className="mb-8">
        <h1 className="text-[28px] font-semibold text-white tracking-tight mb-1.5">Settings</h1>
        <p className="text-[14px] text-[#6B7280]">Account profile, security, and preferences.</p>
      </div>

      <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#374151] mb-3">Profile</p>
      <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] p-5 mb-6">
        <div className="flex items-center gap-4 mb-5 pb-4 border-b border-white/[0.04]">
          <div className="w-12 h-12 rounded-full bg-[#1a2e12] border border-[#A3FF12]/20 flex items-center justify-center text-[16px] font-bold text-[#A3FF12] flex-shrink-0">
            {initial}
          </div>
          <div>
            <p className="text-[15px] font-semibold text-white">{displayName}</p>
            <p className="text-[12px] text-[#4B5563]">{session.email}</p>
          </div>
        </div>
        <div className="space-y-0">
          <DataRow label="Email address" value={
            <span className="flex items-center gap-2">
              {session.email}
              <Badge color="green">Signed in</Badge>
            </span>
          } />
          <DataRow
            label="Account created"
            value={formatDate(userDoc?.createdAt)}
          />
          <DataRow
            label="User ID"
            value={<span className="font-mono text-[11px] text-[#374151]">{session.userId.slice(0, 20)}…</span>}
          />
        </div>
      </div>

      <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#374151] mb-3">Sign-in method</p>
      <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] p-5 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center flex-shrink-0">
            <Mail className="w-4 h-4 text-[#6B7280]" />
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-medium text-white">Magic link</p>
            <p className="text-[11px] text-[#4B5563]">Email + password sign-in</p>
          </div>
          <Badge color="green">Active</Badge>
        </div>
      </div>

      <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#374151] mb-3">Email preferences</p>
      <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] p-5 mb-6">
        <MarketingPreferences />
      </div>

      <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#374151] mb-3">Security</p>
      <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] p-5 mb-6">
        <div className="space-y-0">
          <DataRow
            label="Authentication"
            value={<Badge color="gray">Magic link session</Badge>}
          />
          <DataRow
            label="Session"
            value={<Badge color="green">Active</Badge>}
          />
        </div>
        <p className="mt-4 text-[11px] text-[#374151]">
          Use Sign out from the dashboard to end this session on this device.
        </p>
      </div>

      <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#374151] mb-3">Danger zone</p>
      <div className="rounded-[12px] border border-red-500/[0.12] bg-red-500/[0.03] p-5">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-4 h-4 text-red-500/70 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-[13px] font-medium text-[#D1D5DB] mb-1">Delete account</p>
            <p className="text-[12px] text-[#6B7280] mb-4">
              Permanently delete your Prysmor account, cancel your subscription, and remove all associated data. This action cannot be undone.
            </p>
            <DeleteAccountButton />
          </div>
        </div>
      </div>
    </div>
  );
}
