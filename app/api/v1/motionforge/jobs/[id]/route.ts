import { NextRequest, NextResponse, after } from 'next/server';
import { getJob, getJobAny, updateJob } from '@/lib/motionforge/jobs';
import { getRunwayTaskStatus } from '@/lib/motionforge/runway';
import { validatePanelKey, validatePanelToken } from '@/lib/motionforge/auth';
import { log, warn, error as logError } from '@/lib/motionforge/logger';
import { refundCredits }              from '@/lib/firestore/users';
import { getConfig }                  from '@/lib/motionforge/config';
import { enhanceVideo }               from '@/lib/motionforge/replicateEnhance';
// frameExtract and compositingPipeline import @ffmpeg-installer/ffmpeg at their top level,
// which is excluded from the Vercel bundle. Never import them statically in this route —
// use lazy await import() only inside the compositing path (local dev only).
import * as fs   from 'fs';
import * as path from 'path';
import * as os   from 'os';

/** Inline replacement for frameExtract.safeUnlink — avoids the ffmpeg static import. */
function safeUnlink(filePath: string): void {
  try { if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}
}

export const runtime     = 'nodejs';
export const maxDuration = 60; // Firebase cold start (5-8s) + Runway API (up to 20s) + buffer

const TAG = 'poll';

// ─── Compositing timeout ──────────────────────────────────────────────────────

