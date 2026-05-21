import { NextRequest, NextResponse } from "next/server";
import { db }                        from "@/lib/firebaseAdmin";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

export async function POST(req: NextRequest) {
  let body: {
    platform?: string;
    hostApp?: string;
    hostAppVersion?: string;
    cepVersion?: string;
    deviceName?: string;
    machineFingerprint?: string;
  } = {};
  try { body = await req.json(); } catch (_) {}

  const code      = generateCode();
  const now       = Date.now();
  const expiresAt = now + 5 * 60 * 1000; // 5 minutes

  await db.collection("panel_auth_codes").doc(code).set({
    status:    "pending",
    createdAt: now,
    expiresAt,
    ...(body.platform           && { platform:           body.platform }),
    ...(body.hostApp            && { hostApp:            body.hostApp }),
    ...(body.hostAppVersion     && { hostAppVersion:     body.hostAppVersion }),
    ...(body.cepVersion         && { cepVersion:         body.cepVersion }),
    ...(body.deviceName         && { deviceName:         body.deviceName }),
    ...(body.machineFingerprint && { machineFingerprint: body.machineFingerprint }),
  });

  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.NODE_ENV === "development"
      ? "http://localhost:3000"
      : "https://prysmor.io");

  return new NextResponse(
    JSON.stringify({ deviceCode: code, pairingUrl: `${base}/panel-auth?code=${code}`, expiresIn: 300 }),
    { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
  );
}
