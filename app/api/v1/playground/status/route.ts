import { requireUser } from '@/lib/auth/session';
import { NextResponse } from "next/server";
import { getUser } from "@/lib/firestore/users";

export const runtime = "nodejs";

/** Returns whether the logged-in user has already consumed their free trial. */
export async function GET() {
  const authResult = await requireUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult.user;

  const userDoc = await getUser(userId).catch(() => null);
  const trialUsed  = userDoc?.trialUsed  ?? false;
  const trialJobId = userDoc?.trialJobId ?? null;

  return NextResponse.json({ trialUsed, trialJobId });
}
