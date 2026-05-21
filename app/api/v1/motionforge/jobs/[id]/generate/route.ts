export const runtime    = 'nodejs';
export const maxDuration = 120;

import { NextRequest, NextResponse }  from 'next/server';
import { getJob, getJobAny, updateJob } from '@/lib/motionforge/jobs';
import {
  createVideoToVideoTask,
  pickRunwayRatio,
}                                      from '@/lib/motionforge/runway';
import {
  createKieOmniVideoTask,
  pickKieAspectRatio,
}                                      from '@/lib/motionforge/kieai';
import {
  uploadToBeeble,
  createSwitchXTask,
}                                      from '@/lib/motionforge/beeble';
import { validatePanelKey, validatePanelToken } from '@/lib/motionforge/auth';
import { log, warn, error as logError } from '@/lib/motionforge/logger';
import { sanitizeForRunway } from '@/lib/motionforge/promptCompiler';
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
    await updateJob(userId, params.id, { status: 'failed', error: 'No asset URL — call /upload-url first' });
    return NextResponse.json({ error: 'No asset — call /upload-url first' }, { status: 400 });
  }

  let body: {
    prompt?:      string;
    referenceImage?: string;
    videoWidth?:  number;
    videoHeight?: number;
    clipDuration?: number;
    mode?:        string;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const rawPrompt = (body.prompt || '').trim();
  if (!rawPrompt) return NextResponse.json({ error: 'prompt is required' }, { status: 400 });

  const mode         = (body.mode ?? 'background').trim();
  const isBeebleMode = mode === 'background' || mode === 'relight';
  const isOmniMode   = mode === 'omni';
  const isRunwayMode = !isBeebleMode && !isOmniMode; // vfx + anything else → Runway

  // Plan guard for Omni mode
  if (isOmniMode && session) {
    const omniPlans = new Set(['pro', 'exclusive', 'creator', 'creator-suite']);
    if (!omniPlans.has(session.plan)) {
      return NextResponse.json(
        { error: 'Gemini Omni requires a Pro or Exclusive plan. Upgrade at prysmor.io/pricing' },
        { status: 403 },
      );
    }
  }

  if (isBeebleMode) {
    const beebleUri = (job as any).beebleVideoUri as string | undefined;
    if (!beebleUri) {
      await updateJob(userId, params.id, { status: 'failed', error: 'Asset not uploaded to Beeble — call /upload-url first' });
      return NextResponse.json({ error: 'Asset not uploaded to Beeble — call /upload-url first' }, { status: 400 });
    }
  } else if (isOmniMode && !assetUrl.startsWith('https://')) {
    await updateJob(userId, params.id, { status: 'failed', error: 'Asset not uploaded for Omni — call /upload-url first' });
    return NextResponse.json({ error: 'Asset not uploaded for Omni — call /upload-url first' }, { status: 400 });
  } else if (isRunwayMode && !assetUrl.startsWith('runway://')) {
    await updateJob(userId, params.id, { status: 'failed', error: 'Asset not uploaded to Runway — call /upload-url first' });
    return NextResponse.json({ error: 'Asset not uploaded to Runway — call /upload-url first' }, { status: 400 });
  }

  const clientW = typeof body.videoWidth  === 'number' ? body.videoWidth  : 0;
  const clientH = typeof body.videoHeight === 'number' ? body.videoHeight : 0;

  const clipDuration = typeof body.clipDuration === 'number' && body.clipDuration > 0
    ? body.clipDuration
    : 8;

  const prompt = sanitizeForRunway(rawPrompt).slice(0, 1000);

  log(TAG, `Mode: ${mode} → ${isBeebleMode ? 'Beeble' : isOmniMode ? 'KIE.AI/Omni' : 'Runway'} | asset: ${assetUrl.slice(0, 60)}`);

  const referenceImageB64 = (body.referenceImage ?? '').trim() || null;

  try {

    // ══════════════════════════════════════════════════════════════════════
    // BEEBLE PATH — background + relight
    // ══════════════════════════════════════════════════════════════════════
    if (isBeebleMode) {
      const beebleVideoUri = job.beebleVideoUri ?? assetUrl;

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
        sourceUri:         beebleVideoUri,
        referenceImageUri: beebleRefImageUri,
        prompt,
        alphaMode:         mode === 'relight' ? 'fill' : 'auto',
        maxResolution:     720,
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

    // ══════════════════════════════════════════════════════════════════════
    // KIE.AI PATH — omni mode (Pro/Exclusive only, Vercel Blob asset URL)
    // ══════════════════════════════════════════════════════════════════════
    if (isOmniMode) {
      const mediaInSec = typeof (job as any).mediaInSec === 'number'
        ? (job as any).mediaInSec as number
        : 0;

      // The uploaded asset is already the extracted/trimmed clip (starts at 0),
      // so we always pass mediaInSec=0 — NOT the original source in-point.
      const cappedDur = Math.min(clipDuration, 10);
      console.log(`[kieai] assetUrl="${assetUrl}"`);

      // Verify the blob URL is publicly accessible before sending to KIE.AI
      try {
        const headRes = await fetch(assetUrl, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
        console.log(`[kieai] HEAD ${assetUrl} → ${headRes.status} (${headRes.headers.get('content-type')}, ${headRes.headers.get('content-length')} bytes)`);
        if (!headRes.ok) {
          throw new Error(`Video URL not accessible: HEAD ${headRes.status}`);
        }
      } catch (headErr) {
        console.error(`[kieai] Video URL check failed:`, headErr);
        await updateJob(userId, params.id, { status: 'failed', error: 'Video URL is not accessible — upload may have failed' }).catch(() => {});
        return NextResponse.json({ error: 'Video URL not accessible. Please retry.' }, { status: 400 });
      }

      console.log(`[kieai] Starting Gemini Omni Video — prompt="${prompt.slice(0, 80)}" dur=${cappedDur}s dims=${clientW}x${clientH}`);

      const task = await createKieOmniVideoTask({
        videoUrl:    assetUrl,
        prompt,
        mediaInSec:  0,           // already-trimmed clip starts at 0
        clipDurSec:  cappedDur,
        videoWidth:  clientW,
        videoHeight: clientH,
        resolution:  '720p',
      });

      log(TAG, `KIE.AI task started: ${task.taskId}`);

      await updateJob(userId, params.id, {
        status:     'generating',
        prompt,
        mode,
        kieTaskId:  task.taskId,
        kieProgress: 0,
        progress:   0,
      } as any);

      return NextResponse.json({ success: true, taskId: task.taskId });
    }

    // ══════════════════════════════════════════════════════════════════════
    // RUNWAY PATH — legacy (runway:// asset URL)
    // ══════════════════════════════════════════════════════════════════════
    const runwayRatio = pickRunwayRatio(clientW, clientH);
    if (clientW > 0 && clientH > 0) {
      const clientRatio = clientW / clientH;
      console.log(`[generate:earlyCheck] client dimensions ${clientW}x${clientH} ratio=${clientRatio.toFixed(4)} → runway ratio="${runwayRatio}"`);
      if (clientRatio > RUNWAY_MAX_RATIO) {
        await updateJob(userId, params.id, { status: 'failed', error: ASPECT_RATIO_MSG }).catch(() => {});
        return NextResponse.json({ error: ASPECT_RATIO_MSG }, { status: 400 });
      }
    }

    const resolvedDuration = Math.min(Math.ceil(clipDuration), 16);

    const task = await createVideoToVideoTask(assetUrl, prompt, [], resolvedDuration, runwayRatio);
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
    const raw     = err instanceof Error ? err.message : 'Generation failed';
    const cleaned = raw.includes('API_KEY') || raw.includes('api_key')
      ? 'Generation service temporarily unavailable. Please try again.'
      : raw;
    const userMsg = ASPECT_RATIO_RE.test(cleaned) ? ASPECT_RATIO_MSG : cleaned;
    const status  = ASPECT_RATIO_RE.test(cleaned) ? 400 : 502;
    logError(TAG, `Generation failed for job ${params.id}`, err);
    await updateJob(userId, params.id, { status: 'failed', error: userMsg }).catch(() => {});
    return NextResponse.json({ error: userMsg }, { status });
  }
}
