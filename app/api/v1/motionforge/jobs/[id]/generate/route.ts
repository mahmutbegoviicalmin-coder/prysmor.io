export const runtime    = 'nodejs';
export const maxDuration = 120;

import { NextRequest, NextResponse }  from 'next/server';
import { getJob, getJobAny, updateJob } from '@/lib/motionforge/jobs';
import {
  uploadImageToRunway,
  createVideoToVideoTask,
}                                      from '@/lib/motionforge/runway';
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

  if (!assetUrl.startsWith('runway://')) {
    await updateJob(userId, params.id, { status: 'failed', error: 'Asset must be pre-uploaded to Runway' });
    return NextResponse.json({ error: 'Asset must be pre-uploaded to Runway — call /upload first' }, { status: 400 });
  }

  let body: {
    prompt?: string;
    referenceFrameBase64?: string;
    referenceFrames?: string[];
    videoWidth?: number;
    videoHeight?: number;
    clipDuration?: number;
    mode?: string;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const rawPrompt = (body.prompt || '').trim();
  if (!rawPrompt) return NextResponse.json({ error: 'prompt is required' }, { status: 400 });

  // Early aspect ratio guard — panel sends videoWidth/videoHeight from probed dimensions.
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

  // Mode sent from panel — drives reference frame logic
  const mode = (body.mode ?? 'background').trim();
  console.log('[runway-refs] Mode:', mode);
  // Clip duration sent from panel — used to request matching output length from Runway (max 16 s)
  const clipDuration = typeof body.clipDuration === 'number' && body.clipDuration > 0
    ? Math.min(Math.ceil(body.clipDuration), 16)
    : undefined;

  // Sanitize prompt for Runway moderation
  const prompt = sanitizeForRunway(rawPrompt).slice(0, 1000);

  log(TAG, `Mode: ${mode} — using pre-uploaded runway URI: ${assetUrl}`);

  try {
    const runwayUri = assetUrl;
    const refUris: string[] = [];

    // Panel sends reference frames as base64 JPEG strings (captured at clip-load time via ffmpeg).
    // Upload them to Runway ephemeral storage and pass as reference_images for relight/style modes.
    const rawFrames: string[] = Array.isArray(body.referenceFrames) && body.referenceFrames.length > 0
      ? body.referenceFrames
      : (body.referenceFrameBase64 ?? '').trim()
        ? [body.referenceFrameBase64!.trim()]
        : [];

    console.log('[runway-refs] Total frames received from panel:', rawFrames.length);
    const framesToUpload = rawFrames.filter(f => typeof f === 'string' && f.length > 0).slice(0, 5);
    console.log('[runway-refs] Frames after filter:', framesToUpload.length);

    console.log('[runway] referenceFrames received:', framesToUpload.length);

    if (framesToUpload.length > 0) {
      log(TAG, `Uploading ${framesToUpload.length} reference frame(s) for identity conditioning`);
      const uploadPromises = framesToUpload.map((frameB64, i) => {
        const frameTmpPath = tmpPath(`ref-frame-${params.id}-${i}.jpg`);
        return (async () => {
          try {
            fs.writeFileSync(frameTmpPath, Buffer.from(frameB64, 'base64'));
            const uri = await uploadImageToRunway(frameTmpPath);
            log(TAG, `Reference frame ${i + 1}/${framesToUpload.length} uploaded: ${uri}`);
            return uri;
          } catch (e) {
            warn(TAG, `Reference frame ${i + 1} upload failed`, { err: (e as Error).message });
            return null;
          } finally {
            try { fs.unlinkSync(frameTmpPath); } catch (_) {}
          }
        })();
      });
      const uploaded = await Promise.all(uploadPromises);
      uploaded.forEach(uri => { if (uri) refUris.push(uri); });
    }

    console.log('[runway-refs] Successfully uploaded URIs:', refUris.length);

    // relight + style → send reference frames for identity/appearance preservation
    // background + vfx → no reference frames (let Runway freely transform)
    const sendRefs   = refUris.length > 0;
    const refsToSend = sendRefs ? refUris : [];
    console.log('[runway-refs] sendRefs:', sendRefs, '— refs being sent to Runway:', refsToSend.length);
    console.log('[runway-refs] Final refs array:', JSON.stringify(refsToSend));
    console.log('[MotionForge] Mode:', mode, '— refs sent:', refsToSend.length > 0);
    console.log('[runway] refUris uploaded:', refUris.length);
    console.log('[runway] prompt being sent:', prompt);
    console.log('[runway] mode:', mode);
    console.log('[runway] videoUri:', runwayUri);

    const task = await createVideoToVideoTask(runwayUri, prompt, refsToSend, clipDuration);
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
