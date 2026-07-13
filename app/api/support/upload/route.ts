import { requireUser } from '@/lib/auth/session';
import { NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

// Accepts { imageBase64: string } JSON body
// Stores compressed image in Firestore and returns a served URL
export async function POST(req: Request) {
  const authResult = await requireUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult.user;

  let imageBase64: string;
  try {
    const body = await req.json();
    imageBase64 = body.imageBase64;
    if (!imageBase64 || typeof imageBase64 !== "string") throw new Error("missing");
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // base64 string size sanity check (~4MB raw limit)
  if (imageBase64.length > 5_500_000) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 });
  }

  try {
    const docRef = await db.collection("ticketScreenshots").add({
      userId,
      imageBase64,
      createdAt: new Date().toISOString(),
    });

    const url = `https://prysmor.io/api/support/screenshot/${docRef.id}`;
    return NextResponse.json({ url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[upload] Firestore error:", msg);
    return NextResponse.json({ error: "Storage failed", detail: msg }, { status: 500 });
  }
}
