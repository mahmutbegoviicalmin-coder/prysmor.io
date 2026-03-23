export const runtime = 'nodejs';
export const maxDuration = 120;

import { NextRequest, NextResponse }  from 'next/server';
import { getJob, updateJob }           from '@/lib/motionforge/jobs';
import {
  uploadToRunway,
  uploadImageToRunway,
  createVideoToVideoTask,
}                                      from '@/lib/motionforge/runway';
import { validatePanelKey, validatePanelToken } from '@/lib/motionforge/auth';
import { log, warn, error as logError } from '@/lib/motionforge/logger';
import { normalizeCompiled, sanitizeForRunway, classifyPromptEffect } from '@/lib/motionforge/promptCompiler';
import { getConfig }                   from '@/lib/motionforge/config';
import {
  extractIdentityAnchors,
  pickBestAnchorFrames,
  probeVideo,
  extractFrameAt,
  safeUnlink,
}                                      from '@/lib/motionforge/frameExtract';
import * as fs   from 'fs';
import * as os   from 'os';
import * as path from 'path';
import ffmpegInstaller   from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller  from '@ffprobe-installer/ffprobe';
import ffmpeg            from 'fluent-ffmpeg';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

const TAG          = 'generate';
const MAX_DURATION = 8; // seconds — non-negotiable product rule
const MAX_BYTES    = 500 * 1024 * 1024;

// ─── Upload helpers ───────────────────────────────────────────────────────────

function tmpPath(name: string): string {
  return path.join(os.tmpdir(), name);
}

