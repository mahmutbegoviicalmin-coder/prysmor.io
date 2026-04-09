export const runtime    = 'nodejs';
export const maxDuration = 120;

import { NextRequest, NextResponse }  from 'next/server';
import { getJob, getJobAny, updateJob } from '@/lib/motionforge/jobs';
import {
  uploadToRunway,
  uploadImageToRunway,
  createVideoToVideoTask,
}                                      from '@/lib/motionforge/runway';
import { validatePanelKey, validatePanelToken } from '@/lib/motionforge/auth';
import { log, warn, error as logError } from '@/lib/motionforge/logger';
import { sanitizeForRunway, classifyPromptEffect } from '@/lib/motionforge/promptCompiler';
import { getConfig }                   from '@/lib/motionforge/config';
import * as fs   from 'fs';
import * as os   from 'os';
import * as path from 'path';

const TAG                 = 'generate';
const MAX_DURATION        = 8;
const RUNWAY_MAX_RATIO    = 2.358;
const ASPECT_RATIO_RE     = /aspect\s*ratio/i;
const ASPECT_RATIO_MSG    =
  'Video is too wide for AI processing. Please crop your clip to 16:9 or narrower before generating.';

function tmpPath(name: string): string {
  return path.join(os.tmpdir(), name);
}

// ─── Optional ffmpeg helpers (not available on Vercel serverless) ─────────────

async function tryExtractFrameAt(
  videoPath: string,
  atSec: number,
  outDir: string,
  label: string,
): Promise<string | null> {
  try {
    const { extractFrameAt } = await import('@/lib/motionforge/frameExtract');
    return await extractFrameAt(videoPath, atSec, outDir, label);
  } catch {
    warn(TAG, 'extractFrameAt unavailable (ffmpeg not in bundle)');
    return null;
  }
}

async function tryExtractIdentityAnchors(videoPath: string, maxFrames: number) {
  try {
    const { extractIdentityAnchors } = await import('@/lib/motionforge/frameExtract');
    return await extractIdentityAnchors(videoPath, maxFrames);
  } catch {
    warn(TAG, 'extractIdentityAnchors unavailable (ffmpeg not in bundle)');
    return [];
  }
}

async function tryProbeVideo(videoPath: string) {
  try {
    console.log(`[generate:probe] Probing video: ${videoPath}`);
    const { probeVideo } = await import('@/lib/motionforge/frameExtract');
    const result = await probeVideo(videoPath);
    console.log(`[generate:probe] Result: ${result.width}x${result.height} fps=${result.fps} duration=${result.duration.toFixed(2)}s ratio=${(result.width/result.height).toFixed(4)}`);
    return result;
  } catch (e) {
    console.error(`[generate:probe] FAILED — probe threw:`, (e as Error).message);
    return null;
  }
}

/**
 * Tries to center-crop a video so its aspect ratio fits within RUNWAY_MAX_RATIO.
 * Returns the output path on success, or null if ffmpeg is unavailable / crop fails.
 */
