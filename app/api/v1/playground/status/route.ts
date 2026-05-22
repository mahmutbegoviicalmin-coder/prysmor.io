import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getUser } from "@/lib/firestore/users";

export const runtime = "nodejs";

/** Returns whether the logged-in user has already consumed their free trial. */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userDoc = await getUser(userId).catch(() => null);
  const trialUsed  = userDoc?.trialUsed  ?? false;
  const trialJobId = userDoc?.trialJobId ?? null;

  return NextResponse.json({ trialUsed, trialJobId });
}
