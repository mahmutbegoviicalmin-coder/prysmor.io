/**
 * MotionForge Identity Lock v2 — Subject Segmentation / Matting
 *
 * Provides a pluggable subject extraction interface.
 * Primary provider: @imgly/background-removal-node
 *
 * TODO: Add a stronger provider (e.g. Segment Anything ONNX, or a cloud
 * matting API) as a second provider. Swap by setting MF_SEGMENTATION_PROVIDER
 * env var once implemented.
 *
 * All providers output: foreground PNG + greyscale alpha matte.
 * Post-processing (mask hardening, island removal, edge refinement) is applied
 * on top of any provider result.
 */

import * as fs  from 'fs';
import sharp    from 'sharp';
import { log, warn } from './logger';

const TAG = 'segmentation';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SegmentationProvider = '@imgly' | 'none';

export interface SegmentResult {
  foregroundPng: Buffer;   // RGBA PNG with transparent background
  alpha: Buffer;           // Greyscale alpha matte (PNG)
  provider: SegmentationProvider;
  confidence: number;      // 0-1, rough estimate from alpha coverage
}

export interface MattingOptions {
  /** Harden soft/feathered alpha edges into a near-binary cutout. Default: true */
  hardenAlpha?: boolean;
  /** Remove tiny floating pixel islands. Default: true */
  removeIslands?: boolean;
  /** Erode mask inward by N pixels to eliminate edge halo. Default: 0 */
  erodePixels?: number;
  /**
   * Master switch that enables or disables the full mask-refinement pipeline
   * (hardenAlpha + removeIslands + erodeAlpha).
   * Wired from config.enableAdvancedMatting.
   * When false: raw @imgly output is used without any post-processing.
   */
  enableAdvancedMatting?: boolean;
}

// ─── Alpha mask post-processing ────────────────────────────────────────────────

/**
 * Hardens a soft alpha channel into a near-binary cutout.
 * Pixels below `low`  → fully transparent (0).
 * Pixels above `high` → fully opaque (255).
 * Linear ramp in between preserves a thin natural-looking edge.
 */
async function hardenAlpha(pngBuf: Buffer, low = 55, high = 175): Promise<Buffer> {
  const { data, info } = await sharp(pngBuf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const ch = info.channels;
  for (let i = 3; i < data.length; i += ch) {
    const a = data[i];
    if      (a <= low)  data[i] = 0;
    else if (a >= high) data[i] = 255;
    else                data[i] = Math.round(((a - low) / (high - low)) * 255);
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: ch } })
    .png()
    .toBuffer();
}

/**
 * Removes tiny isolated pixel islands from an alpha mask.
 * Strategy: blur the alpha lightly, then re-threshold at a low value.
 * This is a blur-open approximation — solid regions survive, tiny specks vanish.
 */
async function removeIslands(pngBuf: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(pngBuf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const ch = info.channels;
  const alphaOnly = Buffer.alloc(info.width * info.height);
  for (let i = 0; i < alphaOnly.length; i++) alphaOnly[i] = data[i * ch + 3];

  // Blur the alpha channel — tiny islands disappear, solid areas survive
  const blurred = await sharp(alphaOnly, { raw: { width: info.width, height: info.height, channels: 1 } })
    .blur(2.5)
    .raw()
    .toBuffer();

  // Zero out any alpha pixel that blurred below 30 (tiny island threshold)
  for (let i = 0; i < blurred.length; i++) {
    if (blurred[i] < 30) data[i * ch + 3] = 0;
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: ch } })
    .png()
    .toBuffer();
}

/**
 * Erodes the alpha mask inward by approximately `pixels` pixels.
 * Implemented as a blur + threshold — shrinks the opaque region slightly
 * to avoid edge halo where the original background bleeds into the composite.
 */
async function erodeAlpha(pngBuf: Buffer, pixels: number): Promise<Buffer> {
  if (pixels <= 0) return pngBuf;

  const { data, info } = await sharp(pngBuf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const ch = info.channels;
  const alphaOnly = Buffer.alloc(info.width * info.height);
  for (let i = 0; i < alphaOnly.length; i++) alphaOnly[i] = data[i * ch + 3];

  // Erode: blur then threshold at 200 (keeps only confident opaque pixels)
  const blurRadius = Math.max(1, pixels * 0.7);
  const blurred = await sharp(alphaOnly, { raw: { width: info.width, height: info.height, channels: 1 } })
    .blur(blurRadius)
    .raw()
    .toBuffer();

  for (let i = 0; i < blurred.length; i++) {
    // After blurring, pixels near edges drop below 200 — zero them out
    data[i * ch + 3] = blurred[i] < 200 ? 0 : data[i * ch + 3];
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: ch } })
    .png()
    .toBuffer();
}

