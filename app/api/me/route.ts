import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getUser, createUser } from "@/lib/firestore/users";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let userDoc = await getUser(userId).catch(() => null);

  // If user document doesn't exist (e.g. Clerk webhook not configured, or doc
  // was accidentally deleted), create it now so the dashboard works correctly.
  if (!userDoc) {
    await createUser(userId).catch(() => {});
    userDoc = await getUser(userId).catch(() => null);
  }

  return NextResponse.json(
    {
      userId,
      plan:          userDoc?.plan          ?? "starter",
      licenseStatus: userDoc?.licenseStatus ?? "inactive",
    },
    {
      headers: {
        "Cache-Control": "private, max-age=15, stale-while-revalidate=45",
      },
    }
  );
}
