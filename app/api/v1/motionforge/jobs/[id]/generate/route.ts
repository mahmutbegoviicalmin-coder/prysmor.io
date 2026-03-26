export const runtime    = 'nodejs';
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
import * as fs   from 'fs';
import * as os   from 'os';
import * as path from 'path';

const TAG          = 'generate';
const MAX_DURATION = 8;

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
    const { probeVideo } = await import('@/lib/motionforge/frameExtract');
    return await probeVideo(videoPath);
  } catch {
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

  const job = await getJob(params.id);
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  if (job.status !== 'uploading') {
    return NextResponse.json(
      { error: `Expected status "uploading", got "${job.status}"` },
      { status: 409 },
    );
  }

  const assetUrl = job.assetUrl as string | undefined;
  if (!assetUrl) {
    await updateJob(params.id, { status: 'failed', error: 'No asset URL — call /upload first' });
    return NextResponse.json({ error: 'No asset — call /upload first' }, { status: 400 });
  }

  let body: { prompt?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const rawPrompt = (body.prompt || '').trim();
  if (!rawPrompt) return NextResponse.json({ error: 'prompt is required' }, { status: 400 });

  const effectType  = classifyPromptEffect(rawPrompt);

  const FACE_PRESERVE =
    ' All human faces, skin, facial features, expressions, and body proportions' +
    ' must remain completely identical to the original. Do not alter any person.';
  const OVERLAY_ENFORCE =
    ' Apply the requested effect prominently and visibly — the transformation' +
    ' must be clearly noticeable in the output. Preserve camera framing and subject position.';

  let normalized = normalizeCompiled(rawPrompt);
  normalized += effectType === 'overlay' ? OVERLAY_ENFORCE : FACE_PRESERVE;
  const prompt = sanitizeForRunway(normalized).slice(0, 1000);

  log(TAG, `Effect type: ${effectType}`);

  const config = getConfig();

  // Paths only used when assetUrl is a local file (non-Vercel / local dev)
  const preservedVideoPath = tmpPath(`orig-${params.id}.mp4`);
  let anchorFrames: { path: string; timestamp: number; quality: number }[] = [];
  let runwayRefFramePath: string | null = null;
  let localVideoPath: string | null = null;

  try {
    // ── Determine runway video URI ─────────────────────────────────────────
    // If the upload route already sent the file to Runway, assetUrl is a
    // runway:// URI — use it directly. Otherwise it's a local tmp path.
    let runwayUri: string;
    let localVideoPath: string | null = null;

    if (assetUrl.startsWith('runway://')) {
      // Pre-uploaded path (Vercel / production)
      runwayUri      = assetUrl;
      localVideoPath = null;
      log(TAG, `Using pre-uploaded runway URI: ${runwayUri}`);
    } else {
      // Local dev path — file is on disk, upload it now
      if (!fs.existsSync(assetUrl)) {
        await updateJob(params.id, { status: 'failed', error: 'Trimmed file not found' });
        return NextResponse.json({ error: 'Trimmed file missing — call /upload first' }, { status: 400 });
      }
      localVideoPath = assetUrl;
      const mb       = (fs.statSync(assetUrl).size / 1024 / 1024).toFixed(1);
      log(TAG, `Starting generation for job ${params.id} — clip ${mb} MB`);

      fs.copyFileSync(assetUrl, preservedVideoPath);

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

      log(TAG, 'Uploading video and reference frame to Runway…');
      const [uri, refUri] = await Promise.all([
        uploadToRunway(assetUrl),
        runwayRefFramePath
          ? uploadImageToRunway(runwayRefFramePath).catch((e) => {
              warn(TAG, 'Reference image upload failed', { err: e.message });
              return undefined;
            })
          : Promise.resolve(undefined),
      ]);
      runwayUri = uri;

      const task = await createVideoToVideoTask(runwayUri, prompt, refUri, effectType);
      log(TAG, `Runway task started: ${task.id}`);

      await updateJob(params.id, {
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

    // ── Vercel / pre-uploaded path — no local file, no ffmpeg ─────────────
    // Reference frame extraction is skipped because ffmpeg is unavailable.
    // Runway will generate without identity conditioning.
    log(TAG, 'Sending pre-uploaded video directly to Runway (no local ffmpeg)');

    const task = await createVideoToVideoTask(runwayUri, prompt, undefined, effectType);
    log(TAG, `Runway task started: ${task.id}`);

    await updateJob(params.id, {
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
    await updateJob(params.id, { status: 'failed', error: msg }).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 502 });

  } finally {
    try { if (localVideoPath && fs.existsSync(localVideoPath)) fs.unlinkSync(localVideoPath); } catch (_) {}
    for (const f of anchorFrames) {
      try { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); } catch (_) {}
    }
  }
}
