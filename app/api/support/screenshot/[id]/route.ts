import { NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const doc = await db.collection("ticketScreenshots").doc(params.id).get();
    if (!doc.exists) {
      return new NextResponse("Not found", { status: 404 });
    }

    const { imageBase64 } = doc.data() as { imageBase64: string };

    // Strip data URL prefix if present, detect mime type
    let base64Data = imageBase64;
    let mimeType = "image/jpeg";
    const match = imageBase64.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (match) {
      mimeType = match[1];
      base64Data = match[2];
    }

    const buffer = Buffer.from(base64Data, "base64");
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    console.error("[screenshot] Error:", err);
    return new NextResponse("Error", { status: 500 });
  }
}
