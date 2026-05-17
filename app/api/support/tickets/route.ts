import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

export async function GET() {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const snap = await db
    .collection("support_tickets")
    .where("userId", "==", userId)
    .orderBy("createdAt", "desc")
    .get();

  const tickets = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return NextResponse.json({ tickets });
}
