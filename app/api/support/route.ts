import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

export async function POST(req: Request) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { issueType, adobeVersion, osVersion, pluginVersion, description, email } = body;

  if (!issueType || !description || !email) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  await db.collection("support_tickets").add({
    userId,
    email,
    issueType,
    adobeVersion: adobeVersion || "Not specified",
    osVersion: osVersion || "Not specified",
    pluginVersion: pluginVersion || "Not specified",
    description,
    status: "open",
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
