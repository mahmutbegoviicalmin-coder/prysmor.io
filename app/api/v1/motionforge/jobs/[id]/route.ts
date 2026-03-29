import { NextRequest, NextResponse, after } from 'next/server';
import { getJob, updateJob }          from '@/lib/motionforge/jobs';
import { getRunwayTaskStatus }        from '@/lib/motionforge/runway';
import { validatePanelKey, validatePanelToken } from '@/lib/motionforge/auth';
import { log, warn, error as logError } from '@/lib/motionforge/logger';
import { refundCredits }              from '@/lib/firestore/users';
import { getConfig }                  from '@/lib/motionforge/config';
import { safeUnlink }                 from '@/lib/motionforge/frameExtract';
import { runIdentityLockV2 }          from '@/lib/motionforge/compositingPipeline';
import * as fs   from 'fs';
import * as path from 'path';
import * as os   from 'os';

export const runtime     = 'nodejs';
export const maxDuration = 30; // give Runway status API enough time to respond

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

  const job = await getJob(params.id);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

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
        await updateJob(params.id, {
          status:    'completed',
          outputUrl: fallbackUrl,
          progress:  100,
          warnings:  ['compositing-timeout-fallback-to-raw'],
        });
        return NextResponse.json({ status: 'completed', progress: 100, outputUrl: fallbackUrl });
      }
      await updateJob(params.id, { status: 'failed', error: 'Compositing timed out with no fallback URL' });
      if (job.userId && job.creditCost) {
        refundCredits(job.userId, job.creditCost).catch(e =>
          warn(TAG, `Credit refund failed for job ${params.id}`, e),
        );
      }
      return NextResponse.json({ status: 'failed', error: 'Compositing timed out' });
    }

    return NextResponse.json({ status: 'compositing', progress: job.progress ?? 95 });
  }

  // ── Poll Runway for generation status ──────────────────────────────────────
  if (job.status === 'generating' && job.runwayTaskId) {
    try {
      const task = await getRunwayTaskStatus(job.runwayTaskId);

      // ── Runway still working ─────────────────────────────────────────────
      if (task.status === 'PENDING' || task.status === 'RUNNING') {
        const progress = Math.round((task.progress ?? 0) * 100);
        log(TAG, `Runway task ${job.runwayTaskId} → ${task.status} ${progress}%`);
        return NextResponse.json({ status: 'generating', progress });
      }

      // ── Runway failed / cancelled ────────────────────────────────────────
      if (task.status === 'FAILED' || task.status === 'CANCELLED') {
        const reason = task.failure || task.failureCode || `Task ${task.status}`;
        logError(TAG, `Runway task ${job.runwayTaskId} ${task.status}`, reason);
        safeUnlink(job.originalVideoPath ?? '');
        cleanupAnchorFrames(job.identityAnchorPaths ?? []);
        await updateJob(params.id, { status: 'failed', error: reason });
        // Refund credits — Runway failed so user shouldn't be charged
        if (job.userId && job.creditCost) {
          refundCredits(job.userId, job.creditCost).catch(e =>
            warn(TAG, `Credit refund failed for job ${params.id}`, e),
          );
        }
        return NextResponse.json({ status: 'failed', error: reason });
      }

      // ── Runway succeeded ─────────────────────────────────────────────────
      if (task.status === 'SUCCEEDED' && task.output && task.output.length > 0) {
        const rawUrl  = task.output[0];
        const origPath = job.originalVideoPath;
        const hasOrig  = origPath && fs.existsSync(origPath);

        log(TAG, `Runway succeeded for job ${params.id}`, { hasOrig, rawUrl: rawUrl.slice(0, 60) });

        if (!hasOrig) {
          // No original clip — skip compositing
          log(TAG, 'No original clip available — using raw Runway output');
          await updateJob(params.id, {
            status:    'completed',
            outputUrl: rawUrl,
            rawOutputUrl: rawUrl,
            progress:  100,
          });
          return NextResponse.json({ status: 'completed', progress: 100, outputUrl: rawUrl });
        }

        // Transition to compositing immediately so panel shows progress
        await updateJob(params.id, {
          status:      'compositing',
          rawOutputUrl: rawUrl,
          progress:    92,
        });

        // Run Identity Lock v2 asynchronously — pass effectType so the pipeline
        // uses FULL_SUBJECT_COMPOSITE for background/environment effects and
        // RAW_ACCEPT for lighting/overlay effects.
        const effectType = (job as any).effectType ?? 'overlay';
        // `after()` runs after the response is sent — works on Vercel AND local dev.
        // Falls back to setImmediate if after is unavailable (older Next.js builds).
        try {
          after(() => runCompositingAsync(params.id, origPath!, rawUrl, job.identityAnchorPaths ?? [], effectType));
        } catch {
          setImmediate(() => runCompositingAsync(params.id, origPath!, rawUrl, job.identityAnchorPaths ?? [], effectType));
        }

        return NextResponse.json({ status: 'compositing', progress: 92 });
      }

      // Unexpected status
      const progress = Math.round((task.progress ?? 0) * 100);
      return NextResponse.json({ status: 'generating', progress });

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Polling error';
      warn(TAG, `Runway polling error for job ${params.id}: ${msg}`);
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
  jobId:         string,
  origPath:      string,
  rawUrl:        string,
  anchorPaths:   string[],
  effectType:    'overlay' | 'background' = 'overlay',
): Promise<void> {
  const stableOutputPath = path.join(os.tmpdir(), `prysmor-output-${jobId}.mp4`);

  try {
    log(TAG, `Starting Identity Lock v2 compositing for job ${jobId}`);

    // Pass effectType so the pipeline can pick the right restoration mode:
    //   overlay     → RAW_ACCEPT    (lighting, glow, fog — Runway handles it natively)
    //   background  → FULL_SUBJECT_COMPOSITE (fireworks, winter — protect all faces)
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

    await updateJob(jobId, {
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
      await updateJob(jobId, {
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

// ─── Cleanup helpers ──────────────────────────────────────────────────────────

function cleanupAnchorFrames(anchorPaths: string[]): void {
  for (const p of anchorPaths) safeUnlink(p);
}