async function tryCropToAspectRatio(
  inputPath: string,
  outputPath: string,
  info: { width: number; height: number },
): Promise<string | null> {
  console.log(`[generate:crop] Attempting crop: ${info.width}x${info.height} → max ratio ${RUNWAY_MAX_RATIO} → output: ${outputPath}`);
  try {
    const { cropVideoToMaxAspectRatio } = await import('@/lib/motionforge/frameExtract');
    await cropVideoToMaxAspectRatio(inputPath, outputPath, info as Parameters<typeof cropVideoToMaxAspectRatio>[2]);
    const exists = (await import('fs')).existsSync(outputPath);
    const size   = exists ? (await import('fs')).statSync(outputPath).size : 0;
    console.log(`[generate:crop] SUCCESS — output exists=${exists} size=${(size/1024).toFixed(1)}KB path=${outputPath}`);
    return outputPath;
  } catch (e) {
    console.error(`[generate:crop] FAILED — crop threw:`, (e as Error).message);
    warn(TAG, 'Auto-crop failed — uploading original (may be rejected by Runway)', {
      err: (e as Error).message,
    });
    return null;
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(
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
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  if (job.status !== 'uploading') {
    return NextResponse.json(
      { error: `Expected status "uploading", got "${job.status}"` },
      { status: 409 },
    );
  }

  const userId = session?.userId ?? job.userId;

  const assetUrl = job.assetUrl as string | undefined;
  if (!assetUrl) {
    await updateJob(userId, params.id, { status: 'failed', error: 'No asset URL — call /upload first' });
    return NextResponse.json({ error: 'No asset — call /upload first' }, { status: 400 });
  }

  let body: {
    prompt?: string;
    referenceFrameBase64?: string;
    referenceFrames?: string[];
    videoWidth?: number;
    videoHeight?: number;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const rawPrompt = (body.prompt || '').trim();
  if (!rawPrompt) return NextResponse.json({ error: 'prompt is required' }, { status: 400 });

  // Early aspect ratio guard — before any job mutation, upload, or credit deduction.
  // Panel sends videoWidth/videoHeight: probed dimensions of the ffmpeg-prepared clip when
  // extraction succeeded, otherwise stored sequence dimensions from clip-load time.
  const clientW = typeof body.videoWidth  === 'number' ? body.videoWidth  : 0;
  const clientH = typeof body.videoHeight === 'number' ? body.videoHeight : 0;
  if (clientW > 0 && clientH > 0) {
    const clientRatio = clientW / clientH;
    console.log(`[generate:earlyCheck] client dimensions ${clientW}x${clientH} ratio=${clientRatio.toFixed(4)}`);
    if (clientRatio > RUNWAY_MAX_RATIO) {
      await updateJob(userId, params.id, { status: 'failed', error: ASPECT_RATIO_MSG }).catch(() => {});
      return NextResponse.json({ error: ASPECT_RATIO_MSG }, { status: 400 });
    }
  }

  const effectType = classifyPromptEffect(rawPrompt);

  // Pass the prompt through as-is — Runway Aleph sees the video directly and
  // does not need clothing/face descriptions. Just sanitize for moderation.
  const prompt = sanitizeForRunway(rawPrompt).slice(0, 1000);

  log(TAG, `Effect type: ${effectType}`);

  const config = getConfig();

  // Paths only used when assetUrl is a local file (non-Vercel / local dev)
  const preservedVideoPath = tmpPath(`orig-${params.id}.mp4`);
  let anchorFrames: { path: string; timestamp: number; quality: number }[] = [];
  let runwayRefFramePath: string | null = null;
  let localVideoPath: string | null = null;
  let croppedTmpPath:  string | null = null;

  try {
    // ── Determine runway video URI ─────────────────────────────────────────
    // If the upload route already sent the file to Runway, assetUrl is a
    // runway:// URI — use it directly. Otherwise it's a local tmp path.
    let runwayUri: string;
    // NOTE: do NOT re-declare localVideoPath here — it is declared above so
    // the finally block can clean it up. Assigning to the outer variable directly.

    if (assetUrl.startsWith('runway://')) {
      // Pre-uploaded path (Vercel / production)
      runwayUri      = assetUrl;
      localVideoPath = null;
      log(TAG, `Using pre-uploaded runway URI: ${runwayUri}`);
    } else {
      // Local dev path — file is on disk, upload it now
      if (!fs.existsSync(assetUrl)) {
        await updateJob(userId, params.id, { status: 'failed', error: 'Trimmed file not found' });
        return NextResponse.json({ error: 'Trimmed file missing — call /upload first' }, { status: 400 });
      }
      localVideoPath = assetUrl; // assign to outer-scoped var so finally can clean it up
      const mb       = (fs.statSync(assetUrl).size / 1024 / 1024).toFixed(1);
      log(TAG, `Starting generation for job ${params.id} — clip ${mb} MB`);

      fs.copyFileSync(assetUrl, preservedVideoPath);

      // ── Aspect ratio check & auto-crop (local dev / ffmpeg available) ────
      let uploadPath = assetUrl;
      console.log(`[generate:aspect] Starting aspect ratio check for: ${assetUrl}`);
      const videoMeta = await tryProbeVideo(assetUrl);
      if (!videoMeta) {
        console.warn(`[generate:aspect] probeVideo returned null — skipping crop, uploading original`);
      } else {
        const ratio = videoMeta.width / videoMeta.height;
        console.log(`[generate:aspect] ratio=${ratio.toFixed(4)} limit=${RUNWAY_MAX_RATIO} needsCrop=${ratio > RUNWAY_MAX_RATIO}`);
        if (ratio > RUNWAY_MAX_RATIO) {
          log(TAG, `Aspect ratio ${ratio.toFixed(3)} exceeds ${RUNWAY_MAX_RATIO} — center-cropping`);
          const cropDest = tmpPath(`cropped-${params.id}.mp4`);
          const cropResult = await tryCropToAspectRatio(assetUrl, cropDest, videoMeta);
          if (cropResult) {
            croppedTmpPath = cropDest;
            uploadPath = cropDest;
            console.log(`[generate:aspect] uploadPath set to CROPPED: ${uploadPath}`);
          } else {
            console.warn(`[generate:aspect] crop returned null — uploadPath stays as ORIGINAL: ${uploadPath}`);
          }
        } else {
          console.log(`[generate:aspect] ratio OK — no crop needed, uploadPath: ${uploadPath}`);
        }
      }

      // Multi-anchor identity extraction (uses ffmpeg — local dev only)
      if (config.enableMultiAnchorIdentity) {
        anchorFrames = (await tryExtractIdentityAnchors(assetUrl, config.maxAnchorFrames)) as typeof anchorFrames;
        log(TAG, `Extracted ${anchorFrames.length} identity anchor frames`);
      }

      // Pick best anchor for reference frame
      const { pickBestAnchorFrames } = await import('@/lib/motionforge/frameExtract').catch(() => ({ pickBestAnchorFrames: () => [] as typeof anchorFrames }));
      const bestAnchors = pickBestAnchorFrames(anchorFrames);
      const midAnchor   = bestAnchors[Math.floor(bestAnchors.length / 2)];

      if (midAnchor) {
        runwayRefFramePath = midAnchor.path;
      } else {
        const probe = await tryProbeVideo(assetUrl);
        if (probe) {
          runwayRefFramePath = await tryExtractFrameAt(assetUrl, probe.duration / 2, os.tmpdir(), 'runway-ref');
        }
      }

      console.log(`[generate:upload] Final uploadPath → Runway: ${uploadPath}`);
      log(TAG, 'Uploading video and reference frame to Runway…');
      const [uri, refUri] = await Promise.all([
        uploadToRunway(uploadPath),
        runwayRefFramePath
          ? uploadImageToRunway(runwayRefFramePath).catch((e) => {
              warn(TAG, 'Reference image upload failed', { err: e.message });
              return undefined;
            })
          : Promise.resolve(undefined),
      ]);
      runwayUri = uri;

      // Local dev: single anchor frame from ffmpeg identity extraction
      const localRefUris: string[] = refUri ? [refUri] : [];
      const task = await createVideoToVideoTask(runwayUri, prompt, localRefUris, effectType);
      log(TAG, `Runway task started: ${task.id}`);

      await updateJob(userId, params.id, {
        status:                  'generating',
        prompt,
        effectType,
        runwayTaskId:            task.id,
        originalVideoPath:       preservedVideoPath,
        identityAnchorPaths:     anchorFrames.map(a => a.path),
        identityFrameTimestamps: anchorFrames.map(a => a.timestamp),
        progress:                0,
      });

      return NextResponse.json({ success: true, taskId: task.id });
    }

    // ── Vercel / pre-uploaded path — no local ffmpeg ──────────────────────
    log(TAG, 'Sending pre-uploaded video to Runway (Vercel path)');

    console.log('[runway] referenceFrames received:', body.referenceFrames?.length || 0);
    console.log('[runway] refUris uploaded: 0 (skipped on Vercel path — content moderation)');
    console.log('[runway] prompt being sent:', prompt);
    console.log('[runway] effectType:', effectType);
    console.log('[runway] videoUri:', runwayUri);

    const task = await createVideoToVideoTask(runwayUri, prompt, [], effectType);
    log(TAG, `Runway task started: ${task.id}`);

    await updateJob(userId, params.id, {
      status:       'generating',
      prompt,
      effectType,
      runwayTaskId: task.id,
      progress:     0,
    });

    return NextResponse.json({ success: true, taskId: task.id });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Generation failed';
    logError(TAG, `Generation failed for job ${params.id}`, err);
    try { if (fs.existsSync(preservedVideoPath)) fs.unlinkSync(preservedVideoPath); } catch (_) {}

    // Surface Runway's aspect ratio error as a clear, actionable user message
    const userMsg = ASPECT_RATIO_RE.test(msg) ? ASPECT_RATIO_MSG : msg;
    const status  = ASPECT_RATIO_RE.test(msg) ? 400 : 502;
    await updateJob(userId, params.id, { status: 'failed', error: userMsg }).catch(() => {});
    return NextResponse.json({ error: userMsg }, { status });

  } finally {
    try { if (localVideoPath   && fs.existsSync(localVideoPath))   fs.unlinkSync(localVideoPath);   } catch (_) {}
    try { if (croppedTmpPath   && fs.existsSync(croppedTmpPath))   fs.unlinkSync(croppedTmpPath);   } catch (_) {}
    for (const f of anchorFrames) {
      try { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); } catch (_) {}
    }
  }
}
