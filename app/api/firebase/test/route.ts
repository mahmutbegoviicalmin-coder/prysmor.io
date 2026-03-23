import { db } from "@/lib/firebaseAdmin";
import { NextResponse } from "next/server";

export async function GET() {
  const ref = db.collection("test").doc("hello");

  await ref.set({
    message: "firebase connected",
    createdAt: new Date(),
  });

  return NextResponse.json({ success: true });
}
