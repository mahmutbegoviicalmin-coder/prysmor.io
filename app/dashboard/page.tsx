import { currentUser } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2, WifiOff, Wifi, ShieldCheck, ShieldAlert,
  ChevronRight, Clock, Zap, Lock,
} from "lucide-react";
import { getDashboardData } from "@/lib/firestore/dashboard";

export const dynamic  = "force-dynamic";
export const metadata = { title: "Overview — Dashboard" };

const GREEN = "#39FF6A";

/* ─── primitives ─── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: "10px",
        fontWeight: 600,
        textTransform: "uppercase" as const,
        letterSpacing: "2px",
        color: "#333",
        marginBottom: "16px",
      }}
    >
      {children}
    </p>
  );
}

function Card({
  children,
  style = {},
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: "#0c0c0c",
        border: "1px solid #161616",
        borderRadius: "12px",
        padding: "24px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "11px",
        fontWeight: 500,
        padding: "3px 10px",
        borderRadius: "100px",
        background: active ? "rgba(57,255,106,0.08)" : "rgba(255,255,255,0.04)",
        border: active ? "1px solid rgba(57,255,106,0.2)" : "1px solid #1e1e1e",
        color: active ? GREEN : "#444",
      }}
    >
      <span
        style={{
          width: "5px",
          height: "5px",
          borderRadius: "50%",
          background: active ? GREEN : "#333",
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 0",
        borderBottom: "1px solid #111",
      }}
    >
      <span style={{ fontSize: "13px", color: "#444", fontWeight: 300 }}>{label}</span>
      <span style={{ fontSize: "13px", color: "#888", fontWeight: 400 }}>{value}</span>
    </div>
  );
}

/* ─── page ─── */
const FALLBACK_DATA = {
  license: { planName: "No Plan", status: "inactive" as const, renewalDate: "—", lastVerifiedAt: "—" },
  panel: { connected: false, deviceName: "—", platform: "—", hostApp: "—", hostAppVersion: "—", cepVersion: "—", firstConnectedAt: "—", lastActiveAt: "—", allDevices: [] },
  limits: { credits: 0, creditsTotal: 0, devicesUsed: 0, deviceLimit: 1, resetDate: "—" },
  security: { mfaEnabled: false, lastLoginAt: "—", activeSessions: 1 },
  activity: [],
};

