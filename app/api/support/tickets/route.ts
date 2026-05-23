import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const snap = await db
    .collection("support_tickets")
    .where("userId", "==", userId)
    .get();

  const tickets = snap.docs
    .map((doc) => {
      const data = doc.data() as { createdAt?: string; [key: string]: unknown };
      return { id: doc.id, ...data };
    })
    .sort((a, b) => {
      const aDate = (a.createdAt as string) ?? "";
      const bDate = (b.createdAt as string) ?? "";
      return bDate > aDate ? 1 : -1;
    });

  return NextResponse.json({ tickets });
}
