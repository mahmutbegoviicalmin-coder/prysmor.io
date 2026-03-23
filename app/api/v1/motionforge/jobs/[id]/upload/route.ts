export const runtime = 'nodejs';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { getJob, updateJob } from '@/lib/motionforge/jobs';
import { validatePanelToken, validatePanelKey } from '@/lib/motionforge/auth';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const MAX_DURATION_SEC = 8;
const MAX_FILE_BYTES   = 500 * 1024 * 1024;

function tmpPath(name: string) {
  return path.join(os.tmpdir(), name);
}

/**
 * Trims + re-encodes the clip while preserving the original resolution.
 * Runway works best with the source resolution — forcing 720p loses quality.
 * We only enforce even dimensions (libx264 requirement) and a safe bitrate cap.
 *
 * startSec    = mediaIn offset within the source file.
 * durationSec = how many seconds to extract (capped at MAX_DURATION_SEC).
 */
function trimVideo(input: string, output: string, startSec: number, durationSec: number = MAX_DURATION_SEC): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .setStartTime(startSec)
      .setDuration(durationSec)
      .videoFilters([
        // Force even dimensions — required by libx264, keeps original resolution
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

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // Accept either a valid panel session token OR the static panel key
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

  const inputTmp  = tmpPath(`mf-${params.id}-in.mp4`);
  const outputTmp = tmpPath(`mf-${params.id}-ready.mp4`);

  try {
    // Accept raw binary body (Content-Type: video/mp4)
    // This is more reliable in CEP environments than multipart FormData
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

    // Read mediaIn offset sent by the panel (seconds into the source file where the
    // selected region starts). Falls back to 0 if header is missing or invalid.
    const mediaInHeader  = req.headers.get('x-media-in');
    const mediaInSec     = mediaInHeader ? Math.max(0, parseFloat(mediaInHeader) || 0) : 0;

    // Read the actual clip selection duration from the panel.
    // Trim to min(MAX_DURATION_SEC, selectionDuration) so we never grab footage
    // beyond the user's selection. Without this, a 3.7s clip would produce 8s
    // of output (with black frames or foreign footage at the end).
    const clipDurHeader  = req.headers.get('x-clip-duration');
    const clipDurSec     = clipDurHeader ? Math.max(0.5, parseFloat(clipDurHeader) || MAX_DURATION_SEC) : MAX_DURATION_SEC;
    const trimDuration   = Math.min(MAX_DURATION_SEC, clipDurSec);

    console.log(`[upload] mediaIn=${mediaInSec}s clipDur=${clipDurSec}s trimTo=${trimDuration}s`);

    fs.writeFileSync(inputTmp, buffer);
    console.log(`[upload] Written to ${inputTmp}, trimming from ${mediaInSec}s for ${trimDuration}s…`);

    await trimVideo(inputTmp, outputTmp, mediaInSec, trimDuration);

    const trimmedSize = fs.statSync(outputTmp).size;
    console.log(`[upload] Trimmed → ${trimmedSize} bytes at ${outputTmp}`);

    await updateJob(params.id, { assetUrl: outputTmp });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[upload] Error:', msg);
    await updateJob(params.id, { status: 'failed', error: msg }).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    if (fs.existsSync(inputTmp)) {
      try { fs.unlinkSync(inputTmp); } catch (_) {}
    }
  }
}
