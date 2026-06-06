import { NextRequest, NextResponse } from 'next/server';
import { getJob, getJobAny, updateJob } from '@/lib/motionforge/jobs';
import { getRunwayTaskStatus } from '@/lib/motionforge/runway';
import { getKieTaskStatus }    from '@/lib/motionforge/kieai';
import { pollSwitchXJob }      from '@/lib/motionforge/beeble';
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
        warn(TAG, `Credit refund attempt ${attempt}/${MAX_ATTEMPTS} failed for job ${jobId}, retrying`, e);
        await new Promise(r => setTimeout(r, DELAY_MS));
      } else {
        warn(TAG, `Credit refund failed after ${MAX_ATTEMPTS} attempts for job ${jobId}, credits lost`, e);
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

  // ── Poll Beeble for background / relight modes ────────────────────────────
  if (job.status === 'generating' && (job as any).beebleTaskId) {
    const beebleTaskId = (job as any).beebleTaskId as string;

    // Rate-limit to once every 8 s, same as Runway
    const lastPolled = (job as any).beeblePolledAt
      ? ((job as any).beeblePolledAt instanceof Date
          ? (job as any).beeblePolledAt
          : ((job as any).beeblePolledAt as FirebaseFirestore.Timestamp).toDate())
      : null;
    const msSinceLastPoll = lastPolled ? Date.now() - lastPolled.getTime() : Infinity;

    if (msSinceLastPoll < 8_000) {
      const cachedProgress = job.runwayProgress ?? 0;
      log(TAG, `[beeble] Cached ${cachedProgress}% (${Math.round(msSinceLastPoll / 1000)}s since last poll)`);
      return NextResponse.json({ status: 'generating', progress: cachedProgress });
    }

    try {
      const result = await pollSwitchXJob(beebleTaskId);
      log(TAG, `[beeble] Task ${beebleTaskId} → ${result.status}`);

      if (result.status === 'generating') {
        // Use real Beeble progress if provided; otherwise simulate a slow ramp-up
        // (each poll +5%, starting at 10, capped at 90 until completion).
        const prevProgress = job.runwayProgress ?? 0;
        const nextProgress = typeof result.progress === 'number'
          ? Math.min(result.progress, 90)
          : Math.min(prevProgress < 10 ? 10 : prevProgress + 5, 90);
        await updateJob(userId, params.id, {
          beeblePolledAt: new Date(),
          runwayProgress: nextProgress,
        } as any);
        return NextResponse.json({ status: 'generating', progress: nextProgress });
      }

      if (result.status === 'failed') {
        await updateJob(userId, params.id, { status: 'failed', error: 'Beeble SwitchX failed' });
        if (job.userId && job.creditCost) {
          refundWithRetry(job.userId, job.creditCost, params.id).catch(() => {});
        }
        return NextResponse.json({ status: 'failed', error: 'Beeble SwitchX failed' });
      }

      if (result.status === 'completed' && result.outputUrl) {
        log(TAG, `[beeble] Completed for job ${params.id}, outputUrl: ${result.outputUrl.slice(0, 80)}`);
        await updateJob(userId, params.id, {
          status:       'completed',
          outputUrl:    result.outputUrl,
          rawOutputUrl: result.outputUrl,
          progress:     100,
        });
        return NextResponse.json({ status: 'completed', progress: 100, outputUrl: result.outputUrl });
      }

      // Completed but outputUrl not yet populated, wait one more poll
      warn(TAG, `[beeble] Task ${beebleTaskId} completed but outputUrl missing, waiting`);
      await updateJob(userId, params.id, { beeblePolledAt: new Date(), runwayProgress: 95 } as any);
      return NextResponse.json({ status: 'generating', progress: 95 });

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Beeble polling error';
      logError(TAG, `[beeble] Polling threw for job ${params.id}: ${msg}`, err);
      return NextResponse.json({ status: 'generating', error: msg });
    }
  }

  // ── Poll KIE.AI (Gemini Omni Video) ────────────────────────────────────────
  if (job.status === 'generating' && (job as any).kieTaskId) {
    const kieTaskId = (job as any).kieTaskId as string;

    // Rate-limit KIE.AI polls to once every 8 s
    const kieLastPolled = (job as any).kiePolledAt
      ? ((job as any).kiePolledAt instanceof Date
          ? (job as any).kiePolledAt
          : ((job as any).kiePolledAt as FirebaseFirestore.Timestamp).toDate())
      : null;
    const msKieSinceLastPoll = kieLastPolled ? Date.now() - kieLastPolled.getTime() : Infinity;

    if (msKieSinceLastPoll < 8_000) {
      const cached = (job as any).kieProgress ?? 0;
      log(TAG, `[kieai] Cached ${cached}% (${Math.round(msKieSinceLastPoll / 1000)}s since last poll)`);
      return NextResponse.json({ status: 'generating', progress: cached });
    }

    try {
      const result = await getKieTaskStatus(kieTaskId);
      log(TAG, `[kieai] Task ${kieTaskId} → ${result.state}`);

      // Map KIE.AI states: waiting/queuing/generating → still working
      if (result.state === 'waiting' || result.state === 'queuing' || result.state === 'generating') {
        const prevProgress = (job as any).kieProgress ?? 0;
        const nextProgress = typeof result.progress === 'number'
          ? Math.min(result.progress, 90)
          : Math.min(prevProgress < 10 ? 10 : prevProgress + 4, 90);

        await updateJob(userId, params.id, {
          kiePolledAt:  new Date(),
          kieProgress:  nextProgress,
          progress:     nextProgress,
        } as any);
        return NextResponse.json({ status: 'generating', progress: nextProgress });
      }

      if (result.state === 'fail') {
        const reason = result.failMsg || 'KIE.AI Gemini Omni Video failed';
        logError(TAG, `[kieai] Task ${kieTaskId} failed: ${reason}`);
        await updateJob(userId, params.id, { status: 'failed', error: reason });
        if (job.userId && job.creditCost) {
          refundWithRetry(job.userId, job.creditCost, params.id).catch(() => {});
        }
        return NextResponse.json({ status: 'failed', error: reason });
      }

      if (result.state === 'success') {
        if (!result.resultUrl) {
          // URL not yet populated, retry next poll
          warn(TAG, `[kieai] Task ${kieTaskId} succeeded but resultUrl missing, waiting`);
          await updateJob(userId, params.id, { kiePolledAt: new Date(), kieProgress: 95 } as any);
          return NextResponse.json({ status: 'generating', progress: 95 });
        }

        log(TAG, `[kieai] Completed for job ${params.id}, outputUrl: ${result.resultUrl.slice(0, 80)}`);
        await updateJob(userId, params.id, {
          status:       'completed',
          outputUrl:    result.resultUrl,
          rawOutputUrl: result.resultUrl,
          progress:     100,
        });
        return NextResponse.json({ status: 'completed', progress: 100, outputUrl: result.resultUrl });
      }

      warn(TAG, `[kieai] Unexpected state "${result.state}" for task ${kieTaskId}`);
      return NextResponse.json({ status: 'generating', progress: (job as any).kieProgress ?? 0 });

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'KIE.AI polling error';
      logError(TAG, `[kieai] Polling threw for job ${params.id}: ${msg}`, err);
      return NextResponse.json({ status: 'generating', error: msg });
    }
  }

  // ── Poll Runway for generation status ──────────────────────────────────────
  if (job.status === 'generating' && job.runwayTaskId) {
    // Rate-limit Runway API calls to once every 8 s.
    // The panel polls every 3.5 s, return cached progress between Runway polls
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

      // ── Runway succeeded, output array may be empty on first poll, retry ─
      if (taskStatus === 'SUCCEEDED' && (!task.output || task.output.length === 0)) {
        warn(TAG, `Runway task ${job.runwayTaskId} SUCCEEDED but output empty, retrying next poll`);
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
            warn(TAG, `task.output[0] was an object, extracted URL from key`, { key: Object.keys(obj).join(',') });
          } else {
            logError(TAG, `SUCCEEDED but task.output[0] has unrecognised shape, cannot extract URL`, {
              shape: JSON.stringify(rawItem).slice(0, 200),
            });
            await updateJob(userId, params.id, {
              status: 'failed',
              error:  'Output could not be retrieved, try again',
            });
            return NextResponse.json({ status: 'failed', error: 'Output could not be retrieved, try again' });
          }
        } else {
          logError(TAG, `SUCCEEDED but task.output[0] is neither string nor object`, {
            type: typeof rawItem, value: String(rawItem).slice(0, 100),
          });
          await updateJob(userId, params.id, { status: 'failed', error: `Unexpected output type: ${typeof rawItem}` });
          return NextResponse.json({ status: 'failed', error: 'Output could not be retrieved, try again' });
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
          return NextResponse.json({ status: 'failed', error: 'Database write failed, retry generation' });
        }

        log(TAG, `Job ${params.id} marked completed`);
        return NextResponse.json({ status: 'completed', progress: 100, outputUrl: rawUrl });
      }

      // Unexpected status, log it so we can diagnose
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
