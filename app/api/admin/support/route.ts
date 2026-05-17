import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

const ADMIN_EMAIL = "mahmutbegoviic.almin@gmail.com";

async function isAdmin(userId: string): Promise<boolean> {
  const { clerkClient } = await import("@clerk/nextjs/server");
  const user = await clerkClient.users.getUser(userId);
  return user.emailAddresses.some((e) => e.emailAddress === ADMIN_EMAIL);
}

export async function GET() {
  const { userId } = auth();
  if (!userId || !(await isAdmin(userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const snap = await db
    .collection("support_tickets")
    .orderBy("createdAt", "desc")
    .get();

  const tickets = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return NextResponse.json({ tickets });
}