function toDate(ts: unknown): Date {
  if (ts instanceof Date) return ts;
  if (ts && typeof (ts as { toDate?: unknown }).toDate === 'function') {
    return (ts as { toDate: () => Date }).toDate();
  }
  return new Date(0);
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

  // Prefer fast subcollection lookup; fall back to collection-group for panel-key auth
  const job = session
    ? await getJob(session.userId, params.id)
    : await getJobAny(params.id);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  // Resolved userId — used for all subsequent updateJob calls
  const userId = session?.userId ?? job.userId;

  const config = getConfig();

  // ── Handle stuck compositing with timeout fallback ─────────────────────────
  if (job.status === 'compositing') {
    const updatedAt  = toDate(job.updatedAt);
    const elapsedMs  = Date.now() - updatedAt.getTime();
    const timeoutMs  = config.compositingTimeoutMs;

    if (elapsedMs > timeoutMs) {
      warn(TAG, `Compositing timed out for job ${params.id} after ${Math.round(elapsedMs / 1000)}s`);
      const fallbackUrl = job.rawOutputUrl;
      if (fallbackUrl) {
        await updateJob(userId, params.id, {
          status:    'completed',
          outputUrl: fallbackUrl,
          progress:  100,
          warnings:  ['compositing-timeout-fallback-to-raw'],
        });
        return NextResponse.json({ status: 'completed', progress: 100, outputUrl: fallbackUrl });
      }
      await updateJob(userId, params.id, { status: 'failed', error: 'Compositing timed out with no fallback URL' });
      if (job.userId && job.creditCost) {
        refundCredits(job.userId, job.creditCost).catch(e =>
          warn(TAG, `Credit refund failed for job ${params.id}`, e),
        );
      }
      return NextResponse.json({ status: 'failed', error: 'Compositing timed out' });
    }

    return NextResponse.json({ status: 'compositing', progress: job.progress ?? 95 });
  }

  // ── Handle stuck upscaling with timeout fallback ───────────────────────────
  if (job.status === 'upscaling') {
    const updatedAt  = toDate(job.updatedAt);
    const elapsedMs  = Date.now() - updatedAt.getTime();
    const timeoutMs  = 5 * 60 * 1000; // 5 min — Replicate models rarely exceed this

    if (elapsedMs > timeoutMs) {
      warn(TAG, `Upscaling timed out for job ${params.id} after ${Math.round(elapsedMs / 1000)}s — falling back to raw output`);
      const fallbackUrl = job.rawOutputUrl;
      if (fallbackUrl) {
        await updateJob(userId, params.id, {
          status:    'completed',
          outputUrl: fallbackUrl,
          progress:  100,
          warnings:  ['upscaling-timeout-fallback-to-raw'],
        });
        return NextResponse.json({ status: 'completed', progress: 100, outputUrl: fallbackUrl });
      }
      await updateJob(userId, params.id, { status: 'failed', error: 'Upscaling timed out with no fallback URL' });
      return NextResponse.json({ status: 'failed', error: 'Upscaling timed out' });
    }

    return NextResponse.json({ status: 'upscaling', progress: job.progress ?? 85 });
  }

  // ── Poll Runway for generation status ──────────────────────────────────────
  if (job.status === 'generating' && job.runwayTaskId) {
    // Rate-limit Runway API calls to once every 8s.
    // The panel polls every 3.5s — return cached progress between Runway polls
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

      // Log the full raw task response so we can diagnose unexpected shapes
      log(TAG, `Runway raw response for task ${job.runwayTaskId}`, {
        status:   task.status,
        progress: task.progress,
        hasOutput: Array.isArray(task.output) ? task.output.length : typeof task.output,
        output0:  Array.isArray(task.output) && task.output.length > 0
          ? JSON.stringify(task.output[0]).slice(0, 120)
          : 'none',
        failure:  task.failure ?? task.failureCode ?? null,
      });

      // Normalise status to uppercase for consistent matching
      const taskStatus = (task.status ?? '').toUpperCase();

      // ── Runway still working ─────────────────────────────────────────────
      if (taskStatus === 'PENDING' || taskStatus === 'RUNNING') {
        const progress = Math.round((task.progress ?? 0) * 100);
        log(TAG, `Runway task ${job.runwayTaskId} → ${taskStatus} ${progress}%`);
        // Atomically update both polledAt + progress so cached responses are accurate.
        // Do this AFTER getting the response (not before) so failed calls don't
        // eat the 8s window — they'll retry on the next poll.
        await updateJob(userId, params.id, { runwayPolledAt: new Date(), runwayProgress: progress } as any);
        return NextResponse.json({ status: 'generating', progress });
      }

      // ── Runway failed / cancelled ────────────────────────────────────────
      if (taskStatus === 'FAILED' || taskStatus === 'CANCELLED') {
        const reason = task.failure || task.failureCode || `Task ${taskStatus}`;
        logError(TAG, `Runway task ${job.runwayTaskId} ${taskStatus}`, reason);
        safeUnlink(job.originalVideoPath ?? '');
        cleanupAnchorFrames(job.identityAnchorPaths ?? []);
        await updateJob(userId, params.id, { status: 'failed', error: reason });
        if (job.userId && job.creditCost) {
          refundCredits(job.userId, job.creditCost).catch(e =>
            warn(TAG, `Credit refund failed for job ${params.id}`, e),
          );
        }
        return NextResponse.json({ status: 'failed', error: reason });
      }

      // ── Runway succeeded — output array may be empty on first poll, retry ─
      if (taskStatus === 'SUCCEEDED' && (!task.output || task.output.length === 0)) {
        warn(TAG, `Runway task ${job.runwayTaskId} SUCCEEDED but output empty — retrying next poll`);
        // Mark polledAt so we don't hammer Runway on empty-output retries
        await updateJob(userId, params.id, { runwayPolledAt: new Date(), runwayProgress: 98 } as any);
        return NextResponse.json({ status: 'generating', progress: 98 });
      }

      // ── Runway succeeded with output ─────────────────────────────────────
      if (taskStatus === 'SUCCEEDED' && task.output && task.output.length > 0) {
        // Safe URL extraction: Runway API declares output as string[] but the
        // actual runtime shape varies. Handle both plain string and object forms
        // so a shape mismatch never causes a TypeError that swallows the success.
        const rawItem = task.output[0] as unknown;
        let rawUrl: string;

        if (typeof rawItem === 'string') {
          rawUrl = rawItem;
        } else if (rawItem && typeof rawItem === 'object') {
          // Some API versions wrap URLs: { url: '...' } or { uri: '...' }
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

        const origPath = job.originalVideoPath;
        const hasOrig  = origPath && fs.existsSync(origPath);

        log(TAG, `Runway SUCCEEDED for job ${params.id}`, {
          hasOrig,
          rawUrl: rawUrl.slice(0, 100),
          origPath: origPath ?? 'none',
        });

        // Mark polledAt so repeated SUCCEEDED polls don't re-run this block
        // while the Firestore write below is in-flight.
        await updateJob(userId, params.id, { runwayPolledAt: new Date(), runwayProgress: 100 } as any);

        if (!hasOrig) {
          log(TAG, 'No original clip on disk — skipping compositing');

          // ── Replicate enhancement (background, non-blocking) ───────────────
          if (process.env.REPLICATE_API_TOKEN) {
            await updateJob(userId, params.id, {
              status:       'upscaling',
              rawOutputUrl: rawUrl,
              progress:     82,
            });

            try {
              after(() => runEnhancementAsync(userId, params.id, rawUrl));
            } catch {
              setImmediate(() => runEnhancementAsync(userId, params.id, rawUrl));
            }

            log(TAG, `Job ${params.id} → upscaling (Replicate pipeline started in background)`);
            return NextResponse.json({ status: 'upscaling', progress: 82 });
          }

          // ── No Replicate token — skip enhancement, mark completed directly ─
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
          log(TAG, `Job ${params.id} marked completed (no enhancement), outputUrl set`);
          return NextResponse.json({ status: 'completed', progress: 100, outputUrl: rawUrl });
        }

        // Transition to compositing — original clip is on disk (local dev only)
        await updateJob(userId, params.id, {
          status:      'compositing',
          rawOutputUrl: rawUrl,
          progress:    92,
        });

        const effectType = (job as any).effectType ?? 'overlay';
        try {
          after(() => runCompositingAsync(userId, params.id, origPath!, rawUrl, job.identityAnchorPaths ?? [], effectType));
        } catch {
          setImmediate(() => runCompositingAsync(userId, params.id, origPath!, rawUrl, job.identityAnchorPaths ?? [], effectType));
        }

        return NextResponse.json({ status: 'compositing', progress: 92 });
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
    status:            job.status,
    progress:          job.progress,
    outputUrl:         job.outputUrl,
    rawOutputUrl:      job.rawOutputUrl,   // raw Runway output before compositing
    error:             job.error,
    // v2 debug fields — only included when present
    ...(job.compositingMeta    ? { compositingMeta:    job.compositingMeta    } : {}),
    ...(job.identityAnalysis   ? { identityAnalysis:   job.identityAnalysis   } : {}),
  });
}

// ─── Async compositing runner ─────────────────────────────────────────────────

async function runCompositingAsync(
  userId:        string,
  jobId:         string,
  origPath:      string,
  rawUrl:        string,
  anchorPaths:   string[],
  effectType:    'overlay' | 'background' = 'overlay',
): Promise<void> {
  const stableOutputPath = path.join(os.tmpdir(), `prysmor-output-${jobId}.mp4`);

  try {
    log(TAG, `Starting Identity Lock v2 compositing for job ${jobId}`);

    // Lazy import — compositingPipeline imports @ffmpeg-installer/ffmpeg at its top level
    // which is excluded from the Vercel bundle. Dynamic import ensures the module is only
    // loaded on local dev (where hasOrig is true and ffmpeg is available).
    const { runIdentityLockV2 } = await import('@/lib/motionforge/compositingPipeline');

    // overlay     → RAW_ACCEPT    (lighting, glow, fog — Runway handles it natively)
    // background  → FULL_SUBJECT_COMPOSITE (fireworks, winter — protect all faces)
    const { outputPath, debugMetrics, identityAnalysis } = await runIdentityLockV2(
      origPath, rawUrl, jobId, effectType,
    );

    // Move output to stable location served by /output endpoint
    fs.copyFileSync(outputPath, stableOutputPath);
    safeUnlink(outputPath);
    // Clean up the workDir if the output was in a temp working directory
    try {
      const parentDir = path.dirname(outputPath);
      if (parentDir !== os.tmpdir() && fs.existsSync(parentDir)) {
        fs.rmSync(parentDir, { recursive: true, force: true });
      }
    } catch (_) { /* non-fatal */ }

    const appBase   = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const outputUrl = `${appBase}/api/v1/motionforge/jobs/${jobId}/output`;

    // Build identity analysis snapshot for Firestore (omit heavy per-frame arrays)
    // Bug-fix [p1c]: identityAnalysis is now persisted to Firestore
    const identityAnalysisMeta = identityAnalysis
      ? {
          driftScore:            identityAnalysis.identityDriftScore,
          driftSeverity:         identityAnalysis.driftSeverity,
          similarity:            identityAnalysis.identitySimilarityScore,
          averageSimilarity:     identityAnalysis.averageSimilarity,
          comparedFrames:        identityAnalysis.comparedFrames,
          analysisMethod:        identityAnalysis.analysisMethod,
          detectorUsed:          identityAnalysis.detectorUsed,
          faceDetectedOriginal:  identityAnalysis.faceDetectedOriginal,
          faceDetectedGenerated: identityAnalysis.faceDetectedGenerated,
          warnings:              identityAnalysis.warnings.slice(0, 10), // cap array size
        }
      : undefined;

    await updateJob(userId, jobId, {
      status:   'completed',
      outputUrl,
      progress: 100,
      ...(identityAnalysisMeta ? { identityAnalysis: identityAnalysisMeta } : {}),
      compositingMeta: {
        restorationMode:        debugMetrics.restorationMode,
        analysisMethod:         debugMetrics.analysisMethod,
        detectorUsed:           debugMetrics.detectorUsed,
        averageSimilarity:      debugMetrics.averageSimilarity,
        identityDrift:          debugMetrics.identityDrift,
        comparedFrames:         debugMetrics.comparedFrames,
        segmentationProvider:   debugMetrics.segmentationProvider,
        harmonizationApplied:   debugMetrics.harmonizationApplied,
        advancedMattingApplied: debugMetrics.advancedMattingApplied,
        dynamicFaceBoxes:       debugMetrics.dynamicFaceBoxes,
        fallbacksUsed:          debugMetrics.fallbacksUsed,
        totalMs:                debugMetrics.totalMs,
      },
    });

    log(TAG, `Identity Lock v2 complete for job ${jobId}`, {
      mode:      debugMetrics.restorationMode,
      method:    debugMetrics.analysisMethod,
      detector:  debugMetrics.detectorUsed,
      similarity: debugMetrics.averageSimilarity >= 0
        ? debugMetrics.averageSimilarity.toFixed(3)
        : 'n/a',
      drift:     debugMetrics.identityDrift >= 0
        ? debugMetrics.identityDrift.toFixed(3)
        : 'n/a',
      ms:        debugMetrics.totalMs,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Compositing error';
    logError(TAG, `Identity Lock v2 failed for job ${jobId} — falling back to raw output`, err);

    // Graceful fallback: use raw Runway output
    try {
      await updateJob(userId, jobId, {
        status:    'completed',
        outputUrl: rawUrl,
        progress:  100,
        warnings:  [msg, 'identity-lock-v2-failed-used-raw-output'],
      });
    } catch (updateErr) {
      logError(TAG, `Failed to update job ${jobId} after compositing failure`, updateErr);
    }
  } finally {
    // Always clean up the original preserved clip and anchor frames
    safeUnlink(origPath);
    cleanupAnchorFrames(anchorPaths);
  }
}

// ─── Async enhancement runner (GFPGAN + WaveSpeed) ───────────────────────────

async function runEnhancementAsync(
  userId: string,
  jobId:  string,
  rawUrl: string,
): Promise<void> {
  try {
    log(TAG, `Starting enhancement pipeline (GFPGAN → WaveSpeed) for job ${jobId}`);
    console.log('[enhance] calling enhanceVideo - build timestamp:', new Date().toISOString());
    const finalUrl = await enhanceVideo(rawUrl);
    log(TAG, `Enhancement complete for job ${jobId}`, { finalUrl: finalUrl.slice(0, 100) });

    await updateJob(userId, jobId, {
      status:    'completed',
      outputUrl: finalUrl,
      progress:  100,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Enhancement error';
    warn(TAG, `Enhancement failed for job ${jobId} — falling back to raw Runway output`, { msg });

    try {
      await updateJob(userId, jobId, {
        status:    'completed',
        outputUrl: rawUrl,
        progress:  100,
        warnings:  [msg, 'enhancement-failed-used-raw-output'],
      });
    } catch (updateErr) {
      logError(TAG, `Failed to update job ${jobId} after enhancement failure`, updateErr);
    }
  }
}

// ─── Cleanup helpers ──────────────────────────────────────────────────────────

function cleanupAnchorFrames(anchorPaths: string[]): void {
  for (const p of anchorPaths) safeUnlink(p);
}
