import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";
import { getUser } from "@/lib/firestore/users";

export async function GET() {
  const { userId } = auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userDoc = await getUser(userId).catch(() => null);

  return NextResponse.json({
    userId,
    plan:          userDoc?.plan          ?? "starter",
    licenseStatus: userDoc?.licenseStatus ?? "inactive",
  });
}
