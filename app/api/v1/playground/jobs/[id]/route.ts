export const runtime    = "nodejs";
export const maxDuration = 60;

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getJob, updateJob } from "@/lib/motionforge/jobs";
import { pollSwitchXJob } from "@/lib/motionforge/beeble";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const job = await getJob(userId, params.id).catch(() => null);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  if (job.status === "generating" && (job as any).beebleTaskId) {
    const beebleTaskId = (job as any).beebleTaskId as string;

    // Rate-limit polling to once every 8s
    const lastPolled = (job as any).beeblePolledAt
      ? ((job as any).beeblePolledAt instanceof Date
          ? (job as any).beeblePolledAt
          : ((job as any).beeblePolledAt as FirebaseFirestore.Timestamp).toDate())
      : null;
    const msSinceLastPoll = lastPolled ? Date.now() - lastPolled.getTime() : Infinity;

    if (msSinceLastPoll < 8_000) {
      return NextResponse.json({ status: "generating", progress: job.runwayProgress ?? 0 });
    }

    try {
      const result = await pollSwitchXJob(beebleTaskId);

      if (result.status === "generating") {
        const prev = job.runwayProgress ?? 0;
        const next = typeof result.progress === "number"
          ? Math.min(result.progress, 90)
          : Math.min(prev < 10 ? 10 : prev + 5, 90);
        await updateJob(userId, params.id, { beeblePolledAt: new Date(), runwayProgress: next } as any);
        return NextResponse.json({ status: "generating", progress: next });
      }

      if (result.status === "failed") {
        await updateJob(userId, params.id, { status: "failed", error: "Generation failed" });
        return NextResponse.json({ status: "failed", error: "Generation failed" });
      }

      if (result.status === "completed" && result.outputUrl) {
        await updateJob(userId, params.id, {
          status: "completed", outputUrl: result.outputUrl, rawOutputUrl: result.outputUrl, progress: 100,
        });
        return NextResponse.json({ status: "completed", progress: 100, outputUrl: result.outputUrl });
      }

      await updateJob(userId, params.id, { beeblePolledAt: new Date(), runwayProgress: 95 } as any);
      return NextResponse.json({ status: "generating", progress: 95 });

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Polling error";
      return NextResponse.json({ status: "generating", error: msg });
    }
  }

  return NextResponse.json({
    status:    job.status,
    progress:  job.progress ?? 0,
    outputUrl: job.outputUrl ?? null,
    error:     job.error ?? null,
  });
}
