export const runtime    = "nodejs";
export const maxDuration = 120;

import { requireUser } from '@/lib/auth/session';
import { NextRequest, NextResponse } from "next/server";
import { getJob, updateJob } from "@/lib/motionforge/jobs";
import { uploadToBeeble, createSwitchXTask } from "@/lib/motionforge/beeble";
import { getUser, consumeTrialSlot } from "@/lib/firestore/users";

const TRIAL_MAX_SECONDS = 2;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult.user;

  // Re-check trial guard on generate (double-check, job creation is the primary guard)
  const userDoc = await getUser(userId).catch(() => null);
  if (userDoc?.trialUsed === true) {
    return NextResponse.json({ error: "trial_used", message: "Free trial already used." }, { status: 403 });
  }

  const job = await getJob(userId, params.id).catch(() => null);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (job.status !== "uploading") {
    return NextResponse.json({ error: `Expected status "uploading", got "${job.status}"` }, { status: 409 });
  }

  const beebleUri = (job as any).beebleVideoUri as string | undefined;
  if (!beebleUri) {
    await updateJob(userId, params.id, { status: "failed", error: "Asset not uploaded, call /upload-url first" });
    return NextResponse.json({ error: "Asset not uploaded, call /upload-url first" }, { status: 400 });
  }

  let body: { prompt?: string; referenceImage?: string; mode?: string; clipDuration?: number };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const mode = ((body.mode ?? "background") as string).trim();
  if (mode !== "background" && mode !== "relight") {
    return NextResponse.json({ error: "Playground supports background and relight modes only." }, { status: 400 });
  }

  // Enforce max duration server-side
  const clipDuration = typeof body.clipDuration === "number" ? body.clipDuration : 0;
  if (clipDuration > TRIAL_MAX_SECONDS + 0.5) {
    return NextResponse.json(
      { error: `Free trial is limited to ${TRIAL_MAX_SECONDS} seconds. Your video is ${clipDuration.toFixed(1)}s.` },
      { status: 400 },
    );
  }

  const rawPrompt = (body.prompt ?? "").trim();
  if (!rawPrompt) return NextResponse.json({ error: "prompt is required" }, { status: 400 });

  const referenceImageB64 = (body.referenceImage ?? "").trim() || null;

  try {
    let beebleRefImageUri: string | undefined;
    if (referenceImageB64) {
      try {
        const refBuf = Buffer.from(referenceImageB64, "base64");
        beebleRefImageUri = await uploadToBeeble(refBuf, `ref-playground-${params.id}.jpg`);
      } catch { /* non-critical, proceed without reference image */ }
    }

    const beebleJobId = await createSwitchXTask({
      sourceUri:         beebleUri,
      referenceImageUri: beebleRefImageUri,
      prompt:            rawPrompt,
      alphaMode:         mode === "relight" ? "fill" : "auto",
      maxResolution:     720,
    });

    await updateJob(userId, params.id, {
      status:       "generating",
      prompt:       rawPrompt,
      mode,
      beebleTaskId: beebleJobId,
      progress:     0,
    } as any);

    // Atomically mark trial as consumed
    await consumeTrialSlot(userId, params.id);

    return NextResponse.json({ success: true, taskId: beebleJobId });
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : "Generation failed";
    // Never expose internal service names or config keys to the client
    const msg = raw.includes("API_KEY") || raw.includes("api_key") || raw.includes("service unavailable")
      ? "Generation service is temporarily unavailable. Please try again later."
      : "Generation failed. Please try again.";
    await updateJob(userId, params.id, { status: "failed", error: msg }).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
