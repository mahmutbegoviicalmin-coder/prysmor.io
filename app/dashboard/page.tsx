import { currentUser } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2, WifiOff, Wifi, ShieldCheck, ShieldAlert,
  ChevronRight, Clock, Download,
} from "lucide-react";
import { getDashboardData } from "@/lib/firestore/dashboard";

export const metadata = { title: "Overview — Dashboard" };

/* ─── primitives ─── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#374151] mb-3">
      {children}
    </p>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[12px] border border-white/[0.07] bg-[#111113] p-5 ${className}`}>
      {children}
    </div>
  );
}

function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${
      active
        ? "text-[#A3FF12] border-[#A3FF12]/20 bg-[#A3FF12]/[0.07]"
        : "text-[#6B7280] border-white/[0.08] bg-white/[0.03]"
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-[#A3FF12]" : "bg-[#4B5563]"}`} />
      {label}
    </span>
  );
}

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0">
      <span className="text-[12px] text-[#6B7280]">{label}</span>
      <span className="text-[12px] font-medium text-[#D1D5DB]">{value}</span>
    </div>
  );
}

/* ─── page ─── */
export default async function DashboardOverviewPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const data = await getDashboardData(user.id, user);
  const { license, panel, limits, security, activity } = data;
  const pct = Math.min(100, Math.round((limits.usedThisCycle / limits.monthlyAllowance) * 100));

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-[1100px]">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[28px] sm:text-[34px] font-semibold text-white tracking-tight leading-tight mb-1.5">
          Account Overview
        </h1>
        <p className="text-[14px] text-[#6B7280] leading-relaxed">
          Manage your license, panel access, devices, and billing.
        </p>
      </div>

      {/* ── Download Panel Banner ── */}
      <Link
        href="/dashboard/downloads"
        className="group mb-8 flex items-center justify-between rounded-[12px] border border-[#A3FF12]/15 bg-[#A3FF12]/[0.04] px-5 py-4 hover:border-[#A3FF12]/25 hover:bg-[#A3FF12]/[0.06] transition-all"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 w-8 h-8 rounded-[8px] bg-[#A3FF12]/10 border border-[#A3FF12]/20 flex items-center justify-center flex-shrink-0">
            <Download className="w-4 h-4 text-[#A3FF12]" />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-white mb-0.5">
              Premiere Pro Panel — Demo Ready
            </p>
            <p className="text-[12px] text-[#6B7280]">
              Download the CEP extension for Windows or macOS and test locally. No API key required.
            </p>
          </div>
        </div>
        <div className="flex-shrink-0 ml-4 flex items-center gap-1.5 px-3.5 py-2 rounded-[8px] bg-[#A3FF12] text-[#050505] text-[12px] font-bold group-hover:bg-[#B6FF3C] transition-colors whitespace-nowrap">
          Download Panel
          <ChevronRight className="w-3.5 h-3.5" />
        </div>
      </Link>

      {/* ── Primary row ── */}
      <SectionLabel>Status</SectionLabel>
      <div className="grid lg:grid-cols-3 gap-4 mb-8">

        {/* License */}
        <Card>
          <div className="flex items-start justify-between mb-4">
            <p className="text-[13px] font-medium text-[#9CA3AF]">License</p>
            <StatusPill active={license.status === "active"} label={license.status === "active" ? "Active" : "Inactive"} />
          </div>
          <p className="text-[20px] font-semibold text-white mb-4">{license.planName}</p>
          <div className="space-y-0">
            <DataRow label="Renewal date" value={license.renewalDate} />
            <DataRow label="Last verified"
              value={
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-[#A3FF12]" />
                  {license.lastVerifiedAt}
                </span>
              }
            />
          </div>
          <Link href="/dashboard/billing"
            className="mt-4 inline-flex items-center gap-1 text-[12px] text-[#A3FF12] hover:underline underline-offset-2">
            View billing <ChevronRight className="w-3 h-3" />
          </Link>
        </Card>

        {/* Panel */}
        <Card>
          <div className="flex items-start justify-between mb-4">
            <p className="text-[13px] font-medium text-[#9CA3AF]">Premiere Panel</p>
            {panel.connected
              ? <StatusPill active label="Connected" />
              : <StatusPill active={false} label="Not connected" />
            }
          </div>
          <div className="flex items-center gap-2 mb-4">
            {panel.connected
              ? <Wifi className="w-4 h-4 text-[#A3FF12] flex-shrink-0" />
              : <WifiOff className="w-4 h-4 text-[#4B5563] flex-shrink-0" />
            }
            <p className="text-[14px] font-medium text-white truncate">{panel.deviceName}</p>
          </div>
          <div className="space-y-0">
            <DataRow label="Host app"     value={panel.hostApp !== "—" ? `${panel.hostApp} ${panel.hostAppVersion}`.trim() : "—"} />
            <DataRow label="Platform"     value={panel.platform} />
            <DataRow label="CEP version"  value={panel.cepVersion} />
            <DataRow label="First connected" value={panel.firstConnectedAt} />
            <DataRow label="Last active"  value={panel.lastActiveAt} />
          </div>
          <Link href="/dashboard/plugin"
            className="mt-4 inline-flex items-center justify-center w-full gap-2 px-4 py-2 rounded-[8px] bg-[#A3FF12] text-[#050505] text-[12px] font-semibold hover:bg-[#B6FF3C] transition-colors">
            {panel.connected ? "Manage Panel" : "Install Panel"}
          </Link>
        </Card>

        {/* Usage */}
        <Card>
          <div className="flex items-start justify-between mb-4">
            <p className="text-[13px] font-medium text-[#9CA3AF]">Usage &amp; Limits</p>
            <span className="text-[11px] text-[#6B7280]">This cycle</span>
          </div>
          <div className="mb-4">
            <div className="flex items-end justify-between mb-2">
              <p className="text-[28px] font-semibold text-white leading-none">
                {limits.usedThisCycle}
                <span className="text-[16px] font-normal text-[#4B5563] ml-1">
                  / {limits.monthlyAllowance}
                </span>
              </p>
              <span className="text-[12px] text-[#6B7280]">{pct}%</span>
            </div>
            <div className="h-[3px] w-full rounded-full bg-white/[0.07] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#A3FF12] transition-all"
                style={{ width: `${pct}%`, opacity: 0.85 }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-[#4B5563]">Monthly renders</p>
          </div>
          <div className="space-y-0">
            <DataRow label="Device seats" value={`${limits.devicesUsed} / ${limits.deviceLimit}`} />
            <DataRow label="Resets on" value={limits.resetDate} />
          </div>
        </Card>
      </div>

      {/* ── Secondary row ── */}
      <SectionLabel>Security &amp; Activity</SectionLabel>
      <div className="grid lg:grid-cols-2 gap-4 mb-8">

        {/* Security */}
        <Card>
          <p className="text-[13px] font-medium text-[#9CA3AF] mb-4">Security</p>
          <div className="flex items-center gap-3 mb-4 p-3 rounded-[8px] border border-white/[0.05] bg-white/[0.02]">
            {security.mfaEnabled
              ? <ShieldCheck className="w-5 h-5 text-[#A3FF12] flex-shrink-0" />
              : <ShieldAlert className="w-5 h-5 text-[#F59E0B] flex-shrink-0" />
            }
            <div>
              <p className="text-[13px] font-medium text-white">
                {security.mfaEnabled ? "Two-factor authentication enabled" : "Two-factor authentication disabled"}
              </p>
              <p className="text-[11px] text-[#6B7280] mt-0.5">
                {security.mfaEnabled
                  ? "Your account has an extra layer of protection."
                  : "Enable 2FA to secure your account."}
              </p>
            </div>
          </div>
          <div className="space-y-0">
            <DataRow label="Last sign in" value={security.lastLoginAt} />
            <DataRow label="Active sessions" value={`${security.activeSessions} session`} />
          </div>
          <Link href="/dashboard/settings"
            className="mt-4 inline-flex items-center gap-1 text-[12px] text-[#6B7280] hover:text-white transition-colors">
            Manage settings <ChevronRight className="w-3 h-3" />
          </Link>
        </Card>

        {/* Activity */}
        <Card>
          <p className="text-[13px] font-medium text-[#9CA3AF] mb-4">Recent activity</p>
          {activity.length === 0 ? (
            <p className="text-[13px] text-[#4B5563] py-4 text-center">No activity yet</p>
          ) : (
            <ul className="space-y-0 divide-y divide-white/[0.04]">
              {activity.map((item, i) => (
                <li key={i} className="flex items-start justify-between py-2.5">
                  <div>
                    <p className="text-[13px] font-medium text-[#D1D5DB]">{item.title}</p>
                    <p className="text-[11px] text-[#4B5563] mt-0.5">{item.detail}</p>
                  </div>
                  <span className="flex items-center gap-1 text-[11px] text-[#4B5563] whitespace-nowrap ml-4 mt-0.5 flex-shrink-0">
                    <Clock className="w-3 h-3" />
                    {item.timestamp}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ── All registered devices ── */}
      {panel.allDevices.length > 0 && (
        <>
          <SectionLabel>Registered devices</SectionLabel>
          <div className="grid gap-3 mb-8">
            {panel.allDevices.map((device) => (
              <div key={device.id}
                className="flex items-center justify-between rounded-[12px] border border-white/[0.07] bg-[#111113] px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-[8px] flex-shrink-0 flex items-center justify-center border ${
                    device.connected
                      ? "bg-[#A3FF12]/[0.08] border-[#A3FF12]/20"
                      : "bg-white/[0.03] border-white/[0.07]"
                  }`}>
                    {device.connected
                      ? <Wifi className="w-4 h-4 text-[#A3FF12]" />
                      : <WifiOff className="w-4 h-4 text-[#4B5563]" />
                    }
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-white truncate">{device.name}</p>
                    <p className="text-[11px] text-[#4B5563] mt-0.5 truncate">
                      {device.hostApp !== "—" ? `${device.hostApp} ${device.hostAppVersion} · `.trimEnd() : ""}
                      {device.platform}
                      {device.cepVersion !== "—" ? ` · CEP ${device.cepVersion}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex-shrink-0 ml-4 text-right">
                  <StatusPill active={device.connected} label={device.connected ? "Online" : "Offline"} />
                  <p className="text-[10px] text-[#374151] mt-1">{device.lastActiveAt}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Quick links ── */}
      <SectionLabel>Quick access</SectionLabel>
      <div className="flex flex-wrap gap-2">
        {[
          { label: "Download Panel",    href: "/dashboard/downloads" },
          { label: "Install Panel",     href: "/dashboard/plugin" },
          { label: "Connected Devices", href: "/dashboard/devices" },
          { label: "Billing",           href: "/dashboard/billing" },
          { label: "Documentation",     href: "/dashboard/docs" },
        ].map((l) => (
          <Link key={l.href} href={l.href}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-[8px] border border-white/[0.07] bg-white/[0.02] text-[12px] font-medium text-[#6B7280] hover:text-[#D1D5DB] hover:border-white/[0.12] transition-colors">
            {l.label}
            <ChevronRight className="w-3 h-3" />
          </Link>
        ))}
      </div>
    </div>
  );
}
