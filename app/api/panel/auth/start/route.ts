import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

export async function POST(req: NextRequest) {
  // Accept optional device diagnostics from the panel
  let body: {
    platform?: string;
    hostApp?: string;
    hostAppVersion?: string;
    cepVersion?: string;
    deviceName?: string;
  } = {};
  try { body = await req.json(); } catch (_) {}

  const code = generateCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS);

  await db.collection("panel_auth_codes").doc(code).set({
    status: "pending",
    createdAt: now,
    expiresAt,
    // Store device diagnostics so confirm route can register the device
    ...(body.platform        && { platform: body.platform }),
    ...(body.hostApp         && { hostApp: body.hostApp }),
    ...(body.hostAppVersion  && { hostAppVersion: body.hostAppVersion }),
    ...(body.cepVersion      && { cepVersion: body.cepVersion }),
    ...(body.deviceName      && { deviceName: body.deviceName }),
  });

  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.NODE_ENV === "development"
      ? "http://localhost:3000"
      : "https://prysmor.com");

  return new NextResponse(
    JSON.stringify({ deviceCode: code, pairingUrl: `${base}/panel-auth?code=${code}`, expiresIn: 300 }),
    { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
  );
}
