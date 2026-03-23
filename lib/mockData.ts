export const mockLicense = {
  status: "active" as const,
  planName: "Creator Suite",
  renewalDate: "April 3, 2026",
  lastVerifiedAt: "2 minutes ago",
};

export const mockPanel = {
  connected: true,
  deviceName: "DESKTOP-WIN11",
  platform: "Windows 11 · Premiere Pro 2024",
  lastActiveAt: "Today at 14:32",
};

export const mockLimits = {
  deviceLimit: 2,
  devicesUsed: 1,
  monthlyAllowance: 100,
  usedThisCycle: 48,
  resetDate: "April 3, 2026",
};

export const mockSecurity = {
  mfaEnabled: false,
  lastLoginAt: "Today at 09:11 · Chrome, Windows",
  activeSessions: 1,
};

export const mockActivity: {
  title: string;
  detail: string;
  timestamp: string;
}[] = [
  { title: "License verified",   detail: "Creator Suite · auto-check",      timestamp: "2 min ago" },
  { title: "Panel connected",    detail: "DESKTOP-WIN11 · Premiere 2024",   timestamp: "Today 14:32" },
  { title: "Sign in",            detail: "Chrome · Windows 11",             timestamp: "Today 09:11" },
  { title: "Invoice paid",       detail: "$99.00 · Creator Suite",          timestamp: "Mar 3, 2026" },
  { title: "Device registered",  detail: "DESKTOP-WIN11 added",             timestamp: "Mar 3, 2026" },
  { title: "Account created",    detail: "prysmor.io",                      timestamp: "Mar 1, 2026" },
];
