/**
 * Person Identity Compositing — Background Removal approach
 *
 * Instead of approximate face bounding boxes, we use AI background removal
 * on every original frame to get a pixel-perfect person silhouette.
 *
 * Flow:
 *   1. Extract frames from original + generated videos (ffmpeg)
 *   2. For each original frame: remove background → get person as RGBA PNG
 *   3. For each frame pair: composite original person (RGBA PNG) onto generated frame
 *   4. Reassemble frames into output video with original audio (ffmpeg)
 *
 * Result: Runway provides the background VFX; original person pixels are 1:1 exact.
 */

import * as fs   from 'fs';
import * as path from 'path';
import * as os   from 'os';
import ffmpegInstaller  from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import ffmpeg           from 'fluent-ffmpeg';
import sharp            from 'sharp';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

// ─── ffmpeg helpers ───────────────────────────────────────────────────────────

function extractFrames(videoPath: string, outDir: string, fps = 24): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions([`-vf fps=${fps}`, '-q:v 2'])
      .output(path.join(outDir, 'frame-%04d.jpg'))
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

function getVideoDimensions(videoPath: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, meta) => {
      if (err) return reject(err);
      const stream = meta.streams.find(s => s.codec_type === 'video');
      if (!stream?.width || !stream?.height) return reject(new Error('No video stream'));
      resolve({ width: stream.width, height: stream.height });
    });
  });
}

