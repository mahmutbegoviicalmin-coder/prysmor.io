"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Monitor, CreditCard,
  Settings, Download, ShieldCheck, TrendingUp, LifeBuoy, Sparkles, User,
} from "lucide-react";
import { cn } from "@/lib/utils";
const ADMIN_EMAIL = "mahmutbegoviic.almin@gmail.com";

const GREEN = "#39FF6A";

const navItems = [
  { label: "Overview",        href: "/dashboard",             icon: LayoutDashboard, requiresPlan: false },
  { label: "Playground",      href: "/dashboard/playground",  icon: Sparkles,        requiresPlan: false },
  { label: "Download Plugin", href: "/dashboard/downloads",   icon: Download,        requiresPlan: true  },
  { label: "Devices",         href: "/dashboard/devices",     icon: Monitor,         requiresPlan: true  },
  { label: "Billing",         href: "/dashboard/billing",     icon: CreditCard,      requiresPlan: false },
  { label: "Settings",        href: "/dashboard/settings",    icon: Settings,        requiresPlan: true  },
  { label: "Support",         href: "/dashboard/support",     icon: LifeBuoy,        requiresPlan: false },
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
  const pathname                    = usePathname();
  const [me, setMe] = useState<{ userId: string; email: string } | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const isSignedIn = !!me;
  const firstName = me?.email?.split("@")[0] ?? "";

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [planLabel, setPlanLabel]       = useState("Free");
  const [showAffiliate, setShowAffiliate] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        if (d?.userId) {
          setMe({ userId: d.userId, email: d.email || "" });
          setIsSubscribed(d.licenseStatus === "active");
          setPlanLabel(
            d.licenseStatus === "active"
              ? (d.plan === "pro" ? "Pro" : d.plan === "exclusive" ? "Exclusive" : "Starter")
              : "No Plan"
          );
        } else {
          setMe(null);
        }
      })
      .catch(() => { if (!cancelled) setMe(null); })
      .finally(() => { if (!cancelled) setIsLoaded(true); });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setShowAffiliate(false);
      return;
    }
    fetch("/api/affiliate/stats")
      .then((r) => setShowAffiliate(r.ok))
      .catch(() => setShowAffiliate(false));

    const syncKey = "prysmor_loc_synced";
    if (!sessionStorage.getItem(syncKey)) {
      sessionStorage.setItem(syncKey, "1");
      fetch("/api/sync-location", { method: "POST" }).catch(() => {});
    }
  }, [isLoaded, isSignedIn]);


  useEffect(() => {
    if (!isLoaded || isSignedIn) return;
    const timer = setTimeout(() => {
      window.location.replace("/sign-in");
    }, 500);
    return () => clearTimeout(timer);
  }, [isLoaded, isSignedIn]);

  // Show spinner while session is loading
  if (!isLoaded || !isSignedIn) {
    return (
      <div style={{
        minHeight: "100vh", background: "#080808",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: "20px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Image src="/logo/vecilogo.png" alt="Prysmor" width={24} height={24} style={{ objectFit: "contain" }} />
          <span style={{ fontSize: "16px", fontWeight: 700, color: "white", letterSpacing: "-0.5px" }}>Prysmor</span>
        </div>
        <div style={{
          width: "28px", height: "28px", borderRadius: "50%",
          border: "2px solid #1a1a1a", borderTopColor: "#39FF6A",
          animation: "spin 0.8s linear infinite",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const currentLabel = pathname.startsWith("/dashboard/admin")
    ? "Admin"
    : pathname.startsWith("/dashboard/staff")
    ? "Staff"
    : navItems.find((n) =>
        n.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(n.href)
      )?.label ?? "Dashboard";

  const userEmail      = me?.email ?? "";
  const isAdmin        = userEmail === ADMIN_EMAIL;
  const isAffiliate    = showAffiliate;
  const adminActive    = pathname.startsWith("/dashboard/admin");
  const affiliateActive = pathname.startsWith("/dashboard/staff");

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

          {/* Staff / Admin links */}
          {(isAffiliate || isAdmin) && (
            <div style={{ paddingTop: "12px", marginTop: "8px", borderTop: "1px solid #161616", display: "flex", flexDirection: "column", gap: "2px" }}>
              {isAffiliate && (
                <Link
                  href="/dashboard/staff"
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
                  Staff
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
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "8px",
                background: "rgba(57,255,106,0.08)",
                border: "1px solid rgba(57,255,106,0.18)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
              aria-hidden
            >
              <User style={{ width: "14px", height: "14px", color: GREEN }} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ fontSize: "12px", fontWeight: 500, color: "#aaa", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {firstName || userEmail.split("@")[0] || "Account"}
              </p>
              <p style={{ fontSize: "11px", color: "#444", margin: 0 }}>{planLabel}</p>
            </div>
            <Link href="/sign-out" style={{ fontSize: "11px", color: "#555", textDecoration: "none", flexShrink: 0 }}>
              Sign out
            </Link>
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
            <div
              className="hidden sm:flex"
              style={{ alignItems: "center", gap: "8px" }}
            >
              <div
                style={{
                  width: "26px",
                  height: "26px",
                  borderRadius: "7px",
                  background: "rgba(57,255,106,0.08)",
                  border: "1px solid rgba(57,255,106,0.18)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
                aria-hidden
              >
                <User style={{ width: "13px", height: "13px", color: GREEN }} />
              </div>
              {firstName && (
                <span style={{ fontSize: "13px", color: "#666" }}>
                  {firstName}
                </span>
              )}
            </div>
            <Link href="/sign-out" style={{ fontSize: "12px", color: "#666", textDecoration: "none" }}>Sign out</Link>
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
              href="/dashboard/staff"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12px] font-medium whitespace-nowrap flex-shrink-0"
              style={{
                color: affiliateActive ? "white" : "#555",
                background: affiliateActive ? "#111" : "transparent",
              }}
            >
              <TrendingUp style={{ width: "14px", height: "14px", color: affiliateActive ? GREEN : "#444" }} />
              Staff
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
