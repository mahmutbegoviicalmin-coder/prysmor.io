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

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop() ?? "jpg";
  const storagePath = `support/${userId}/${Date.now()}.${ext}`;

  const fileRef = bucket.file(storagePath);

  await fileRef.save(buffer, {
    metadata: { contentType: file.type },
    resumable: false,
  });

  // Explicitly make the file public (compatible with all firebase-admin versions)
  await fileRef.makePublic();

  // Use Firebase Storage download URL format (works without auth)
  const bucketName = bucket.name;
  const encodedPath = encodeURIComponent(storagePath);
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media`;

  return NextResponse.json({ url });
}
