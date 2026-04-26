export const runtime    = 'nodejs';
export const maxDuration = 120;

import { NextRequest, NextResponse }  from 'next/server';
import { getJob, getJobAny, updateJob } from '@/lib/motionforge/jobs';
import {
  createVideoToVideoTask,
  pickRunwayRatio,
}                                      from '@/lib/motionforge/runway';
import {
  uploadToBeeble,
  createSwitchXTask,
}                                      from '@/lib/motionforge/beeble';
import { validatePanelKey, validatePanelToken } from '@/lib/motionforge/auth';
import { log, warn, error as logError } from '@/lib/motionforge/logger';
import { sanitizeForRunway } from '@/lib/motionforge/promptCompiler';
import * as fs   from 'fs';
import * as os   from 'os';
import * as path from 'path';

const TAG              = 'generate';
const RUNWAY_MAX_RATIO = 2.358;
const ASPECT_RATIO_RE  = /aspect\s*ratio/i;
const ASPECT_RATIO_MSG =
  'Video is too wide for AI processing. Please crop your clip to 16:9 or narrower before generating.';

function tmpPath(name: string): string {
  return path.join(os.tmpdir(), name);
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
    referenceImage?: string;
    videoWidth?: number;
    videoHeight?: number;
    clipDuration?: number;
    mode?: string;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const rawPrompt = (body.prompt || '').trim();
  if (!rawPrompt) return NextResponse.json({ error: 'prompt is required' }, { status: 400 });

  // Mode must be known before asset validation — Beeble and Runway use different URI schemes
  const mode = (body.mode ?? 'background').trim();
  console.log('[runway-refs] Mode:', mode);

  const isBeebleMode = mode === 'background' || mode === 'relight';

  // Validate that the asset was uploaded to the correct backend for this mode
  if (isBeebleMode) {
    const beebleUri = (job as any).beebleVideoUri as string | undefined;
    if (!beebleUri) {
      await updateJob(userId, params.id, { status: 'failed', error: 'Asset not uploaded to Beeble — call /upload first' });
      return NextResponse.json({ error: 'Asset not uploaded to Beeble — call /upload first' }, { status: 400 });
    }
  } else {
    if (!assetUrl.startsWith('runway://')) {
      await updateJob(userId, params.id, { status: 'failed', error: 'Asset must be pre-uploaded to Runway' });
      return NextResponse.json({ error: 'Asset must be pre-uploaded to Runway — call /upload first' }, { status: 400 });
    }
  }

  // Early aspect ratio guard — panel sends videoWidth/videoHeight from probed dimensions.
  const clientW = typeof body.videoWidth  === 'number' ? body.videoWidth  : 0;
  const clientH = typeof body.videoHeight === 'number' ? body.videoHeight : 0;
  const runwayRatio = pickRunwayRatio(clientW, clientH);
  if (clientW > 0 && clientH > 0) {
    const clientRatio = clientW / clientH;
    console.log(`[generate:earlyCheck] client dimensions ${clientW}x${clientH} ratio=${clientRatio.toFixed(4)} → runway ratio="${runwayRatio}"`);
    if (clientRatio > RUNWAY_MAX_RATIO) {
      await updateJob(userId, params.id, { status: 'failed', error: ASPECT_RATIO_MSG }).catch(() => {});
      return NextResponse.json({ error: ASPECT_RATIO_MSG }, { status: 400 });
    }
  } else {
    console.log(`[generate:earlyCheck] no client dimensions — using default runway ratio="${runwayRatio}"`);
  }
  // Clip duration sent from panel — used to request matching output length from Runway (max 16 s)
  const clipDuration = typeof body.clipDuration === 'number' && body.clipDuration > 0
    ? Math.min(Math.ceil(body.clipDuration), 16)
    : undefined;

  // Sanitize prompt for Runway moderation
  let prompt = sanitizeForRunway(rawPrompt).slice(0, 1000);

  log(TAG, `Mode: ${mode} → ${isBeebleMode ? 'Beeble SwitchX' : 'Runway'} | asset: ${assetUrl}`);

  // User-uploaded reference image (optional) — sent from panel as base64 JPEG.
  const referenceImageB64 = (body.referenceImage ?? '').trim() || null;

  try {

    // ════════════════════════════════════════════════════════════════════════
    // BEEBLE PATH — background + relight
    // ════════════════════════════════════════════════════════════════════════
    if (isBeebleMode) {
      // assetUrl is a beeble:// URI stored by /upload-complete (from beebleVideoUri)
      const beebleVideoUri = job.beebleVideoUri ?? assetUrl;

      // Upload reference image to Beeble if provided
      let beebleRefImageUri: string | undefined;
      if (referenceImageB64) {
        try {
          const refBuf = Buffer.from(referenceImageB64, 'base64');
          beebleRefImageUri = await uploadToBeeble(refBuf, `ref-image-${params.id}.jpg`);
          log(TAG, `[beeble] Reference image uploaded: ${beebleRefImageUri}`);
        } catch (e) {
          warn(TAG, '[beeble] Reference image upload failed', { err: (e as Error).message });
        }
      }

      console.log(`[beeble] Starting SwitchX — source=${beebleVideoUri} refImage=${beebleRefImageUri ?? 'none'} prompt="${prompt.slice(0, 80)}"`);

      const beebleJobId = await createSwitchXTask({
        sourceUri:          beebleVideoUri,
        referenceImageUri:  beebleRefImageUri,
        prompt,
        alphaMode:          mode === 'relight' ? 'fill' : 'auto',
        maxResolution:      720,
      });

      log(TAG, `Beeble SwitchX task started: ${beebleJobId}`);

      await updateJob(userId, params.id, {
        status:       'generating',
        prompt,
        mode,
        beebleTaskId: beebleJobId,
        progress:     0,
      } as any);

      return NextResponse.json({ success: true, taskId: beebleJobId });
    }

    // ════════════════════════════════════════════════════════════════════════
    // RUNWAY PATH — vfx only (no reference frames, no reference image)
    // ════════════════════════════════════════════════════════════════════════
    const runwayUri = assetUrl;

    console.log('[runway] prompt being sent:', prompt);
    console.log('[runway] videoUri:', runwayUri);

    const task = await createVideoToVideoTask(runwayUri, prompt, [], clipDuration, runwayRatio);
    log(TAG, `Runway task started: ${task.id}`);

    await updateJob(userId, params.id, {
      status:       'generating',
      prompt,
      mode,
      runwayTaskId: task.id,
      progress:     0,
    });

    return NextResponse.json({ success: true, taskId: task.id });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Generation failed';
    logError(TAG, `Generation failed for job ${params.id}`, err);

    // Surface Runway's aspect ratio error as a clear, actionable user message
    const userMsg = ASPECT_RATIO_RE.test(msg) ? ASPECT_RATIO_MSG : msg;
    const status  = ASPECT_RATIO_RE.test(msg) ? 400 : 502;
    await updateJob(userId, params.id, { status: 'failed', error: userMsg }).catch(() => {});
    return NextResponse.json({ error: userMsg }, { status });
  }
}
