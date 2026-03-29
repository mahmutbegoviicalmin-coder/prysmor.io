export const runtime    = 'nodejs';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { getJob, updateJob }         from '@/lib/motionforge/jobs';
import { validatePanelToken, validatePanelKey } from '@/lib/motionforge/auth';
import * as os   from 'os';
import * as path from 'path';
import * as fs   from 'fs';
import { uploadToRunway } from '@/lib/motionforge/runway';

const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500 MB
const MAX_CLIP_SEC   = 8;                  // Runway hard cap

function tmpPath(name: string) {
  return path.join(os.tmpdir(), name);
}

/**
 * Trims, strips audio, and compresses the clip with ffmpeg.
 * Returns the output path on success, or null if ffmpeg is unavailable.
 * Smaller file = faster Runway queue + faster processing.
 */
async function transcodeClip(
  inputPath:  string,
  outputPath: string,
  mediaInSec: number,
  clipDurSec: number,
): Promise<boolean> {
  try {
    const [{ default: ffmpegFn }, { default: installer }] = await Promise.all([
      import('fluent-ffmpeg'),
      import('@ffmpeg-installer/ffmpeg'),
    ]);
    ffmpegFn.setFfmpegPath(installer.path);

    const startSec = Math.max(0, mediaInSec);
    const durSec   = Math.min(clipDurSec, MAX_CLIP_SEC);

    await new Promise<void>((resolve, reject) => {
      ffmpegFn(inputPath)
        .setStartTime(startSec)
        .setDuration(durSec)
        .noAudio()
        .videoCodec('libx264')
        .outputOptions([
          '-vf', "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2",
          '-crf',    '23',
          '-preset', 'fast',
          '-movflags', '+faststart',
          '-pix_fmt', 'yuv420p',
        ])
        .on('end',   resolve)
        .on('error', reject)
        .save(outputPath);
    });

    const inMb  = (fs.statSync(inputPath).size  / 1024 / 1024).toFixed(1);
    const outMb = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
    console.log(`[upload] ffmpeg: ${inMb} MB → ${outMb} MB (start=${startSec}s dur=${durSec}s)`);
    return true;
  } catch (e) {
    console.warn('[upload] ffmpeg unavailable, uploading raw:', e instanceof Error ? e.message : e);
    return false;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await validatePanelToken(req);
  if (!session && !validatePanelKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let job;
  try {
    job = await getJob(params.id);
  } catch (e) {
    console.error('[upload] getJob failed:', e);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  if (job.status !== 'created') {
    return NextResponse.json({ error: `Job already in status "${job.status}"` }, { status: 409 });
  }

  await updateJob(params.id, { status: 'uploading' });

  const inputTmp = tmpPath(`mf-${params.id}-in.mp4`);

  try {
    const arrayBuf = await req.arrayBuffer();
    const buffer   = Buffer.from(arrayBuf);

    console.log(`[upload] Received ${buffer.byteLength} bytes for job ${params.id}`);

    if (buffer.byteLength === 0) {
      await updateJob(params.id, { status: 'failed', error: 'Empty file body' });
      return NextResponse.json({ error: 'Empty file body received' }, { status: 400 });
    }
    if (buffer.byteLength > MAX_FILE_BYTES) {
      await updateJob(params.id, { status: 'failed', error: 'File too large' });
      return NextResponse.json({ error: 'File exceeds 500 MB limit' }, { status: 413 });
    }

    // Write raw bytes to tmp
    fs.writeFileSync(inputTmp, buffer);
    console.log(`[upload] Written ${buffer.byteLength} bytes to ${inputTmp}`);

    // Read timing headers sent by the panel
    const mediaInSec  = parseFloat(req.headers.get('x-media-in')      ?? '0') || 0;
    const clipDurSec  = parseFloat(req.headers.get('x-clip-duration') ?? '8') || 8;

    // Try to transcode with ffmpeg: trim, strip audio, compress → much smaller file
    const transcodedTmp = tmpPath(`mf-${params.id}-tc.mp4`);
    const didTranscode  = await transcodeClip(inputTmp, transcodedTmp, mediaInSec, clipDurSec);
    const uploadPath    = didTranscode ? transcodedTmp : inputTmp;

    // Upload to Runway — returns a runway:// URI valid 24 h
    console.log(`[upload] Uploading to Runway (transcoded=${didTranscode})…`);
    const runwayUri = await uploadToRunway(uploadPath);
    console.log(`[upload] Runway URI: ${runwayUri}`);

    // Store the runway:// URI and timing metadata
    await updateJob(params.id, {
      assetUrl:       runwayUri,   // runway:// URI — used by generate route
      mediaInSec,
      clipDurSec,
    });

    return NextResponse.json({ success: true });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[upload] Error:', msg);
    await updateJob(params.id, { status: 'failed', error: msg }).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    try { if (fs.existsSync(inputTmp))                                  fs.unlinkSync(inputTmp);          } catch (_) {}
    try { if (fs.existsSync(tmpPath(`mf-${params.id}-tc.mp4`)))         fs.unlinkSync(tmpPath(`mf-${params.id}-tc.mp4`)); } catch (_) {}
  }
}