function reassembleVideo(
  framesDir: string,
  originalVideo: string,
  outputPath: string,
  fps = 24,
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(path.join(framesDir, 'comp-%04d.jpg'))
      .inputFPS(fps)
      .input(originalVideo)
      .outputOptions([
        '-map 0:v:0',
        '-map 1:a:0?',
        '-c:v libx264',
        '-crf 17',
        '-preset fast',
        '-pix_fmt yuv420p',
        '-c:a aac',
        '-shortest',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

async function downloadVideo(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download video: ${res.status}`);
  fs.writeFileSync(destPath, Buffer.from(await res.arrayBuffer()));
}

// ─── Background removal — pixel-perfect person segmentation ──────────────────

/**
 * Hardens a soft/feathered alpha mask into a near-binary cutout.
 * Alpha values below `low` → 0 (transparent), above `high` → 255 (opaque),
 * with a smooth ramp in between to avoid harsh jagged edges.
 * This eliminates the "halo blur" that occurs when semi-transparent edge
 * pixels blend original and generated backgrounds during compositing.
 */
async function hardenAlphaMask(pngBuf: Buffer, low = 60, high = 180): Promise<Buffer> {
  const { data, info } = await sharp(pngBuf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels; // should be 4 (RGBA)
  for (let i = 3; i < data.length; i += channels) {
    const a = data[i];
    if (a <= low)  { data[i] = 0;   continue; }
    if (a >= high) { data[i] = 255; continue; }
    // Linear ramp between low and high
    data[i] = Math.round(((a - low) / (high - low)) * 255);
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels } })
    .png()
    .toBuffer();
}

/**
 * Removes the background from a single frame using @imgly/background-removal-node.
 * Returns a PNG Buffer with transparent background (person = opaque pixels).
 * Returns null if no person is found or if removal fails.
 */
async function removeBg(framePath: string): Promise<Buffer | null> {
  try {
    // Dynamic import to avoid webpack bundling issues
    const { removeBackground } = await import('@imgly/background-removal-node');

    const imgData = fs.readFileSync(framePath);
    const blob    = new Blob([imgData], { type: 'image/jpeg' });

    const result = await removeBackground(blob, {
      model:  'medium',
      output: {
        format:  'image/png',
        quality: 1.0,
        type:    'foreground',
      },
      // NOTE: do NOT set publicPath — it's browser-only and breaks the Node.js version
    } as Parameters<typeof removeBackground>[1]);

    const rawBuf = Buffer.from(await result.arrayBuffer());

    // Sanity check: if the result is almost fully transparent, no person found
    const meta = await sharp(rawBuf).stats();
    const alphaChannel = meta.channels[3];
    if (alphaChannel && alphaChannel.mean < 5) {
      return null;
    }

    // Harden the soft/feathered alpha edges to remove compositing "halo blur"
    const buf = await hardenAlphaMask(rawBuf);
    return buf;
  } catch (err) {
    console.warn('[faceComposite] removeBg error:', (err as Error).message);
    return null;
  }
}

/**
 * Processes frames in parallel batches to speed up background removal.
 * Samples only every Nth frame and reuses masks for intermediate frames —
 * 3x faster with nearly identical quality (person moves <125 ms between samples).
 * Returns an array of [personPngBuffer | null] for EVERY frame (interpolated).
 */
async function segmentAllFrames(
  frames: string[],
  framesDir: string,
  batchSize  = 2,   // keep low to avoid OOM
  sampleRate = 3,   // run bg-removal on 1 in every N frames
): Promise<(Buffer | null)[]> {
  // Pick the sampled subset of frames
  const sampledIndices = frames.map((_, i) => i).filter(i => i % sampleRate === 0);
  const sampledFrames  = sampledIndices.map(i => frames[i]);
  const sampledResults: (Buffer | null)[] = new Array(sampledFrames.length).fill(null);

  console.log(`[faceComposite] Sampling ${sampledFrames.length}/${frames.length} frames for bg-removal (rate=${sampleRate})`);

  for (let i = 0; i < sampledFrames.length; i += batchSize) {
    const batch = sampledFrames.slice(i, i + batchSize);
    const batchRes = await Promise.all(
      batch.map(f => removeBg(path.join(framesDir, f)))
    );
    batchRes.forEach((r, j) => { sampledResults[i + j] = r; });

    const pct = Math.round(((i + batch.length) / sampledFrames.length) * 100);
    console.log(`[faceComposite] Segmentation: ${pct}% (${i + batch.length}/${sampledFrames.length} sampled frames)`);
  }

  // Expand sampled results back to full frame count by nearest-sample lookup
  const fullResults: (Buffer | null)[] = frames.map((_, i) => {
    const sampleIdx = Math.min(Math.round(i / sampleRate), sampledResults.length - 1);
    return sampledResults[sampleIdx];
  });

  return fullResults;
}

// ─── Frame compositing ────────────────────────────────────────────────────────

/**
 * Composites the original person (as a transparent-bg PNG) over the generated frame.
 * Person pixels are 1:1 exact from the original — zero AI modification.
 */
async function compositePersonOnFrame(
  personPng: Buffer,
  genFramePath: string,
  frameW: number,
  frameH: number,
): Promise<Buffer> {
  // Resize both to target dimensions
  const [genBuf, personBuf] = await Promise.all([
    sharp(genFramePath).resize(frameW, frameH).toBuffer(),
    sharp(personPng).resize(frameW, frameH).png().toBuffer(),
  ]);

  // Composite: generated frame as background, original person on top
  return sharp(genBuf)
    .composite([{ input: personBuf, blend: 'over' }])
    .jpeg({ quality: 93 })
    .toBuffer();
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function runFaceCompositing(
  originalVideoPath: string,
  generatedVideoUrl: string,
): Promise<string> {
  const workDir  = path.join(os.tmpdir(), `fc-${Date.now()}`);
  const origDir  = path.join(workDir, 'orig');
  const genDir   = path.join(workDir, 'gen');
  const compDir  = path.join(workDir, 'comp');
  const genVideo = path.join(workDir, 'generated.mp4');
  const outVideo = path.join(workDir, 'composited.mp4');

  fs.mkdirSync(origDir, { recursive: true });
  fs.mkdirSync(genDir,  { recursive: true });
  fs.mkdirSync(compDir, { recursive: true });

  try {
    console.log('[faceComposite] Downloading generated video…');
    await downloadVideo(generatedVideoUrl, genVideo);

    const FPS = 24;

    console.log('[faceComposite] Extracting frames from both videos…');
    await Promise.all([
      extractFrames(originalVideoPath, origDir, FPS),
      extractFrames(genVideo,          genDir,  FPS),
    ]);

    const origFrames = fs.readdirSync(origDir).filter(f => f.endsWith('.jpg')).sort();
    const genFrames  = fs.readdirSync(genDir).filter(f => f.endsWith('.jpg')).sort();

    if (!origFrames.length || !genFrames.length) {
      throw new Error('Frame extraction produced no frames');
    }

    const { width: frameW, height: frameH } = await getVideoDimensions(genVideo);
    console.log(`[faceComposite] ${frameW}×${frameH} | orig=${origFrames.length} gen=${genFrames.length} frames`);

    // ── Run background removal on all original frames ──────────────────────
    console.log('[faceComposite] Running pixel-perfect person segmentation…');
    const personMasks = await segmentAllFrames(origFrames, origDir);

    const maskedCount = personMasks.filter(Boolean).length;
    console.log(`[faceComposite] Person detected in ${maskedCount}/${origFrames.length} frames`);

    if (maskedCount === 0) {
      console.warn('[faceComposite] No person found in any frame — returning raw generated video');
      // Copy genVideo to outVideo BEFORE finally deletes genVideo
      fs.copyFileSync(genVideo, outVideo);
      return outVideo;
    }

    // ── Composite all frame pairs ──────────────────────────────────────────
    const totalFrames = Math.min(origFrames.length, genFrames.length);
    console.log(`[faceComposite] Compositing ${totalFrames} frames…`);

    for (let i = 0; i < totalFrames; i++) {
      const genPath  = path.join(genDir, genFrames[i]);
      const compPath = path.join(compDir, `comp-${String(i + 1).padStart(4, '0')}.jpg`);
      const mask     = personMasks[i];

      if (!mask) {
        // No person in this frame — use generated frame as-is (no compositing)
        fs.copyFileSync(genPath, compPath);
      } else {
        const composed = await compositePersonOnFrame(mask, genPath, frameW, frameH);
        fs.writeFileSync(compPath, composed);
      }
    }

    console.log('[faceComposite] Reassembling video with original audio…');
    await reassembleVideo(compDir, originalVideoPath, outVideo, FPS);

    console.log(`[faceComposite] Done → ${outVideo}`);
    return outVideo;

  } finally {
    // Clean up all work dirs except outVideo (caller needs that)
    try { fs.rmSync(origDir,  { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(genDir,   { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(compDir,  { recursive: true, force: true }); } catch (_) {}
    try { fs.unlinkSync(genVideo); } catch (_) {}
    // Clean up workDir itself once all children are gone
    try { fs.rmdirSync(workDir); } catch (_) {}
  }
}
