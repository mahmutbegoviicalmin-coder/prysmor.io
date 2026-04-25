import { NextRequest, NextResponse } from 'next/server';
import { getJob, getJobAny, updateJob } from '@/lib/motionforge/jobs';
import { getRunwayTaskStatus } from '@/lib/motionforge/runway';
import { validatePanelKey, validatePanelToken } from '@/lib/motionforge/auth';
import { log, warn, error as logError } from '@/lib/motionforge/logger';
import { refundCredits }              from '@/lib/firestore/users';

export const runtime     = 'nodejs';
export const maxDuration = 60;

const TAG = 'poll';

/** Retries refundCredits up to 3 times with a 2 s delay so transient failures don't permanently lose credits. */
async function refundWithRetry(userId: string, credits: number, jobId: string): Promise<void> {
  const MAX_ATTEMPTS = 3;
  const DELAY_MS     = 2_000;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await refundCredits(userId, credits);
      return;
    } catch (e) {
      if (attempt < MAX_ATTEMPTS) {
        warn(TAG, `Credit refund attempt ${attempt}/${MAX_ATTEMPTS} failed for job ${jobId} — retrying`, e);
        await new Promise(r => setTimeout(r, DELAY_MS));
      } else {
        warn(TAG, `Credit refund failed after ${MAX_ATTEMPTS} attempts for job ${jobId} — credits lost`, e);
      }
    }
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await validatePanelToken(req);
  if (!session && !validatePanelKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const job = session
    ? await getJob(session.userId, params.id)
    : await getJobAny(params.id);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const userId = session?.userId ?? job.userId;

  // ── Poll Runway for generation status ──────────────────────────────────────
  if (job.status === 'generating' && job.runwayTaskId) {
    // Rate-limit Runway API calls to once every 8 s.
    // The panel polls every 3.5 s — return cached progress between Runway polls
    // so Vercel functions stay fast and we don't hammer Runway.
    const lastPolled = job.runwayPolledAt
      ? (job.runwayPolledAt instanceof Date
          ? job.runwayPolledAt
          : (job.runwayPolledAt as FirebaseFirestore.Timestamp).toDate())
      : null;
    const msSinceLastPoll = lastPolled ? Date.now() - lastPolled.getTime() : Infinity;

    if (msSinceLastPoll < 8_000) {
      const cachedProgress = job.runwayProgress ?? 0;
      log(TAG, `Cached ${cachedProgress}% (${Math.round(msSinceLastPoll / 1000)}s since last Runway poll)`);
      return NextResponse.json({ status: 'generating', progress: cachedProgress });
    }

    try {
      const task = await getRunwayTaskStatus(job.runwayTaskId);

      log(TAG, `Runway raw response for task ${job.runwayTaskId}`, {
        status:    task.status,
        progress:  task.progress,
        hasOutput: Array.isArray(task.output) ? task.output.length : typeof task.output,
        output0:   Array.isArray(task.output) && task.output.length > 0
          ? JSON.stringify(task.output[0]).slice(0, 120)
          : 'none',
        failure:   task.failure ?? task.failureCode ?? null,
      });

      const taskStatus = (task.status ?? '').toUpperCase();

      // ── Runway still working ─────────────────────────────────────────────
      if (taskStatus === 'PENDING' || taskStatus === 'RUNNING') {
        const progress = Math.round((task.progress ?? 0) * 100);
        log(TAG, `Runway task ${job.runwayTaskId} → ${taskStatus} ${progress}%`);
        await updateJob(userId, params.id, { runwayPolledAt: new Date(), runwayProgress: progress } as any);
        return NextResponse.json({ status: 'generating', progress });
      }

      // ── Runway failed / cancelled ────────────────────────────────────────
      if (taskStatus === 'FAILED' || taskStatus === 'CANCELLED') {
        const reason = task.failure || task.failureCode || `Task ${taskStatus}`;
        logError(TAG, `Runway task ${job.runwayTaskId} ${taskStatus}`, reason);
        await updateJob(userId, params.id, { status: 'failed', error: reason });
        if (job.userId && job.creditCost) {
          refundWithRetry(job.userId, job.creditCost, params.id).catch(() => {});
        }
        return NextResponse.json({ status: 'failed', error: reason });
      }

      // ── Runway succeeded — output array may be empty on first poll, retry ─
      if (taskStatus === 'SUCCEEDED' && (!task.output || task.output.length === 0)) {
        warn(TAG, `Runway task ${job.runwayTaskId} SUCCEEDED but output empty — retrying next poll`);
        await updateJob(userId, params.id, { runwayPolledAt: new Date(), runwayProgress: 98 } as any);
        return NextResponse.json({ status: 'generating', progress: 98 });
      }

      // ── Runway succeeded with output ─────────────────────────────────────
      if (taskStatus === 'SUCCEEDED' && task.output && task.output.length > 0) {
        // Safe URL extraction: Runway API declares output as string[] but the
        // actual runtime shape varies. Handle both plain string and object forms.
        const rawItem = task.output[0] as unknown;
        let rawUrl: string;

        if (typeof rawItem === 'string') {
          rawUrl = rawItem;
        } else if (rawItem && typeof rawItem === 'object') {
          const obj = rawItem as Record<string, unknown>;
          const candidate = (obj.url ?? obj.uri ?? obj.downloadUrl) as string | undefined;
          if (candidate && typeof candidate === 'string') {
            rawUrl = candidate;
            warn(TAG, `task.output[0] was an object — extracted URL from key`, { key: Object.keys(obj).join(',') });
          } else {
            logError(TAG, `SUCCEEDED but task.output[0] has unrecognised shape — cannot extract URL`, {
              shape: JSON.stringify(rawItem).slice(0, 200),
            });
            await updateJob(userId, params.id, {
              status: 'failed',
              error:  `Runway output shape unrecognised: ${JSON.stringify(rawItem).slice(0, 200)}`,
            });
            return NextResponse.json({ status: 'failed', error: 'Runway output URL could not be extracted' });
          }
        } else {
          logError(TAG, `SUCCEEDED but task.output[0] is neither string nor object`, {
            type: typeof rawItem, value: String(rawItem).slice(0, 100),
          });
          await updateJob(userId, params.id, { status: 'failed', error: `Unexpected output type: ${typeof rawItem}` });
          return NextResponse.json({ status: 'failed', error: 'Runway output URL has unexpected type' });
        }

        log(TAG, `Runway SUCCEEDED for job ${params.id}`, { rawUrl: rawUrl.slice(0, 100) });

        try {
          await updateJob(userId, params.id, {
            status:       'completed',
            outputUrl:    rawUrl,
            rawOutputUrl: rawUrl,
            progress:     100,
          });
        } catch (updateErr) {
          logError(TAG, `Firestore write failed when marking job ${params.id} completed`, updateErr);
          return NextResponse.json({ status: 'failed', error: 'Database write failed after Runway succeeded — retry generation' });
        }

        log(TAG, `Job ${params.id} marked completed`);
        return NextResponse.json({ status: 'completed', progress: 100, outputUrl: rawUrl });
      }

      // Unexpected status — log it so we can diagnose
      warn(TAG, `Runway task ${job.runwayTaskId} returned unexpected status: "${task.status}"`);
      const progress = Math.round((task.progress ?? 0) * 100);
      return NextResponse.json({ status: 'generating', progress });

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Polling error';
      logError(TAG, `Runway polling threw for job ${params.id}: ${msg}`, err);
      return NextResponse.json({ status: 'generating', error: msg });
    }
  }

  // ── Return current state for all other statuses ────────────────────────────
  return NextResponse.json({
    status:    job.status,
    progress:  job.progress,
    outputUrl: job.outputUrl,
    error:     job.error,
  });
}
