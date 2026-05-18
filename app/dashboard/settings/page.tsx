import { currentUser } from "@clerk/nextjs";
import { redirect }     from "next/navigation";
import { ShieldAlert, ShieldCheck, Mail, User, Calendar, Smartphone, ExternalLink, Chrome } from "lucide-react";
import { DeleteAccountButton } from "./DeleteAccountButton";

export const metadata = { title: "Settings — Dashboard" };

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

function formatDate(ts: number | Date | null | undefined): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}

function formatDateTime(ts: number | Date | null | undefined): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/");

  const primaryEmail = user.emailAddresses?.find(e => e.id === user.primaryEmailAddressId)
    ?? user.emailAddresses?.[0];

  const googleAccount = user.externalAccounts?.find(a =>
    a.provider === "google" || a.provider === "oauth_google"
  );

  const mfaEnabled = user.twoFactorEnabled ?? false;

  const verifiedEmails = user.emailAddresses?.filter(e =>
    e.verification?.status === "verified"
  ) ?? [];

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-[800px]">
      <div className="mb-8">
        <h1 className="text-[28px] font-semibold text-white tracking-tight mb-1.5">Settings</h1>
        <p className="text-[14px] text-[#6B7280]">Account profile, security, and preferences.</p>
      </div>

      {/* ── Profile ─────────────────────────────────────────────────────────── */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#374151] mb-3">Profile</p>
      <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] p-5 mb-6">
        <div className="flex items-center gap-4 mb-5 pb-4 border-b border-white/[0.04]">
          {/* Avatar */}
          <div className="w-12 h-12 rounded-full bg-[#1a2e12] border border-[#A3FF12]/20 flex items-center justify-center text-[16px] font-bold text-[#A3FF12] flex-shrink-0">
            {((user.firstName?.[0] ?? "") + (user.lastName?.[0] ?? "")).toUpperCase() || primaryEmail?.emailAddress?.[0]?.toUpperCase() || "?"}
          </div>
          <div>
            <p className="text-[15px] font-semibold text-white">
              {[user.firstName, user.lastName].filter(Boolean).join(" ") || "No name set"}
            </p>
            <p className="text-[12px] text-[#4B5563]">{primaryEmail?.emailAddress ?? "—"}</p>
          </div>
          <a
            href="https://accounts.clerk.com/user"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] border border-white/[0.07] text-[11px] text-[#6B7280] hover:text-white hover:border-white/[0.14] transition-colors flex-shrink-0"
          >
            Edit profile <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <div className="space-y-0">
          <DataRow
            label="First name"
            value={user.firstName || <span className="text-[#374151] italic">Not set</span>}
          />
          <DataRow
            label="Last name"
            value={user.lastName || <span className="text-[#374151] italic">Not set</span>}
          />
          <DataRow
            label="Email address"
            value={
              <span className="flex items-center gap-2">
                {primaryEmail?.emailAddress ?? "—"}
                {primaryEmail?.verification?.status === "verified" && (
                  <Badge color="green">Verified</Badge>
                )}
              </span>
            }
          />
          <DataRow
            label="Account created"
            value={formatDate(user.createdAt)}
          />
          <DataRow
            label="User ID"
            value={<span className="font-mono text-[11px] text-[#374151]">{user.id.slice(0, 20)}…</span>}
          />
        </div>
      </div>

      {/* ── Connected accounts ──────────────────────────────────────────────── */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#374151] mb-3">Connected accounts</p>
      <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] p-5 mb-6">
        {googleAccount ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center flex-shrink-0">
              <Chrome className="w-4 h-4 text-[#60A5FA]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-white">Google</p>
              <p className="text-[11px] text-[#4B5563] truncate">{googleAccount.emailAddress}</p>
            </div>
            <Badge color="green">Connected</Badge>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center flex-shrink-0">
              <Mail className="w-4 h-4 text-[#6B7280]" />
            </div>
            <div className="flex-1">
              <p className="text-[13px] font-medium text-white">Email / password</p>
              <p className="text-[11px] text-[#4B5563]">
                {verifiedEmails.length} verified email{verifiedEmails.length !== 1 ? "s" : ""}
              </p>
            </div>
            <Badge color="gray">No OAuth</Badge>
          </div>
        )}
      </div>

      {/* ── Security ────────────────────────────────────────────────────────── */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#374151] mb-3">Security</p>
      <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] p-5 mb-6">
        <div className="space-y-0">
          <DataRow
            label="Two-factor authentication"
            value={
              mfaEnabled
                ? <Badge color="green">Enabled</Badge>
                : <Badge color="yellow">Not enabled</Badge>
            }
          />
          <DataRow
            label="Last sign in"
            value={formatDateTime(user.lastSignInAt)}
          />
          <DataRow
            label="Password"
            value={
              googleAccount
                ? <span className="text-[#374151] italic">Managed by Google</span>
                : <Badge color="gray">Email login</Badge>
            }
          />
        </div>
        <div className="mt-4 pt-4 border-t border-white/[0.04] flex items-center justify-between">
          <p className="text-[11px] text-[#374151]">
            {mfaEnabled
              ? "Your account is protected with two-factor authentication."
              : "Enable 2FA for stronger account security."}
          </p>
          <a
            href="https://accounts.clerk.com/user/security"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] border border-white/[0.07] text-[11px] text-[#6B7280] hover:text-white hover:border-white/[0.14] transition-colors flex-shrink-0"
          >
            {mfaEnabled ? "Manage 2FA" : "Enable 2FA"} <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* ── Danger zone ─────────────────────────────────────────────────────── */}
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
