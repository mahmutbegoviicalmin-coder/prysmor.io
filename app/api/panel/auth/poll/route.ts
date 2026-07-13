import { NextRequest, NextResponse } from "next/server";
import { db }                        from "@/lib/firebaseAdmin";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  const snap = await db.collection("panel_auth_codes").doc(code.toUpperCase()).get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Invalid or expired code" }, { status: 404 });
  }

  const data = snap.data()!;

  if (Date.now() > data.expiresAt && data.status === "pending") {
    await snap.ref.update({ status: "expired" });
    return NextResponse.json({ status: "expired" });
  }

  if (data.status === "pending") {
    return NextResponse.json({ status: "pending" });
  }

  if (data.status === "authorized") {
    // Delete so it can't be reused
    await snap.ref.delete();
    return NextResponse.json({
      status:    "authorized",
      token:     data.token,
      userId:    data.userId,
      plan:      data.plan,
      planLabel: data.planLabel,
      expiresAt: data.expiresAt,
    });
  }

  return NextResponse.json({ status: data.status });
}
