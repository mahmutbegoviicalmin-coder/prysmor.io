import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
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

  const codeDoc = await db
    .collection("panel_auth_codes")
    .doc(code.toUpperCase())
    .get();

  if (!codeDoc.exists) {
    return NextResponse.json({ error: "Invalid code" }, { status: 404 });
  }

  const data = codeDoc.data()!;

  // Check expiry
  const expiresAt = data.expiresAt?.toDate?.() ?? new Date(0);
  if (Date.now() > expiresAt.getTime() && data.status === "pending") {
    await codeDoc.ref.update({ status: "expired" });
    return NextResponse.json({ status: "expired" });
  }

  if (data.status === "pending") {
    return NextResponse.json({ status: "pending" });
  }

  if (data.status === "authorized") {
    // Delete the code doc so it can't be reused
    await codeDoc.ref.delete();

    return NextResponse.json({
      status: "authorized",
      token: data.token,
      userId: data.userId,
      plan: data.plan,
      planLabel: data.planLabel,
    });
  }

  return NextResponse.json({ status: data.status });
}