export default async function DashboardOverviewPage() {
  const user = await currentUser();

  // If no user (race condition after sign-up), show fallback UI instead of redirecting
  // Middleware already protects this route — the user IS authenticated, just session propagating
  if (!user) {
    const data = FALLBACK_DATA;
    const { license, panel, limits, security, activity } = data;
    const pct = 0;
    const creditSeconds = 0;
    // Minimal render — client will refresh once Clerk session is ready
    return (
      <div style={{ padding: "40px 24px", maxWidth: "1100px", fontFamily: "var(--font-outfit), system-ui, sans-serif" }}>
        <div style={{ marginBottom: "40px" }}>
          <h1 style={{ fontSize: "clamp(24px, 3vw, 28px)", fontWeight: 700, color: "white", letterSpacing: "-1px", lineHeight: 1.15, margin: "0 0 8px 0" }}>
            Account Overview
          </h1>
          <p style={{ fontSize: "14px", color: "#555", fontWeight: 300, margin: 0 }}>
            Loading your account data...
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "24px", borderRadius: "12px", background: "#0c0c0c", border: "1px solid #161616" }}>
          <div style={{ width: "20px", height: "20px", borderRadius: "50%", border: "2px solid #1a1a1a", borderTopColor: "#39FF6A", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
          <p style={{ fontSize: "14px", color: "#555", margin: 0 }}>Setting up your account, please wait a moment...</p>
        </div>
        <meta httpEquiv="refresh" content="2" />
      </div>
    );
  }

  let data;
  try {
    data = await getDashboardData(user.id, user);
  } catch (err) {
    console.error("[dashboard] getDashboardData failed:", err);
    data = FALLBACK_DATA;
  }

  const { license, panel, limits, security, activity } = data;
  const pct = limits.creditsTotal > 0
    ? Math.min(100, Math.round((limits.credits / limits.creditsTotal) * 100))
    : 0;
  const creditSeconds = Math.floor(limits.credits / 4);

  return (
    <div
      style={{
        padding: "40px 24px",
        maxWidth: "1100px",
        fontFamily: "var(--font-outfit), system-ui, sans-serif",
      }}
      className="lg:px-10 lg:py-10"
    >
      {/* Header */}
      <div style={{ marginBottom: "40px" }}>
        <h1
          style={{
            fontSize: "clamp(24px, 3vw, 28px)",
            fontWeight: 700,
            color: "white",
            letterSpacing: "-1px",
            lineHeight: 1.15,
            margin: "0 0 8px 0",
          }}
        >
          Account Overview
        </h1>
        <p style={{ fontSize: "14px", color: "#555", fontWeight: 300, margin: 0, lineHeight: 1.6 }}>
          Manage your license, panel access, devices, and billing.
        </p>
      </div>

      {/* ── No plan banner ── */}
      {license.status !== "active" && (
        <div
          style={{
            marginBottom: "40px",
            borderRadius: "14px",
            border: `1px solid rgba(57,255,106,0.2)`,
            background: "linear-gradient(to right, rgba(57,255,106,0.05), transparent)",
            padding: "20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            flexWrap: "wrap" as const,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "rgba(57,255,106,0.1)",
                border: "1px solid rgba(57,255,106,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Lock style={{ width: "18px", height: "18px", color: GREEN }} />
            </div>
            <div>
              <p style={{ fontSize: "15px", fontWeight: 600, color: "white", margin: "0 0 4px 0" }}>
                Activate your plan to get started
              </p>
              <p style={{ fontSize: "13px", color: "#555", maxWidth: "420px", lineHeight: 1.6, margin: 0 }}>
                Subscribe to unlock the Prysmor Premiere panel, AI VFX generation, and Identity Lock.
              </p>
            </div>
          </div>
          <a
            href="/#pricing"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 20px",
              borderRadius: "8px",
              background: GREEN,
              color: "#000",
              fontSize: "13px",
              fontWeight: 700,
              textDecoration: "none",
              flexShrink: 0,
              whiteSpace: "nowrap" as const,
            }}
          >
            <Zap style={{ width: "16px", height: "16px" }} />
            Buy a plan
          </a>
        </div>
      )}

      {/* ── STATUS ROW ── */}
      <SectionLabel>Status</SectionLabel>
      <div
        className="grid lg:grid-cols-3"
        style={{ gap: "12px", marginBottom: "40px" }}
      >
        {/* License */}
        <Card>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
            <p style={{ fontSize: "12px", color: "#444", textTransform: "uppercase" as const, letterSpacing: "1px", margin: 0 }}>
              License
            </p>
            <StatusPill active={license.status === "active"} label={license.status === "active" ? "Active" : "Inactive"} />
          </div>
          <p
            style={{
              fontSize: "22px",
              fontWeight: 700,
              color: "white",
              letterSpacing: "-0.5px",
              margin: "0 0 16px 0",
            }}
          >
            {license.planName}
          </p>
          <div>
            <DataRow label="Renewal date" value={license.renewalDate} />
            <DataRow
              label="Last verified"
              value={
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <CheckCircle2 style={{ width: "12px", height: "12px", color: GREEN }} />
                  {license.lastVerifiedAt}
                </span>
              }
            />
          </div>
          <Link
            href="/dashboard/billing"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              marginTop: "16px",
              fontSize: "13px",
              color: GREEN,
              textDecoration: "none",
            }}
          >
            View billing <ChevronRight style={{ width: "12px", height: "12px" }} />
          </Link>
        </Card>

        {/* Panel */}
        <Card>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
            <p style={{ fontSize: "12px", color: "#444", textTransform: "uppercase" as const, letterSpacing: "1px", margin: 0 }}>
              Premiere Panel
            </p>
            <StatusPill active={panel.connected} label={panel.connected ? "Connected" : "Not connected"} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
            {panel.connected
              ? <Wifi style={{ width: "16px", height: "16px", color: GREEN, flexShrink: 0 }} />
              : <WifiOff style={{ width: "16px", height: "16px", color: "#333", flexShrink: 0 }} />
            }
            <p style={{ fontSize: "14px", fontWeight: 500, color: "white", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
              {panel.deviceName}
            </p>
          </div>
          <div>
            <DataRow label="Host app"        value={panel.hostApp !== "—" ? `${panel.hostApp} ${panel.hostAppVersion}`.trim() : "—"} />
            <DataRow label="Platform"        value={panel.platform} />
            <DataRow label="CEP version"     value={panel.cepVersion} />
            <DataRow label="First connected" value={panel.firstConnectedAt} />
            <DataRow label="Last active"     value={panel.lastActiveAt} />
          </div>
          <Link
            href="/dashboard/downloads"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              marginTop: "16px",
              padding: "12px",
              borderRadius: "8px",
              background: GREEN,
              color: "#000",
              fontSize: "13px",
              fontWeight: 700,
              textDecoration: "none",
              textAlign: "center" as const,
            }}
          >
            {panel.connected ? "Manage Panel" : "Download Plugin"}
          </Link>
        </Card>

        {/* Credits */}
        <Card>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
            <p style={{ fontSize: "12px", color: "#444", textTransform: "uppercase" as const, letterSpacing: "1px", margin: 0 }}>
              Credits
            </p>
            {license.status === "active"
              ? <span style={{ fontSize: "11px", color: "#444" }}>This cycle</span>
              : <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "#333" }}>
                  <Lock style={{ width: "11px", height: "11px" }} /> Inactive
                </span>
            }
          </div>

          {license.status !== "active" ? (
            <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", padding: "20px 0", gap: "8px", marginBottom: "16px" }}>
              <div
                style={{
                  width: "36px", height: "36px", borderRadius: "50%",
                  background: "rgba(255,255,255,0.03)", border: "1px solid #1e1e1e",
                  display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "4px",
                }}
              >
                <Lock style={{ width: "16px", height: "16px", color: "#333" }} />
              </div>
              <p style={{ fontSize: "13px", fontWeight: 500, color: "#333", margin: 0 }}>Credits locked</p>
              <p style={{ fontSize: "11px", color: "#2a2a2a", margin: 0, textAlign: "center" as const }}>Requires an active plan</p>
            </div>
          ) : (
            <div style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "8px" }}>
                <p style={{ margin: 0, lineHeight: 1 }}>
                  <span style={{ fontSize: "32px", fontWeight: 800, color: "white", letterSpacing: "-1px" }}>
                    {limits.credits.toLocaleString()}
                  </span>
                  <span style={{ fontSize: "15px", fontWeight: 300, color: "#333", marginLeft: "4px" }}>
                    / {limits.creditsTotal.toLocaleString()}
                  </span>
                </p>
                <span style={{ fontSize: "12px", color: pct < 20 ? "#fb923c" : "#555" }}>{pct}%</span>
              </div>
              <div style={{ height: "3px", width: "100%", borderRadius: "2px", background: "#1a1a1a", overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    borderRadius: "2px",
                    width: `${pct}%`,
                    background: pct < 20 ? "#fb923c" : GREEN,
                    transition: "width 600ms ease",
                  }}
                />
              </div>
              <p style={{ marginTop: "6px", fontSize: "12px", color: "#444" }}>
                ≈ {creditSeconds}s of AI VFX remaining
              </p>
            </div>
          )}

          <div>
            <DataRow label="Device seats" value={`${limits.devicesUsed} / ${limits.deviceLimit}`} />
            <DataRow label="Resets on"    value={limits.resetDate} />
          </div>
          {license.status === "active" && (
            <Link
              href="/dashboard/billing"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                marginTop: "16px",
                fontSize: "13px",
                color: GREEN,
                textDecoration: "none",
              }}
            >
              Manage credits <ChevronRight style={{ width: "12px", height: "12px" }} />
            </Link>
          )}
        </Card>
      </div>

      {/* ── SECURITY & ACTIVITY ── */}
      <SectionLabel>Security &amp; Activity</SectionLabel>
      <div className="grid lg:grid-cols-2" style={{ gap: "12px", marginBottom: "40px" }}>

        {/* Security */}
        <Card>
          <p style={{ fontSize: "15px", fontWeight: 600, color: "white", margin: "0 0 16px 0" }}>
            Security
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "16px",
              padding: "12px",
              borderRadius: "8px",
              border: "1px solid #161616",
              background: "rgba(255,255,255,0.02)",
            }}
          >
            {security.mfaEnabled
              ? <ShieldCheck style={{ width: "20px", height: "20px", color: GREEN, flexShrink: 0 }} />
              : <ShieldAlert style={{ width: "20px", height: "20px", color: "#F59E0B", flexShrink: 0 }} />
            }
            <div>
              <p style={{ fontSize: "13px", fontWeight: 500, color: "white", margin: "0 0 2px 0" }}>
                {security.mfaEnabled ? "Two-factor authentication enabled" : "Two-factor authentication disabled"}
              </p>
              <p style={{ fontSize: "11px", color: "#444", margin: 0 }}>
                {security.mfaEnabled
                  ? "Your account has an extra layer of protection."
                  : "Enable 2FA to secure your account."}
              </p>
            </div>
          </div>
          <div>
            <DataRow label="Last sign in"     value={security.lastLoginAt} />
            <DataRow label="Active sessions"  value={`${security.activeSessions} session`} />
          </div>
          <Link
            href="/dashboard/settings"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              marginTop: "16px",
              fontSize: "13px",
              color: "#444",
              textDecoration: "none",
            }}
          >
            Manage settings <ChevronRight style={{ width: "12px", height: "12px" }} />
          </Link>
        </Card>

        {/* Activity */}
        <Card>
          <p style={{ fontSize: "15px", fontWeight: 600, color: "white", margin: "0 0 16px 0" }}>
            Recent activity
          </p>
          {activity.length === 0 ? (
            <p style={{ fontSize: "13px", color: "#333", padding: "16px 0", textAlign: "center" as const }}>
              No activity yet
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {activity.map((item, i) => (
                <li
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    padding: "10px 0",
                    borderBottom: i < activity.length - 1 ? "1px solid #111" : "none",
                  }}
                >
                  <div>
                    <p style={{ fontSize: "13px", fontWeight: 500, color: "#aaa", margin: "0 0 2px 0" }}>{item.title}</p>
                    <p style={{ fontSize: "11px", color: "#444", margin: 0 }}>{item.detail}</p>
                  </div>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      fontSize: "11px",
                      color: "#333",
                      whiteSpace: "nowrap" as const,
                      marginLeft: "16px",
                      marginTop: "2px",
                      flexShrink: 0,
                    }}
                  >
                    <Clock style={{ width: "11px", height: "11px" }} />
                    {item.timestamp}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ── DEVICES ── */}
      {panel.allDevices.length > 0 && (
        <>
          <SectionLabel>Registered devices</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column" as const, gap: "8px", marginBottom: "40px" }}>
            {panel.allDevices.map((device) => (
              <div
                key={device.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderRadius: "12px",
                  border: "1px solid #161616",
                  background: "#0c0c0c",
                  padding: "12px 16px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                  <div
                    style={{
                      width: "32px", height: "32px", borderRadius: "8px", flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: device.connected ? "rgba(57,255,106,0.08)" : "rgba(255,255,255,0.03)",
                      border: device.connected ? "1px solid rgba(57,255,106,0.2)" : "1px solid #1e1e1e",
                    }}
                  >
                    {device.connected
                      ? <Wifi style={{ width: "15px", height: "15px", color: GREEN }} />
                      : <WifiOff style={{ width: "15px", height: "15px", color: "#333" }} />
                    }
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: "13px", fontWeight: 500, color: "white", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                      {device.name}
                    </p>
                    <p style={{ fontSize: "11px", color: "#444", margin: "2px 0 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                      {device.hostApp !== "—" ? `${device.hostApp} ${device.hostAppVersion} · ` : ""}
                      {device.platform}
                      {device.cepVersion !== "—" ? ` · CEP ${device.cepVersion}` : ""}
                    </p>
                  </div>
                </div>
                <div style={{ flexShrink: 0, marginLeft: "16px", textAlign: "right" as const }}>
                  <StatusPill active={device.connected} label={device.connected ? "Online" : "Offline"} />
                  <p style={{ fontSize: "10px", color: "#333", margin: "4px 0 0 0" }}>{device.lastActiveAt}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── QUICK LINKS ── */}
      <SectionLabel>Quick access</SectionLabel>
      <div style={{ display: "flex", flexWrap: "wrap" as const, gap: "8px" }}>
        {[
          { label: "Download Plugin",   href: "/dashboard/downloads" },
          { label: "Connected Devices", href: "/dashboard/devices" },
          { label: "Billing",           href: "/dashboard/billing" },
          { label: "Documentation",     href: "/dashboard/docs" },
        ].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 14px",
              borderRadius: "8px",
              border: "1px solid #161616",
              background: "#0c0c0c",
              fontSize: "12px",
              fontWeight: 500,
              color: "#555",
              textDecoration: "none",
              transition: "border-color 150ms, color 150ms",
            }}
          >
            {l.label}
            <ChevronRight style={{ width: "12px", height: "12px" }} />
          </Link>
        ))}
      </div>
    </div>
  );
}
