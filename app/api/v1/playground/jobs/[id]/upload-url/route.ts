export const runtime    = "nodejs";
export const maxDuration = 15;

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getJob, updateJob } from "@/lib/motionforge/jobs";
import { createBeebleUploadSlot } from "@/lib/motionforge/beeble";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { userId } = await auth();
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

    const slot = await createBeebleUploadSlot(`playground-${params.id}.mp4`);

    // Persist beebleVideoUri on the job doc so /generate can read it
    await updateJob(userId, params.id, {
      assetUrl:       slot.beebleUri,
      beebleVideoUri: slot.beebleUri,
    } as any);

    return NextResponse.json({
      uploadUrl:    slot.uploadUrl,
      beebleUri:    slot.beebleUri,
      uploadMethod: "put",
    });
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    const msg = raw.includes("API_KEY") || raw.includes("api_key")
      ? "Generation service is temporarily unavailable. Please try again later."
      : "Upload failed. Please try again.";
    await updateJob(userId, params.id, { status: "failed", error: msg }).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
