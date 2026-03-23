"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";
import {
  LayoutDashboard, PanelLeft, Monitor, CreditCard,
  BookOpen, Settings, Download,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Overview",  href: "/dashboard",           icon: LayoutDashboard },
  { label: "Plugin",    href: "/dashboard/plugin",    icon: PanelLeft },
  { label: "Downloads", href: "/dashboard/downloads", icon: Download },
  { label: "Devices",   href: "/dashboard/devices",   icon: Monitor },
  { label: "Billing",   href: "/dashboard/billing",   icon: CreditCard },
  { label: "Docs",      href: "/dashboard/docs",      icon: BookOpen },
  { label: "Settings",  href: "/dashboard/settings",  icon: Settings },
];

function NavLink({ item, pathname }: { item: typeof navItems[0]; pathname: string }) {
  const Icon = item.icon;
  const active =
    item.href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(item.href);
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
  const pathname = usePathname();
  const { user } = useUser();
  const firstName = user?.firstName ?? "";

  const currentLabel = navItems.find((n) =>
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
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>

        {/* User */}
        <div className="px-3 py-3 border-t border-white/[0.05]">
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-[8px]">
            <UserButton afterSignOutUrl="/" />
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-[#D1D5DB] truncate">{firstName}</p>
              <p className="text-[11px] text-[#4B5563]">Creator Suite</p>
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

          {/* Breadcrumb (desktop) */}
          <div className="hidden lg:flex items-center gap-2">
            <span className="text-[13px] text-[#374151]">Portal</span>
            <span className="text-[13px] text-[#1F2937]">/</span>
            <span className="text-[13px] font-medium text-[#9CA3AF]">{currentLabel}</span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {firstName && (
              <span className="hidden sm:block text-[13px] text-[#6B7280]">
                {firstName}
              </span>
            )}
            <UserButton afterSignOutUrl="/" />
          </div>
        </header>

        {/* Mobile nav */}
        <nav className="lg:hidden flex items-center gap-1 px-3 py-2 border-b border-white/[0.05] overflow-x-auto" style={{ background: "#09090B" }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12px] font-medium whitespace-nowrap transition-colors flex-shrink-0",
                  active ? "bg-white/[0.06] text-white" : "text-[#6B7280] hover:text-[#D1D5DB]"
                )}>
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Content */}
        <main className="flex-1 overflow-auto bg-[#09090B]">
          {children}
        </main>
      </div>
    </div>
  );
}
