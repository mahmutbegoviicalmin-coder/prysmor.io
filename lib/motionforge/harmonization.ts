/**
 * MotionForge Identity Lock v2 — Color Harmonization
 *
 * Adjusts the composited subject's luminance and per-channel color balance
 * to better match the generated scene's lighting.
 *
 * Bug-fix: Previous version computed per-channel multipliers (rMult, gMult,
 * bMult) but only applied an overall brightness shift via sharp.modulate(),
 * discarding the per-channel information entirely.
 *
 * This version applies REAL per-channel pixel correction via raw pixel
 * processing. Both the brightness adjustment AND the R/G/B channel balance
 * are applied. Clamping keeps the result conservative to avoid
 * unnatural skin tones.
 *
 * All operations use sharp — no additional dependencies.
 */

import sharp         from 'sharp';
import { log, warn } from './logger';

const TAG = 'harmonization';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SceneStats {
  rMean: number;
  gMean: number;
  bMean: number;
  luminance: number;
  contrast: number;
}

export interface HarmonizationAdjustments {
  brightnessMult: number;
  saturationMult: number;
  rMult: number;
  gMult: number;
  bMult: number;
}

export interface HarmonizationResult {
  applied: boolean;
  subjectStats: SceneStats;
  sceneStats: SceneStats;
  adjustments: HarmonizationAdjustments;
  skipReason?: string;
}

// Clamp per-channel multipliers to prevent extreme color shifts.
// Conservative range — keeps skin tones natural.
const RATIO_MIN = 0.78;
const RATIO_MAX = 1.38;

// ─── Scene statistics ──────────────────────────────────────────────────────────

async function getSceneStats(input: Buffer | string): Promise<SceneStats> {
  const instance  = typeof input === 'string' ? sharp(input) : sharp(input);
  const stats     = await instance.removeAlpha().stats();
  const [r, g, b] = stats.channels;
  const luminance = 0.299 * r.mean + 0.587 * g.mean + 0.114 * b.mean;
  const contrast  = (r.stdev + g.stdev + b.stdev) / 3;
  return { rMean: r.mean, gMean: g.mean, bMean: b.mean, luminance, contrast };
}

// ─── Adjustment computation ────────────────────────────────────────────────────

function clampRatio(v: number): number {
  return Math.max(RATIO_MIN, Math.min(RATIO_MAX, v));
}

function computeAdjustments(
  subjectStats: SceneStats,
  sceneStats:   SceneStats,
  strength:     number,
): HarmonizationAdjustments {
  const lumRatio = sceneStats.luminance / Math.max(1, subjectStats.luminance);
  const rRaw     = sceneStats.rMean     / Math.max(1, subjectStats.rMean);
  const gRaw     = sceneStats.gMean     / Math.max(1, subjectStats.gMean);
  const bRaw     = sceneStats.bMean     / Math.max(1, subjectStats.bMean);

  // Blend toward 1.0 (no-op) by `strength` — prevents over-correction
  const blend = (raw: number) => 1 + (clampRatio(raw) - 1) * strength;

  return {
    brightnessMult: blend(lumRatio),
    saturationMult: 1.0, // kept neutral to preserve skin-tone hue
    rMult:          blend(rRaw),
    gMult:          blend(gRaw),
    bMult:          blend(bRaw),
  };
}

// ─── Real per-channel pixel correction ────────────────────────────────────────

/**
 * Applies per-channel (R, G, B) multipliers to each pixel of the subject PNG.
 * Alpha channel is preserved unchanged.
 *
 * This is a real raw-pixel operation — NOT just a `sharp.modulate()` call.
 * Result is clamped to [0, 255] per channel to avoid overexposure.
 *
 * Falls back to the input buffer if raw processing fails.
 */
async function applyPerChannelCorrection(
  subjectPng: Buffer,
  adj: HarmonizationAdjustments,
): Promise<Buffer> {
  const { data, info } = await sharp(subjectPng)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const ch = info.channels; // 4 (RGBA)

  for (let i = 0; i < data.length; i += ch) {
    data[i]     = Math.min(255, Math.max(0, Math.round(data[i]     * adj.rMult)));
    data[i + 1] = Math.min(255, Math.max(0, Math.round(data[i + 1] * adj.gMult)));
    data[i + 2] = Math.min(255, Math.max(0, Math.round(data[i + 2] * adj.bMult)));
    // data[i + 3] = alpha — preserved
  }

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: ch },
  }).png().toBuffer();
}

