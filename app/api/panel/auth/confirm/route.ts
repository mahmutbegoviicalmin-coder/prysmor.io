import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs";
import { db } from "@/lib/firebaseAdmin";
import { getUser, PLAN_LABELS, syncUserProfile } from "@/lib/firestore/users";
import { registerDevice, DeviceLimitError } from "@/lib/firestore/devices";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function generateToken(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { code } = await req.json().catch(() => ({ code: "" }));
  if (!code) {
    return NextResponse.json({ error: "Missing device code" }, { status: 400 });
  }

  const codeRef = db.collection("panel_auth_codes").doc(code.toUpperCase());
  const codeDoc = await codeRef.get();

  if (!codeDoc.exists) {
    return NextResponse.json({ error: "Invalid code" }, { status: 404 });
  }

  const codeData = codeDoc.data()!;
  if (codeData.status !== "pending") {
    return NextResponse.json({ error: "Code already used or expired" }, { status: 409 });
  }

  const expiresAt = codeData.expiresAt?.toDate?.() ?? new Date(0);
  if (Date.now() > expiresAt.getTime()) {
    await codeRef.update({ status: "expired" });
    return NextResponse.json({ error: "Code expired" }, { status: 410 });
  }

  // Sync Clerk profile → Firestore (name, email) — fire-and-forget
  syncUserProfile(user.id, {
    email:     user.primaryEmailAddress?.emailAddress,
    firstName: user.firstName ?? undefined,
    lastName:  user.lastName  ?? undefined,
  }).catch(() => {});

  // Fetch user plan + verify active subscription
  const userDoc = await getUser(user.id);
  const licenseStatus = userDoc?.licenseStatus ?? "inactive";

  if (licenseStatus !== "active") {
    return NextResponse.json(
      {
        error:   "subscription_required",
        message: "An active Prysmor subscription is required to connect the panel. Visit prysmor.io/dashboard/billing to subscribe.",
      },
      { status: 403 }
    );
  }

  const plan = userDoc?.plan ?? "starter";
  const planLabel = PLAN_LABELS[plan] ?? plan;

  // Create panel session token
  const token = generateToken();
  const now = new Date();
  const sessionExpiry = new Date(now.getTime() + SESSION_TTL_MS);

  // Stable per-user deviceId — same slot on every login so re-auth never
  // hits the device limit when the previous session wasn't explicitly logged out.
  const deviceId = `panel-${user.id}`;

  await db.collection("panel_sessions").doc(token).set({
    userId: user.id,
    plan,
    planLabel,
    deviceCode: code.toUpperCase(),
    deviceId,
    createdAt: now,
    expiresAt: sessionExpiry,
  });

  // Register device with all diagnostics from the auth code
  const platform       = codeData.platform       ?? "Unknown";
  const hostApp        = codeData.hostApp         ?? undefined;
  const hostAppVersion = codeData.hostAppVersion  ?? undefined;
  const cepVersion     = codeData.cepVersion      ?? undefined;
  const deviceName     = codeData.deviceName      ?? undefined;

  // Device ID already computed above for session storage

  try {
    await registerDevice(user.id, deviceId, platform, deviceName, {
      hostApp,
      hostAppVersion,
      cepVersion,
    });
  } catch (err) {
    if (err instanceof DeviceLimitError) {
      return NextResponse.json(
        {
          error:   "device_limit_reached",
          message: err.message,
          limit:   err.limit,
        },
        { status: 403 }
      );
    }
    throw err;
  }

  // Mark code as authorized
  await codeRef.update({
    status: "authorized",
    userId: user.id,
    plan,
    planLabel,
    token,
    authorizedAt: now,
  });

  return NextResponse.json({ ok: true });
}