// ─── Full mask refinement ──────────────────────────────────────────────────────

/**
 * Applies the mask-refinement pipeline.
 *
 * Bug-fix: `enableAdvancedMatting` is now checked here.
 * When false (MF_ENABLE_ADVANCED_MATTING=false) the raw provider output is
 * returned immediately — no harden/removeIslands/erode passes run.
 * When true (default), the full refinement pipeline runs as before.
 */
async function refineMatte(pngBuf: Buffer, opts: MattingOptions): Promise<Buffer> {
  // Respect master advanced-matting flag
  if (opts.enableAdvancedMatting === false) {
    log(TAG, 'Advanced matting disabled — using raw provider alpha (no refinement)');
    return pngBuf;
  }

  let buf = pngBuf;

  if (opts.hardenAlpha !== false)    buf = await hardenAlpha(buf);
  if (opts.removeIslands !== false)  buf = await removeIslands(buf);
  if ((opts.erodePixels ?? 0) > 0)   buf = await erodeAlpha(buf, opts.erodePixels!);

  log(TAG, 'Advanced matting refinement applied (harden + removeIslands + erode)');
  return buf;
}

// ─── Provider: @imgly/background-removal-node ─────────────────────────────────

async function segmentWithImgly(framePath: string): Promise<Buffer | null> {
  try {
    const { removeBackground } = await import('@imgly/background-removal-node');

    const imgData = fs.readFileSync(framePath);
    const blob    = new Blob([imgData], { type: 'image/jpeg' });

    const result = await removeBackground(blob, {
      model:  'medium',
      output: { format: 'image/png', quality: 1.0, type: 'foreground' },
      // NOTE: publicPath is browser-only — do not set here
    } as Parameters<typeof removeBackground>[1]);

    const buf = Buffer.from(await result.arrayBuffer());

    // Sanity check: alpha mean < 5 means no foreground was found
    const stats = await sharp(buf).stats();
    if ((stats.channels[3]?.mean ?? 0) < 5) {
      warn(TAG, 'Background removal returned near-empty alpha — no subject found');
      return null;
    }

    return buf;
  } catch (err) {
    warn(TAG, '@imgly segmentation failed', { err: (err as Error).message });
    return null;
  }
}

// ─── Alpha matte extraction helper ────────────────────────────────────────────

async function extractAlphaMatte(pngBuf: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(pngBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const alphaData = Buffer.alloc(info.width * info.height);
  for (let i = 0; i < alphaData.length; i++) alphaData[i] = data[i * ch + 3];

  return sharp(alphaData, { raw: { width: info.width, height: info.height, channels: 1 } })
    .png()
    .toBuffer();
}

// ─── Main segmentation entrypoint ─────────────────────────────────────────────

/**
 * Segments the subject from a frame image.
 * Returns a refined foreground PNG + greyscale alpha matte, or null on failure.
 *
 * Provider chain: @imgly → (null)
 * TODO: Insert a stronger provider (SAM ONNX, cloud API) before the null fallback.
 */
export async function getSubjectMatte(
  framePath: string,
  opts: MattingOptions = {},
): Promise<SegmentResult | null> {
  // ── Primary provider: @imgly ───────────────────────────────────────────────
  const rawPng = await segmentWithImgly(framePath);

  if (rawPng) {
    log(TAG, `@imgly segmentation succeeded for ${framePath.split(/[\\/]/).pop()}`);

    const refined     = await refineMatte(rawPng, opts);
    const alpha       = await extractAlphaMatte(refined);
    const stats       = await sharp(refined).stats();
    const alphaMean   = stats.channels[3]?.mean ?? 0;
    const confidence  = Math.min(1, alphaMean / 128);

    return { foregroundPng: refined, alpha, provider: '@imgly', confidence };
  }

  // ── All providers failed ───────────────────────────────────────────────────
  warn(TAG, 'All segmentation providers failed — no subject matte available');
  return null;
}