// ─── Main harmonization function ──────────────────────────────────────────────

/**
 * Adjusts `subjectPng` to better match the lighting of `sceneFramePath`.
 *
 * Steps:
 *   1. Compute scene statistics for subject and generated frame.
 *   2. Derive per-channel multipliers (clamped + strength-blended).
 *   3. Apply real per-channel pixel correction via raw buffer manipulation.
 *   4. Return harmonized PNG + result metadata.
 *
 * Fails gracefully — returns the original buffer on any error.
 * The `strength` parameter (0-1) controls how aggressively scene lighting
 * is applied to the subject. 0.55 is the recommended default.
 */
export async function harmonizeSubject(
  subjectPng:     Buffer,
  sceneFramePath: string | Buffer,
  strength:       number,
): Promise<{ buffer: Buffer; result: HarmonizationResult }> {
  const noOp = (
    reason:       string,
    subjectStats?: SceneStats,
    sceneStats?:   SceneStats,
  ) => ({
    buffer: subjectPng,
    result: {
      applied:      false,
      subjectStats: subjectStats ?? { rMean: 128, gMean: 128, bMean: 128, luminance: 128, contrast: 40 },
      sceneStats:   sceneStats   ?? { rMean: 128, gMean: 128, bMean: 128, luminance: 128, contrast: 40 },
      adjustments:  { brightnessMult: 1, saturationMult: 1, rMult: 1, gMult: 1, bMult: 1 },
      skipReason:   reason,
    } satisfies HarmonizationResult,
  });

  let subjectStats: SceneStats | undefined;
  let sceneStats:   SceneStats | undefined;

  try {
    [subjectStats, sceneStats] = await Promise.all([
      getSceneStats(subjectPng),
      getSceneStats(sceneFramePath),
    ]);
  } catch (err) {
    warn(TAG, 'Failed to compute scene stats', { err: (err as Error).message });
    return noOp('stats computation failed');
  }

  const adj = computeAdjustments(subjectStats, sceneStats, strength);

  // Skip if all adjustments are trivially small
  const totalDelta =
    Math.abs(adj.brightnessMult - 1) +
    Math.abs(adj.rMult - 1) +
    Math.abs(adj.gMult - 1) +
    Math.abs(adj.bMult - 1);

  if (totalDelta < 0.04) {
    log(TAG, 'Harmonization skipped — delta below threshold', {
      totalDelta: totalDelta.toFixed(4),
    });
    return noOp('delta below threshold', subjectStats, sceneStats);
  }

  try {
    // Step 1: apply real per-channel pixel correction
    const channelCorrected = await applyPerChannelCorrection(subjectPng, adj);

    // Step 2: apply overall brightness adjustment via sharp.modulate()
    // This captures any residual luminance gap not covered by per-channel pass.
    const brightnessClamp = Math.max(0.50, Math.min(2.00, adj.brightnessMult));

    const harmonized = Math.abs(brightnessClamp - 1) > 0.02
      ? await sharp(channelCorrected)
          .modulate({ brightness: brightnessClamp })
          .toBuffer()
      : channelCorrected;

    log(TAG, 'Harmonization applied (per-channel + brightness)', {
      strength:    strength.toFixed(2),
      brightness:  adj.brightnessMult.toFixed(3),
      rMult:       adj.rMult.toFixed(3),
      gMult:       adj.gMult.toFixed(3),
      bMult:       adj.bMult.toFixed(3),
      totalDelta:  totalDelta.toFixed(4),
    });

    return {
      buffer: harmonized,
      result: { applied: true, subjectStats, sceneStats, adjustments: adj },
    };

  } catch (err) {
    warn(TAG, 'Harmonization apply failed — using un-harmonized subject', {
      err: (err as Error).message,
    });
    return noOp('pixel correction failed', subjectStats, sceneStats);
  }
}
