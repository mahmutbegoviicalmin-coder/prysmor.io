export const runtime    = "nodejs";
export const maxDuration = 30;

import { auth }         from "@clerk/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { getJob, updateJob } from "@/lib/motionforge/jobs";
import { createBeebleUploadSlot } from "@/lib/motionforge/beeble";

/**
 * POST /api/v1/playground/jobs/[id]/upload
 *
 * Proxies the video upload to Beeble S3 server-side to avoid CORS issues.
 * The browser cannot PUT directly to S3 because Beeble's bucket doesn't
 * allow cross-origin requests from prysmor.io.
 *
 * Body: raw video binary (Content-Type: video/mp4)
 * Query: ?mode=background|relight
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const job = await getJob(userId, params.id).catch(() => null);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (job.status !== "created") {
    return NextResponse.json({ error: `Job already in status "${job.status}"` }, { status: 409 });
  }

  const mode = (req.nextUrl.searchParams.get("mode") ?? "background").toLowerCase();
  if (mode !== "background" && mode !== "relight") {
    return NextResponse.json({ error: "Playground supports background and relight modes only." }, { status: 400 });
  }

  try {
    await updateJob(userId, params.id, { status: "uploading" });

    // Read the video body as a Buffer
    const arrayBuffer = await req.arrayBuffer();
    const videoBuffer = Buffer.from(arrayBuffer);

    // Create Beeble upload slot
    const slot = await createBeebleUploadSlot(`playground-${params.id}.mp4`);

    // Upload server-side → no CORS issues
    const s3Res = await fetch(slot.uploadUrl, {
      method:  "PUT",
      body:    videoBuffer,
      headers: { "Content-Type": "video/mp4" },
    });

    if (!s3Res.ok) {
      const txt = await s3Res.text().catch(() => "");
      throw new Error(`S3 upload failed (${s3Res.status}): ${txt.slice(0, 200)}`);
    }

    // Persist beebleVideoUri on the job so /generate can read it
    await updateJob(userId, params.id, {
      assetUrl:       slot.beebleUri,
      beebleVideoUri: slot.beebleUri,
    } as any);

    return NextResponse.json({ beebleUri: slot.beebleUri });
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    const msg = raw.includes("API_KEY") || raw.includes("api_key")
      ? "Generation service is temporarily unavailable. Please try again later."
      : "Upload failed. Please try again.";
    await updateJob(userId, params.id, { status: "failed", error: msg }).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
