/**
 * Aggregates all real data needed for the dashboard overview page.
 * Called server-side; combines Firestore + Clerk session data.
 */

import { db } from "@/lib/firebaseAdmin";
import { getUser, PLAN_LABELS, PLAN_CREDITS } from "./users";
import { getDevices } from "./devices";
import type { User } from "@clerk/nextjs/server";

// ─── helpers ──────────────────────────────────────────────────────────────────

function tsToDate(ts: FirebaseFirestore.Timestamp | Date | undefined): Date {
  if (!ts) return new Date();
  if (ts instanceof Date) return ts;
  return (ts as FirebaseFirestore.Timestamp).toDate();
}

function formatRelative(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

function formatDateTime(date: Date): string {
  const today = new Date();
  const isToday =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (isToday) return `Today at ${time}`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Formats any stored renewalDate — handles raw ISO, .NET 7-digit millis, or already-formatted strings. */
function formatRenewalDate(value: string | undefined): string {
  if (!value) return '';
  if (!value.includes('T') && !value.match(/^\d{4}-\d{2}-\d{2}$/)) return value; // already formatted
  try {
    const normalized = value.replace(/\.(\d{7})Z$/, (_, f) => `.${f.slice(0, 3)}Z`);
    const d = new Date(normalized);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } catch {
    return value;
  }
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function cycleStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

// ─── types ────────────────────────────────────────────────────────────────────

export interface DashboardLicense {
  planName: string;
  status: "active" | "inactive" | "trialing";
  renewalDate: string;
  lastVerifiedAt: string;
}

export interface DashboardDevice {
  id: string;
  name: string;
  platform: string;
  hostApp: string;
  hostAppVersion: string;
  cepVersion: string;
  firstSeenAt: string;
  lastActiveAt: string;
  connected: boolean;
}

export interface DashboardPanel {
  connected: boolean;
  deviceName: string;
  platform: string;
  hostApp: string;
  hostAppVersion: string;
  cepVersion: string;
  firstConnectedAt: string;
  lastActiveAt: string;
  allDevices: DashboardDevice[];
}

export interface DashboardLimits {
  credits: number;
  creditsTotal: number;
  devicesUsed: number;
  deviceLimit: number;
  resetDate: string;
}

export interface DashboardSecurity {
  mfaEnabled: boolean;
  lastLoginAt: string;
  activeSessions: number;
}

export interface DashboardActivity {
  title: string;
  detail: string;
  timestamp: string;
}

export interface DashboardData {
  license: DashboardLicense;
  panel: DashboardPanel;
  limits: DashboardLimits;
  security: DashboardSecurity;
  activity: DashboardActivity[];
}

// ─── main fetch ───────────────────────────────────────────────────────────────

export async function getDashboardData(
  userId: string,
  clerkUser: User
): Promise<DashboardData> {
  const [userDoc, devices, jobsSnap] = await Promise.all([
    getUser(userId),
    getDevices(userId),
    db
      .collection("users")
      .doc(userId)
      .collection("jobs")
      .orderBy("createdAt", "desc")
      .limit(200)
      .get(),
  ]);

  // Already ordered by createdAt desc from the query
  const sortedJobs = jobsSnap.docs;
  const cycleStartMs = cycleStart().getTime();
  const thisMonthJobs = sortedJobs.filter(
    (d) => tsToDate(d.data().createdAt).getTime() >= cycleStartMs
  );

  // ── License ────────────────────────────────────────────────────────────────
  const plan          = userDoc?.plan          ?? "starter";
  const planLabel     = PLAN_LABELS[plan]      ?? plan;
  // IMPORTANT: default must be "inactive" — never grant free access to users
  // whose Firestore doc hasn't been created yet (e.g. Clerk webhook delay).
  const licenseStatus = userDoc?.licenseStatus ?? "inactive";

  // Format renewal date — Firestore may contain raw ISO from old webhook calls
  const renewalDate = formatRenewalDate(userDoc?.renewalDate);

  const license: DashboardLicense = {
    planName: planLabel,
    status: licenseStatus,
    renewalDate,
    lastVerifiedAt: "Just now",
  };

  // ── Panel ──────────────────────────────────────────────────────────────────
  const connectedThreshold = 30 * 60 * 1000; // 30 min

  const allDevices: DashboardDevice[] = devices.map((d) => {
    const lastActive = tsToDate(d.lastActive);
    const firstSeen  = tsToDate(d.firstSeen);
    return {
      id:              d.id,
      name:            d.name ?? d.id,
      platform:        d.platform ?? "—",
      hostApp:         (d as any).hostApp        ?? "Adobe Premiere Pro",
      hostAppVersion:  (d as any).hostAppVersion ?? "—",
      cepVersion:      (d as any).cepVersion     ?? "—",
      firstSeenAt:     formatDateTime(firstSeen),
      lastActiveAt:    formatDateTime(lastActive),
      connected:       Date.now() - lastActive.getTime() < connectedThreshold,
    };
  });

  let panel: DashboardPanel;
  if (devices.length > 0) {
    const latest = allDevices[0];
    panel = {
      connected:        latest.connected,
      deviceName:       latest.name,
      platform:         latest.platform,
      hostApp:          latest.hostApp,
      hostAppVersion:   latest.hostAppVersion,
      cepVersion:       latest.cepVersion,
      firstConnectedAt: latest.firstSeenAt,
      lastActiveAt:     latest.lastActiveAt,
      allDevices,
    };
  } else {
    panel = {
      connected: false,
      deviceName: "No device registered",
      platform: "—",
      hostApp: "—",
      hostAppVersion: "—",
      cepVersion: "—",
      firstConnectedAt: "—",
      lastActiveAt: "—",
      allDevices: [],
    };
  }

  // ── Usage / Limits ─────────────────────────────────────────────────────────
  // Default to 0 — never show phantom credits to users without an active plan.
  const credits      = typeof userDoc?.credits      === "number" ? userDoc.credits      : 0;
  const creditsTotal = typeof userDoc?.creditsTotal === "number" ? userDoc.creditsTotal : 0;

  const resetAt = new Date();
  resetAt.setMonth(resetAt.getMonth() + 1, 1);
  resetAt.setDate(0);

  const limits: DashboardLimits = {
    credits,
    creditsTotal,
    devicesUsed: devices.length,
    deviceLimit: userDoc?.deviceLimit ?? 1,
    resetDate: formatDate(resetAt),
  };

  // ── Security ───────────────────────────────────────────────────────────────
  const mfaEnabled = clerkUser.twoFactorEnabled ?? false;
  const lastSignIn = clerkUser.lastSignInAt
    ? new Date(clerkUser.lastSignInAt)
    : null;

  // Clerk doesn't expose session list server-side easily; default to 1
  const security: DashboardSecurity = {
    mfaEnabled,
    lastLoginAt: lastSignIn ? formatDateTime(lastSignIn) : "—",
    activeSessions: 1,
  };

  // ── Activity ───────────────────────────────────────────────────────────────
  const activity: DashboardActivity[] = [];

  // Recent VFX jobs (last 3)
  const recentJobs = sortedJobs.slice(0, 3);

  for (const job of recentJobs) {
    const data = job.data();
    const createdAt = tsToDate(data.createdAt);
    activity.push({
      title: "VFX render",
      detail: data.prompt ? `"${String(data.prompt).slice(0, 40)}"` : "MotionForge job",
      timestamp: formatRelative(createdAt),
    });
  }

  // Last sign-in from Clerk
  if (lastSignIn) {
    activity.push({
      title: "Sign in",
      detail: clerkUser.primaryEmailAddress?.emailAddress ?? "Authenticated",
      timestamp: formatRelative(lastSignIn),
    });
  }

  // Panel last active
  if (devices.length > 0 && panel.connected) {
    const lastActive = tsToDate(devices[0].lastActive);
    activity.push({
      title: "Panel connected",
      detail: `${devices[0].name ?? devices[0].id} · ${devices[0].platform}`,
      timestamp: formatRelative(lastActive),
    });
  }

  // Account creation
  if (userDoc?.createdAt) {
    const created = tsToDate(userDoc.createdAt);
    activity.push({
      title: "Account created",
      detail: "prysmor.io",
      timestamp: formatDateTime(created),
    });
  }

  return { license, panel, limits, security, activity: activity.slice(0, 6) };
}
