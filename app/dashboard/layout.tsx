"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Monitor, CreditCard,
  BookOpen, Settings, Download, Lock, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ADMIN_EMAIL = "mahmutbegoviic.almin@gmail.com";

const navItems = [
  { label: "Overview",        href: "/dashboard",           icon: LayoutDashboard, requiresPlan: false },
  { label: "Download Plugin", href: "/dashboard/downloads", icon: Download,        requiresPlan: true  },
  { label: "Devices",         href: "/dashboard/devices",   icon: Monitor,         requiresPlan: false },
  { label: "Billing",         href: "/dashboard/billing",   icon: CreditCard,      requiresPlan: false },
  { label: "Docs",            href: "/dashboard/docs",      icon: BookOpen,        requiresPlan: false },
  { label: "Settings",        href: "/dashboard/settings",  icon: Settings,        requiresPlan: false },
];

function NavLink({
  item,
  pathname,
  isActive: isSubscribed,
}: {
  item: typeof navItems[0];
  pathname: string;
  isActive: boolean;
}) {
  const Icon = item.icon;
  const active =
    item.href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(item.href);

  const locked = item.requiresPlan && !isSubscribed;

  if (locked) {
    return (
      <Link
        href="/dashboard/billing"
        title="Requires an active plan"
        className="relative flex items-center gap-3 px-3 py-2 rounded-[8px] text-[13px] font-medium transition-colors text-[#374151] cursor-pointer hover:bg-white/[0.02] group"
      >
        <Icon className="w-[15px] h-[15px] flex-shrink-0 text-[#2D2D35]" />
        <span className="flex-1">{item.label}</span>
        <Lock className="w-3 h-3 text-[#2D2D35] group-hover:text-[#4B5563] transition-colors flex-shrink-0" />
      </Link>
    );
  }

  return (
    <Link
      href={item.href}
      className={cn(
        "relative flex items-center gap-3 px-3 py-2 rounded-[8px] text-[13px] font-medium transition-colors",
        active
          ? "text-white bg-white/[0.05]"
          : "text-[#6B7280] hover:text-[#D1D5DB] hover:bg-white/[0.03]"
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 rounded-r-full bg-[#A3FF12]" />
      )}
      <Icon className={cn("w-[15px] h-[15px] flex-shrink-0", active ? "text-white" : "text-[#4B5563]")} />
      {item.label}
    </Link>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname  = usePathname();
  const { user }  = useUser();
  const firstName = user?.firstName ?? "";

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [planLabel, setPlanLabel]       = useState("Free");

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => {
        setIsSubscribed(d.licenseStatus === "active");
        setPlanLabel(
          d.licenseStatus === "active"
            ? (d.plan === "pro" ? "Pro" : d.plan === "exclusive" ? "Exclusive" : "Starter")
            : "No Plan"
        );
      })
      .catch(() => {});

    // Fire-and-forget — saves country from IP once per user (idempotent server-side)
    fetch("/api/sync-location", { method: "POST" }).catch(() => {});
  }, []);

  const currentLabel = pathname.startsWith("/dashboard/admin")
    ? "Admin"
    : navItems.find((n) =>
        n.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(n.href)
      )?.label ?? "Dashboard";

  return (
    <div className="flex min-h-screen" style={{ background: "#09090B" }}>
      {/* ── Sidebar ── */}
      <aside className="hidden lg:flex flex-col w-[216px] flex-shrink-0 border-r border-white/[0.06]" style={{ background: "#09090B" }}>
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 h-[58px] border-b border-white/[0.05]">
          <Image src="/logo/vecilogo.png" alt="Prysmor" width={28} height={28} className="object-contain flex-shrink-0" />
          <span className="text-[14px] font-semibold text-white tracking-tight">Prysmor</span>
        </div>

        {/* Nav group */}
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          <p className="px-3 mb-2 text-[10px] font-semibold text-[#374151] uppercase tracking-[0.08em]">
            Portal
          </p>
          {navItems.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} isActive={isSubscribed} />
          ))}

          {/* Admin link — only for admin email */}
          {user?.primaryEmailAddress?.emailAddress === ADMIN_EMAIL && (
            <div className="pt-3 mt-2 border-t border-white/[0.04]">
              <Link
                href="/dashboard/admin"
                className={cn(
                  "relative flex items-center gap-3 px-3 py-2 rounded-[8px] text-[13px] font-medium transition-all",
                  pathname.startsWith("/dashboard/admin")
                    ? "text-[#F59E0B] bg-[#F59E0B]/[0.10]"
                    : "text-[#78716C] hover:text-[#F59E0B] hover:bg-[#F59E0B]/[0.06]"
                )}
              >
                {pathname.startsWith("/dashboard/admin") && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 rounded-r-full bg-[#F59E0B]" />
                )}
                <ShieldCheck className={cn(
                  "w-[15px] h-[15px] flex-shrink-0",
                  pathname.startsWith("/dashboard/admin") ? "text-[#F59E0B]" : "text-[#57534E]"
                )} />
                Admin
                <span className="ml-auto text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20">
                  STAFF
                </span>
              </Link>
            </div>
          )}
        </nav>

        {/* User */}
        <div className="px-3 py-3 border-t border-white/[0.05]">
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-[8px]">
            <UserButton afterSignOutUrl="/" />
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-[#D1D5DB] truncate">{firstName}</p>
              <p className="text-[11px] text-[#4B5563]">{planLabel}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="flex items-center h-[58px] px-6 border-b border-white/[0.05] flex-shrink-0" style={{ background: "#09090B" }}>
          {/* Mobile logo */}
          <div className="flex items-center gap-2 lg:hidden mr-4">
            <Image src="/logo/vecilogo.png" alt="Prysmor" width={22} height={22} className="object-contain" />
            <span className="text-[14px] font-semibold text-white">Prysmor</span>
          </div>

          {/* Breadcrumb */}
          <div className="hidden lg:flex items-center gap-2">
            <span className="text-[13px] text-[#374151]">Portal</span>
            <span className="text-[13px] text-[#1F2937]">/</span>
            <span className="text-[13px] font-medium text-[#9CA3AF]">{currentLabel}</span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {firstName && (
              <span className="hidden sm:block text-[13px] text-[#6B7280]">{firstName}</span>
            )}
            <UserButton afterSignOutUrl="/" />
          </div>
        </header>

        {/* Mobile nav */}
        <nav className="lg:hidden flex items-center gap-1 px-3 py-2 border-b border-white/[0.05] overflow-x-auto" style={{ background: "#09090B" }}>
          {navItems.map((item) => {
            const Icon  = item.icon;
            const active =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);
            const locked = item.requiresPlan && !isSubscribed;
            return (
              <Link
                key={item.href}
                href={locked ? "/dashboard/billing" : item.href}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12px] font-medium whitespace-nowrap transition-colors flex-shrink-0",
                  locked
                    ? "text-[#2D2D35]"
                    : active
                    ? "bg-white/[0.06] text-white"
                    : "text-[#6B7280] hover:text-[#D1D5DB]"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
                {locked && <Lock className="w-3 h-3 ml-0.5" />}
              </Link>
            );
          })}
          {/* Admin mobile link */}
          {user?.primaryEmailAddress?.emailAddress === ADMIN_EMAIL && (
            <Link
              href="/dashboard/admin"
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12px] font-medium whitespace-nowrap transition-colors flex-shrink-0 border",
                pathname.startsWith("/dashboard/admin")
                  ? "bg-[#F59E0B]/[0.12] text-[#F59E0B] border-[#F59E0B]/20"
                  : "text-[#78716C] hover:text-[#F59E0B] border-[#F59E0B]/10 hover:border-[#F59E0B]/20"
              )}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Admin
            </Link>
          )}
        </nav>

        {/* Content */}
        <main className="flex-1 overflow-auto bg-[#09090B]">
          {children}
        </main>
      </div>
    </div>
  );
}