function trimVideo(input: string, output: string, startSec: number): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .setStartTime(startSec)
      .setDuration(MAX_DURATION)
      .videoFilters([
        // Preserve original resolution — only enforce even dimensions for libx264
        'crop=trunc(iw/2)*2:trunc(ih/2)*2',
      ])
      .videoCodec('libx264')
      .outputOptions(['-crf 17', '-preset fast', '-pix_fmt yuv420p', '-movflags +faststart'])
      .noAudio()
      .output(output)
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err))
      .run();
  });
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

  const job = await getJob(params.id);
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  if (job.status !== 'uploading') {
    return NextResponse.json(
      { error: `Expected status "uploading", got "${job.status}"` },
      { status: 409 },
    );
  }

  const trimmedPath = job.assetUrl;
  if (!trimmedPath || !fs.existsSync(trimmedPath)) {
    await updateJob(params.id, { status: 'failed', error: 'Trimmed file not found' });
    return NextResponse.json({ error: 'Trimmed file missing — call /upload first' }, { status: 400 });
  }

  let body: { prompt?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const rawPrompt = (body.prompt || '').trim();
  if (!rawPrompt) return NextResponse.json({ error: 'prompt is required' }, { status: 400 });

  // Classify effect type BEFORE compilation so we can inject face-preservation
  // for background/environment effects and choose the right restoration mode.
  const effectType = classifyPromptEffect(rawPrompt);

  // Build the final Runway prompt:
  // 1. normalizeCompiled — adds anti-artifact prefix
  // 2. For overlay effects — append a "make it visible" enforcement suffix so
  //    Runway doesn't subtly apply the effect — it must be clearly visible.
  // 3. For background effects — append face-preservation constraint
  // 4. sanitizeForRunway — strips trademarks and banned words
  // 5. Clamp to Runway's 1000-char hard limit
  const FACE_PRESERVE =
    ' All human faces, skin, facial features, expressions, and body proportions' +
    ' must remain completely identical to the original. Do not alter any person.';

  // For overlay effects: tell Runway the effect must be clearly visible and
  // strongly rendered — not subtle. Without this, Runway tends to under-apply
  // lighting/atmospheric effects when the original video already has a look.
  const OVERLAY_ENFORCE =
    ' Apply the requested effect prominently and visibly — the transformation' +
    ' must be clearly noticeable in the output. Preserve camera framing and subject position.';

  let normalized = normalizeCompiled(rawPrompt);
  if (effectType === 'overlay') {
    normalized += OVERLAY_ENFORCE;
  } else {
    normalized += FACE_PRESERVE;
  }
  const prompt = sanitizeForRunway(normalized).slice(0, 1000);

  log(TAG, `Effect type: ${effectType} — restoration mode will be ${effectType === 'background' ? 'FULL_SUBJECT_COMPOSITE' : 'RAW_ACCEPT'}`);

  const config = getConfig();

  // Stable copy of original clip — preserved for Identity Lock v2 compositing
  const preservedVideoPath = tmpPath(`orig-${params.id}.mp4`);

  // Collected anchor frames (cleaned up in finally)
  let anchorFrames: Awaited<ReturnType<typeof extractIdentityAnchors>> = [];
  // The single reference frame uploaded to Runway for identity conditioning
  let runwayRefFramePath: string | null = null;

  try {
    const mb = (fs.statSync(trimmedPath).size / 1024 / 1024).toFixed(1);
    log(TAG, `Starting generation for job ${params.id} — clip ${mb} MB`);

    // ── 1. Preserve original clip ──────────────────────────────────────────
    fs.copyFileSync(trimmedPath, preservedVideoPath);

    // ── 2. Multi-anchor identity extraction ────────────────────────────────
    if (config.enableMultiAnchorIdentity) {
      try {
        anchorFrames = await extractIdentityAnchors(trimmedPath, config.maxAnchorFrames);
        log(TAG, `Extracted ${anchorFrames.length} identity anchor frames`);
      } catch (err) {
        warn(TAG, 'Multi-anchor extraction failed — falling back to single frame', { err: (err as Error).message });
      }
    }

    // ── 3. Pick best anchor for Runway reference image ─────────────────────
    // Use the best-quality middle anchor for Runway identity conditioning.
    // Fallback: extract the middle frame directly.
    const bestAnchors = pickBestAnchorFrames(anchorFrames);
    const midAnchor   = bestAnchors[Math.floor(bestAnchors.length / 2)];

    if (midAnchor) {
      runwayRefFramePath = midAnchor.path;
      log(TAG, `Using anchor at ${midAnchor.timestamp.toFixed(2)}s (quality: ${midAnchor.quality}) as Runway reference`);
    } else {
      // No anchors — extract middle frame directly
      warn(TAG, 'No good anchor frames — extracting middle frame as Runway reference');
      const { duration } = await probeVideo(trimmedPath);
      runwayRefFramePath = await extractFrameAt(trimmedPath, duration / 2, os.tmpdir(), 'runway-ref');
    }

    // ── 4. Upload video + reference frame to Runway ────────────────────────
    log(TAG, 'Uploading video and reference frame to Runway…');

    const [runwayUri, referenceUri] = await Promise.all([
      uploadToRunway(trimmedPath),
      runwayRefFramePath
        ? uploadImageToRunway(runwayRefFramePath).catch((e) => {
            warn(TAG, 'Reference image upload failed — continuing without it', { err: e.message });
            return undefined;
          })
        : Promise.resolve(undefined),
    ]);

    log(TAG, `Video uploaded. Reference: ${referenceUri ?? 'none'}`);

    // ── 5. Create Runway video_to_video task ───────────────────────────────
    // Pass effectType so Runway doesn't receive a reference image for overlay effects.
    // Reference images constrain Runway to "look like this frame" — for lighting/
    // particle overlays this prevents the VFX from being applied at all.
    const task = await createVideoToVideoTask(runwayUri, prompt, referenceUri, effectType);
    log(TAG, `Runway task started: ${task.id}`);

    // ── 6. Persist anchor metadata to job ──────────────────────────────────
    const anchorPaths      = anchorFrames.map(a => a.path);
    const anchorTimestamps = anchorFrames.map(a => a.timestamp);

    await updateJob(params.id, {
      status:                  'generating',
      prompt,
      effectType,              // 'overlay' | 'background' — used by poll to pick restoration mode
      runwayTaskId:            task.id,
      originalVideoPath:       preservedVideoPath,
      identityAnchorPaths:     anchorPaths,
      identityFrameTimestamps: anchorTimestamps,
      progress:                0,
    });

    return NextResponse.json({ success: true, taskId: task.id });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Generation failed';
    logError(TAG, `Generation failed for job ${params.id}`, err);
    try { if (fs.existsSync(preservedVideoPath)) fs.unlinkSync(preservedVideoPath); } catch (_) {}
    await updateJob(params.id, { status: 'failed', error: msg }).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 502 });

  } finally {
    // Clean up trimmed upload copy — preserved copy stays for compositing
    safeUnlink(trimmedPath);
    // Anchor frames themselves are kept alive for compositing and cleaned up
    // by the polling route after compositing completes.
  }
}
