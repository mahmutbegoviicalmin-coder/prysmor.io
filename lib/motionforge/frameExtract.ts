/**
 * Frame extraction utilities for Identity Lock v2.
 *
 * Provides multi-anchor keyframe extraction, video metadata probing,
 * and basic quality assessment for anchor frame validation.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import ffmpegInstaller   from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller  from '@ffprobe-installer/ffprobe';
import ffmpeg            from 'fluent-ffmpeg';
import sharp             from 'sharp';
import { log, warn }     from './logger';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

const TAG = 'frameExtract';

// ─── Types ────────────────────────────────────────────────────────────────────

export type FrameQuality = 'good' | 'dark' | 'blurry' | 'unknown';

export interface FrameAnchor {
  path: string;
  timestamp: number; // seconds into the clip
  quality: FrameQuality;
}

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
}

// ─── Video probing ────────────────────────────────────────────────────────────

/** Probes a video file and returns duration, dimensions, and fps. */
export function probeVideo(videoPath: string): Promise<VideoInfo> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(videoPath, (err, meta) => {
      if (err || !meta?.format) {
        warn(TAG, 'ffprobe failed — using fallback metadata', { err: String(err) });
        return resolve({ duration: 4, width: 1280, height: 720, fps: 24 });
      }

      const duration = (meta.format.duration as number) || 4;
      const vStream  = meta.streams.find(s => s.codec_type === 'video');
      const width    = vStream?.width  ?? 1280;
      const height   = vStream?.height ?? 720;

      // Parse fps from r_frame_rate ("24/1", "30000/1001", etc.)
      let fps = 24;
      if (vStream?.r_frame_rate) {
        const [num, den] = vStream.r_frame_rate.split('/').map(Number);
        if (num && den) fps = Math.round(num / den);
      }

      resolve({ duration, width, height, fps });
    });
  });
}

// ─── Single frame extraction ───────────────────────────────────────────────────

/**
 * Extracts a single JPEG frame at the given offset from a video.
 * Returns the output path, or null on failure.
 */
export function extractFrameAt(
  videoPath: string,
  offsetSec: number,
  outputDir: string = os.tmpdir(),
  tag = '',
): Promise<string | null> {
  return new Promise((resolve) => {
    const safeSec = Math.max(0, offsetSec);
    const suffix  = tag ? `-${tag}` : '';
    const outPath = path.join(outputDir, `mf-frame${suffix}-${Date.now()}-${Math.round(safeSec * 100)}.jpg`);

    ffmpeg(videoPath)
      .setStartTime(safeSec)
      .outputOptions(['-vframes 1', '-q:v 2'])
      .output(outPath)
      .on('end',   () => resolve(outPath))
      .on('error', (e) => {
        warn(TAG, `Frame extraction at ${safeSec.toFixed(2)}s failed`, { err: e.message });
        resolve(null);
      })
      .run();
  });
}

// ─── Frame quality assessment ─────────────────────────────────────────────────

/**
 * Assesses whether a frame is usable for identity anchoring.
 * - "dark"   → luminance mean < 20 (fade-in/out, underexposed)
 * - "blurry" → luminance stdev < 8  (flat frame with little detail)
 * - "good"   → everything else
 */
async function assessFrameQuality(framePath: string): Promise<FrameQuality> {
  try {
    const stats = await sharp(framePath).greyscale().stats();
    const { mean, stdev } = stats.channels[0];
    if (mean < 20)  return 'dark';
    if (stdev < 8)  return 'blurry';
    return 'good';
  } catch {
    return 'unknown';
  }
}

// ─── Multi-anchor extraction ──────────────────────────────────────────────────

/**
 * Extracts up to `count` identity anchor frames spread across the clip.
 * Timestamps are at approximately 5%, 25%, 50%, 75%, 95% of duration.
 * Each anchor includes a quality assessment for downstream filtering.
 */
export async function extractIdentityAnchors(
  videoPath: string,
  count = 5,
): Promise<FrameAnchor[]> {
  const { duration } = await probeVideo(videoPath);
  const anchors: FrameAnchor[] = [];

  // Spread positions from 5% to 95% — avoids fade-in/out at ends
  const positions =
    count === 1
      ? [0.5]
      : Array.from({ length: count }, (_, i) => 0.05 + (i / (count - 1)) * 0.90);

  log(TAG, `Extracting ${count} anchor frames from ${duration.toFixed(2)}s clip`);

  for (let i = 0; i < positions.length; i++) {
    const ts       = Math.min(positions[i] * duration, duration - 0.1);
    const tagStr   = `anchor${i}`;
    const framePath = await extractFrameAt(videoPath, ts, os.tmpdir(), tagStr);

    if (!framePath) {
      warn(TAG, `Anchor ${i} at ${ts.toFixed(2)}s — extraction failed, skipping`);
      continue;
    }

    const quality = await assessFrameQuality(framePath);
    anchors.push({ path: framePath, timestamp: ts, quality });
    log(TAG, `Anchor ${i} → ${ts.toFixed(2)}s quality=${quality}`);
  }

  log(TAG, `Extracted ${anchors.length}/${count} anchor frames`);
  return anchors;
}

/**
 * Returns the best-quality anchor frames.
 * Priority: good > unknown > blurry > dark.
 * Always returns at least one anchor (worst-case: all dark frames).
 */
export function pickBestAnchorFrames(anchors: FrameAnchor[]): FrameAnchor[] {
  if (anchors.length === 0) return [];

  const good    = anchors.filter(a => a.quality === 'good');
  if (good.length > 0)    return good;

  const unknown = anchors.filter(a => a.quality === 'unknown');
  if (unknown.length > 0) {
    warn(TAG, 'No good-quality anchors — using unknown-quality frames');
    return unknown;
  }

  const blurry  = anchors.filter(a => a.quality === 'blurry');
  if (blurry.length > 0) {
    warn(TAG, 'No good-quality anchors — using blurry frames as fallback');
    return blurry;
  }

  warn(TAG, 'All anchor frames are dark — using them anyway as last resort');
  return anchors;
}

// ─── Bulk frame extraction ────────────────────────────────────────────────────

/**
 * Extracts all frames from a video at the given fps into a directory.
 * Returns sorted list of extracted JPEG filenames.
 */
export function extractAllFrames(
  videoPath: string,
  outDir: string,
  fps: number,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions([`-vf fps=${fps}`, '-q:v 2'])
      .output(path.join(outDir, 'frame-%04d.jpg'))
      .on('end', () => {
        const frames = fs
          .readdirSync(outDir)
          .filter(f => f.endsWith('.jpg'))
          .sort();
        resolve(frames);
      })
      .on('error', reject)
      .run();
  });
}

// ─── Cleanup helper ───────────────────────────────────────────────────────────

/** Silently deletes a file if it exists. */
export function safeUnlink(filePath: string): void {
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}
}
