import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { bucket } from "@/lib/firebaseAdmin";

export async function POST(req: Request) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const maxSize = 8 * 1024 * 1024; // 8 MB
  if (file.size > maxSize) {
    return NextResponse.json({ error: "File too large (max 8 MB)" }, { status: 413 });
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: "Only JPEG, PNG, WebP or GIF allowed" }, { status: 415 });
  }

  // Check if Firebase bucket is initialized
  if (!bucket) {
    console.error("[upload] Firebase bucket is null – FIREBASE_PRIVATE_KEY env var missing?");
    return NextResponse.json({ error: "Storage not configured" }, { status: 500 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop() ?? "jpg";
  const storagePath = `support/${userId}/${Date.now()}.${ext}`;

  const { randomUUID } = await import("crypto");
  const downloadToken = randomUUID();

  try {
    const fileRef = bucket.file(storagePath);
    await fileRef.save(buffer, {
      metadata: {
        contentType: file.type,
        metadata: { firebaseStorageDownloadTokens: downloadToken },
      },
      resumable: false,
    });

    const bucketName = bucket.name;
    const encodedPath = encodeURIComponent(storagePath);
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${downloadToken}`;
    console.log("[upload] success:", url);
    return NextResponse.json({ url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[upload] Firebase Storage error:", msg);
    return NextResponse.json({ error: "Upload failed", detail: msg }, { status: 500 });
  }
}
