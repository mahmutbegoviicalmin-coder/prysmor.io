import { NextRequest, NextResponse }  from "next/server";
import { requireUser }               from "@/lib/auth/session";
import { db }                        from "@/lib/firebaseAdmin";
import { getUser, PLAN_LABELS, syncUserProfile } from "@/lib/firestore/users";
import {
  registerDevice,
  DeviceLimitError,
  buildPanelDeviceId,
} from "@/lib/firestore/devices";
import { PANEL_SESSION_TTL_MS } from "@/lib/motionforge/auth";

function generateToken(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(req: NextRequest) {
  const authResult = await requireUser();
  if (!authResult.ok) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { userId, email } = authResult.user;

  const { code } = await req.json().catch(() => ({ code: "" }));
  if (!code) {
    return NextResponse.json({ error: "Missing device code" }, { status: 400 });
  }

  const codeRef  = db.collection("panel_auth_codes").doc(code.toUpperCase());
  const codeSnap = await codeRef.get();

  if (!codeSnap.exists) {
    return NextResponse.json({ error: "Invalid code" }, { status: 404 });
  }

  const codeData = codeSnap.data()!;

  if (codeData.status !== "pending") {
    return NextResponse.json({ error: "Code already used or expired" }, { status: 409 });
  }
  if (Date.now() > codeData.expiresAt) {
    await codeRef.update({ status: "expired" });
    return NextResponse.json({ error: "Code expired" }, { status: 410 });
  }

  syncUserProfile(userId, { email }).catch(() => {});

  const userDoc       = await getUser(userId);
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

  const plan      = userDoc?.plan ?? "starter";
  const planLabel = PLAN_LABELS[plan] ?? plan;

  const machineFingerprint = codeData.machineFingerprint;
  const deviceId = buildPanelDeviceId(userId, machineFingerprint);

  let resolvedDeviceId = deviceId;
  try {
    resolvedDeviceId = await registerDevice(userId, deviceId, codeData.platform ?? "Unknown", codeData.deviceName, {
      hostApp:            codeData.hostApp,
      hostAppVersion:     codeData.hostAppVersion,
      cepVersion:         codeData.cepVersion,
      machineFingerprint,
    });
  } catch (err) {
    if (err instanceof DeviceLimitError) {
      return NextResponse.json(
        { error: "device_limit_reached", message: err.message, limit: err.limit },
        { status: 403 }
      );
    }
    console.warn("[panel/auth/confirm] registerDevice failed:", err);
  }

  const token     = generateToken();
  const now       = Date.now();
  const expiresAt = now + PANEL_SESSION_TTL_MS;

  await db.collection("panel_sessions").doc(token).set({
    userId,
    plan,
    planLabel,
    deviceCode:       code.toUpperCase(),
    deviceId:         resolvedDeviceId,
    expiresAt,
    licenseStatus:    "active",
    createdAt:        now,
    ...(machineFingerprint && { machineFingerprint }),
  });

  await codeRef.update({
    status:   "authorized",
    token,
    userId,
    plan,
    planLabel,
    expiresAt,
  });

  return NextResponse.json({ ok: true });
}
