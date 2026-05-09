"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Monitor, CreditCard,
  Settings, Download, ShieldCheck, TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ADMIN_EMAIL      = "mahmutbegoviic.almin@gmail.com";
const AFFILIATE_EMAILS = ["mahmutbegoviic.almin@gmail.com", "brzotrcipuska7@gmail.com"];

const GREEN = "#39FF6A";

const navItems = [
  { label: "Overview",        href: "/dashboard",           icon: LayoutDashboard, requiresPlan: false },
  { label: "Download Plugin", href: "/dashboard/downloads", icon: Download,        requiresPlan: true  },
  { label: "Devices",         href: "/dashboard/devices",   icon: Monitor,         requiresPlan: true  },
  { label: "Billing",         href: "/dashboard/billing",   icon: CreditCard,      requiresPlan: false },
  { label: "Settings",        href: "/dashboard/settings",  icon: Settings,        requiresPlan: true  },
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
  if (locked) return null;

  return (
    <Link
      href={item.href}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "9px 16px",
        borderRadius: "8px",
        fontSize: "13px",
        fontWeight: active ? 500 : 400,
        color: active ? "white" : "#555",
        background: active ? "#111" : "transparent",
        borderLeft: active ? `2px solid ${GREEN}` : "2px solid transparent",
        textDecoration: "none",
        transition: "background 150ms, color 150ms",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = "#111";
          (e.currentTarget as HTMLElement).style.color = "#888";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = "transparent";
          (e.currentTarget as HTMLElement).style.color = "#555";
        }
      }}
    >
      <Icon
        style={{
          width: "15px",
          height: "15px",
          flexShrink: 0,
          color: active ? GREEN : "#444",
        }}
      />
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

    fetch("/api/sync-location", { method: "POST" }).catch(() => {});
  }, []);

  const currentLabel = pathname.startsWith("/dashboard/admin")
    ? "Admin"
    : pathname.startsWith("/dashboard/affiliate")
    ? "Affiliate"
    : navItems.find((n) =>
        n.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(n.href)
      )?.label ?? "Dashboard";

  const userEmail      = user?.primaryEmailAddress?.emailAddress ?? "";
  const isAdmin        = userEmail === ADMIN_EMAIL;
  const isAffiliate    = AFFILIATE_EMAILS.includes(userEmail);
  const adminActive    = pathname.startsWith("/dashboard/admin");
  const affiliateActive = pathname.startsWith("/dashboard/affiliate");

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#080808",
        fontFamily: "var(--font-outfit), system-ui, sans-serif",
      }}
    >
      {/* ── Sidebar ── */}
      <aside
        className="hidden lg:flex flex-col"
        style={{
          width: "220px",
          flexShrink: 0,
          background: "#0a0a0a",
          borderRight: "1px solid #111",
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "0 16px",
            height: "58px",
            borderBottom: "1px solid #111",
          }}
        >
          <Image
            src="/logo/vecilogo.png"
            alt="Prysmor"
            width={26}
            height={26}
            style={{ objectFit: "contain", flexShrink: 0 }}
          />
          <span
            style={{
              fontSize: "17px",
              fontWeight: 700,
              color: "white",
              letterSpacing: "-0.5px",
            }}
          >
            Prysmor
          </span>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "16px 8px", display: "flex", flexDirection: "column", gap: "2px" }}>
          <p
            style={{
              fontSize: "10px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "2px",
              color: "#333",
              padding: "0 16px",
              marginBottom: "10px",
            }}
          >
            Portal
          </p>

          {navItems.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} isActive={isSubscribed} />
          ))}

          {/* Affiliate + Admin links */}
          {(isAffiliate || isAdmin) && (
            <div style={{ paddingTop: "12px", marginTop: "8px", borderTop: "1px solid #161616", display: "flex", flexDirection: "column", gap: "2px" }}>
              {isAffiliate && (
                <Link
                  href="/dashboard/affiliate"
                  style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "9px 16px",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: affiliateActive ? 500 : 400,
                    color: affiliateActive ? "white" : "#555",
                    background: affiliateActive ? "#111" : "transparent",
                    borderLeft: affiliateActive ? `2px solid ${GREEN}` : "2px solid transparent",
                    textDecoration: "none",
                    transition: "background 150ms, color 150ms",
                  }}
                >
                  <TrendingUp
                    style={{
                      width: "15px",
                      height: "15px",
                      flexShrink: 0,
                      color: affiliateActive ? GREEN : "#444",
                    }}
                  />
                  Affiliate
                </Link>
              )}
              {isAdmin && (
                <Link
                  href="/dashboard/admin"
                  style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "9px 16px",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: adminActive ? 500 : 400,
                    color: adminActive ? "#F59E0B" : "#555",
                    background: adminActive ? "rgba(245,158,11,0.08)" : "transparent",
                    borderLeft: adminActive ? "2px solid #F59E0B" : "2px solid transparent",
                    textDecoration: "none",
                    transition: "background 150ms, color 150ms",
                  }}
                >
                  <ShieldCheck
                    style={{
                      width: "15px",
                      height: "15px",
                      flexShrink: 0,
                      color: adminActive ? "#F59E0B" : "#444",
                    }}
                  />
                  Admin
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: "10px",
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: "4px",
                      background: "rgba(57,255,106,0.1)",
                      border: "1px solid rgba(57,255,106,0.2)",
                      color: GREEN,
                    }}
                  >
                    STAFF
                  </span>
                </Link>
              )}
            </div>
          )}
        </nav>

        {/* User area */}
        <div style={{ padding: "12px 8px", borderTop: "1px solid #111" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "8px 12px",
              borderRadius: "8px",
            }}
          >
            <UserButton afterSignOutUrl="/" />
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: "12px", fontWeight: 500, color: "#aaa", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {firstName}
              </p>
              <p style={{ fontSize: "11px", color: "#444", margin: 0 }}>{planLabel}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Topbar */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            height: "58px",
            padding: "0 24px",
            borderBottom: "1px solid #111",
            flexShrink: 0,
            background: "#080808",
          }}
        >
          {/* Mobile logo */}
          <div className="flex items-center gap-2 lg:hidden mr-4">
            <Image src="/logo/vecilogo.png" alt="Prysmor" width={22} height={22} style={{ objectFit: "contain" }} />
            <span style={{ fontSize: "15px", fontWeight: 700, color: "white", letterSpacing: "-0.5px" }}>Prysmor</span>
          </div>

          {/* Breadcrumb */}
          <div className="hidden lg:flex items-center" style={{ gap: "8px" }}>
            <span style={{ fontSize: "13px", color: "#444" }}>Portal</span>
            <span style={{ fontSize: "13px", color: "#222" }}>/</span>
            <span style={{ fontSize: "13px", fontWeight: 500, color: "white" }}>{currentLabel}</span>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "12px" }}>
            {firstName && (
              <span className="hidden sm:block" style={{ fontSize: "13px", color: "#666" }}>
                {firstName}
              </span>
            )}
            <UserButton afterSignOutUrl="/" />
          </div>
        </header>

        {/* Mobile nav */}
        <nav
          className="lg:hidden flex items-center gap-1 overflow-x-auto"
          style={{
            padding: "8px 12px",
            borderBottom: "1px solid #111",
            background: "#0a0a0a",
          }}
        >
          {navItems.map((item) => {
            const Icon   = item.icon;
            const locked = item.requiresPlan && !isSubscribed;
            if (locked) return null;
            const active =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12px] font-medium whitespace-nowrap transition-colors flex-shrink-0",
                  active ? "text-white" : "text-[#555]"
                )}
                style={{ background: active ? "#111" : "transparent" }}
              >
                <Icon style={{ width: "14px", height: "14px", color: active ? GREEN : "#444" }} />
                {item.label}
              </Link>
            );
          })}

          {isAffiliate && (
            <Link
              href="/dashboard/affiliate"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12px] font-medium whitespace-nowrap flex-shrink-0"
              style={{
                color: affiliateActive ? "white" : "#555",
                background: affiliateActive ? "#111" : "transparent",
              }}
            >
              <TrendingUp style={{ width: "14px", height: "14px", color: affiliateActive ? GREEN : "#444" }} />
              Affiliate
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/dashboard/admin"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12px] font-medium whitespace-nowrap flex-shrink-0"
              style={{
                color: adminActive ? "#F59E0B" : "#555",
                background: adminActive ? "rgba(245,158,11,0.08)" : "transparent",
                border: "1px solid",
                borderColor: adminActive ? "rgba(245,158,11,0.2)" : "rgba(245,158,11,0.1)",
              }}
            >
              <ShieldCheck style={{ width: "14px", height: "14px" }} />
              Admin
            </Link>
          )}
        </nav>

        {/* Content */}
        <main style={{ flex: 1, overflow: "auto", background: "#080808" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
