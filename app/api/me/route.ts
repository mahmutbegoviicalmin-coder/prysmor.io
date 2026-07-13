import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getUser, createUser } from "@/lib/firestore/users";

export async function GET() {
  const session = await getSessionUser();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let userDoc = await getUser(session.userId).catch(() => null);

  if (!userDoc) {
    await createUser(session.userId).catch(() => {});
    userDoc = await getUser(session.userId).catch(() => null);
  }

  return NextResponse.json(
    {
      userId: session.userId,
      email: session.email,
      plan: userDoc?.plan ?? "starter",
      licenseStatus: userDoc?.licenseStatus ?? "inactive",
    },
    {
      headers: {
        "Cache-Control": "private, max-age=15, stale-while-revalidate=45",
      },
    }
  );
}
