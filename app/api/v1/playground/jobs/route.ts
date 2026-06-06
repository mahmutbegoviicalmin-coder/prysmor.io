import { auth, currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/firestore/users";
import { createJob } from "@/lib/motionforge/jobs";
import { Redis } from "@upstash/redis";

export const runtime = "nodejs";

const TRIAL_MAX_SECONDS = 2;

// ── Upstash Redis (reuse existing KV creds) ──────────────────────────────────
const redis = new Redis({
  url:   process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

// ── Disposable email domain blocklist ────────────────────────────────────────
const BLOCKED_DOMAINS = new Set([
  "mailinator.com","guerrillamail.com","guerrillamail.info","guerrillamail.biz",
  "guerrillamail.de","guerrillamail.net","guerrillamail.org","grr.la","spam4.me",
  "yopmail.com","yopmail.fr","cool.fr.nf","jetable.fr.nf","nospam.ze.tc",
  "nomail.xl.cx","mega.zik.dj","speed.1s.fr","courriel.fr.nf","moncourrier.fr.nf",
  "monemail.fr.nf","monmail.fr.nf","tempmail.com","temp-mail.org","throwam.com",
  "throwam.net","sharklasers.com","guerrillamailblock.com","dispostable.com",
  "maildrop.cc","discard.email","trashmail.com","trashmail.at","trashmail.io",
  "trashmail.me","trashmail.net","trashmail.xyz","fakeinbox.com","mailnull.com",
  "spamgourmet.com","spamgourmet.net","spamgourmet.org","spamgourmet.me",
  "spamtrap.ro","safetymail.info","spamcorpse.com","spamfree24.org",
  "tempinbox.com","tempinbox.co.uk","throwam.org","throwaway.email",
  "throwam.de","throwam.fr","nowmymail.com","crazymailing.com",
  "getairmail.com","filzmail.com","filzmail.de","20minutemail.com",
  "20minutemail.it","20minutemail.net","10minutemail.com","10minutemail.net",
  "10minutemail.org","10minutemail.de","10minutemail.co.uk",
]);

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── 1. Firestore trial flag ───────────────────────────────────────────────
  const userDoc = await getUser(userId).catch(() => null);
  if (userDoc?.trialUsed === true) {
    return NextResponse.json(
      { error: "trial_used", message: "You have already used your free trial." },
      { status: 403 },
    );
  }

  // ── 2. Fetch Clerk user for email checks ─────────────────────────────────
  let email: string | undefined;
  let displayName: string | undefined;
  try {
    const clerkUser = await currentUser();
    email       = clerkUser?.primaryEmailAddress?.emailAddress?.toLowerCase().trim() ?? undefined;
    displayName = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ")
                  || email?.split("@")[0] || undefined;

    // ── 3. Disposable email check ────────────────────────────────────────
    if (email) {
      const domain = email.split("@")[1] ?? "";
      if (BLOCKED_DOMAINS.has(domain)) {
        return NextResponse.json(
          { error: "invalid_email", message: "Please sign up with a permanent email address." },
          { status: 403 },
        );
      }
    }

    // ── 4. Email-based dedup in Redis (catches same email → new account) ──
    if (email) {
      const emailKey = `trial:email:${Buffer.from(email).toString("base64")}`;
      const existing = await redis.get(emailKey).catch(() => null);
      if (existing) {
        return NextResponse.json(
          { error: "trial_used", message: "A free trial has already been used with this email." },
          { status: 403 },
        );
      }
    }
  } catch { /* non-critical, proceed if Clerk call fails */ }

  // ── 5. IP-based dedup in Redis (30-day window) ───────────────────────────
  const ip = getClientIp(req);
  if (ip !== "unknown") {
    const ipKey = `trial:ip:${ip}`;
    try {
      const ipUsed = await redis.get(ipKey);
      if (ipUsed) {
        return NextResponse.json(
          { error: "trial_used", message: "A free trial has already been used from this device." },
          { status: 403 },
        );
      }
    } catch { /* Redis unavailable, allow through */ }
  }

  // ── 6. Create job ────────────────────────────────────────────────────────
  const jobId = await createJob(userId, 0, { email, displayName });

  // ── 7. Reserve IP + email slots in Redis (30 days TTL) ──────────────────
  try {
    const TTL = 60 * 60 * 24 * 30; // 30 days in seconds
    if (ip !== "unknown") {
      await redis.set(`trial:ip:${ip}`, userId, { ex: TTL });
    }
    if (email) {
      const emailKey = `trial:email:${Buffer.from(email).toString("base64")}`;
      await redis.set(emailKey, userId, { ex: TTL });
    }
  } catch { /* non-critical */ }

  return NextResponse.json({ jobId, maxSeconds: TRIAL_MAX_SECONDS }, { status: 201 });
}
