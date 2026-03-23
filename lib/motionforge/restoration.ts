/**
 * MotionForge Identity Lock v2 — Adaptive Restoration Modes
 *
 * Determines and applies the appropriate restoration strategy based on
 * the identity drift analysis result.
 *
 * Restoration modes (in order of processing intensity):
 *   RAW_ACCEPT          — no compositing, use raw Runway output
 *   FACE_HEAD_RESTORE   — paste original face/head zone onto generated frame
 *   UPPER_BODY_RESTORE  — paste original upper-body zone onto generated frame
 *   FULL_SUBJECT_COMPOSITE — full background-removal + compositing
 *
 * FACE/UPPER modes use zone-based region blending (fast, no AI segmentation).
 * FULL mode uses the segmentation module (slower, requires @imgly).
 *
 * Bug-fix: compositeZone() and compositeZoneFromBuffer() now accept
 *   `originalFrame: string | Buffer` so the FACE_HEAD path can pass the
 *   already-harmonized buffer rather than re-reading the disk file.
 */

import sharp    from 'sharp';
import { log, warn } from './logger';
import type { IdentityAnalysis } from './identityAnalysis';
import type { MotionForgeConfig, RestorationMode } from './config';
import type { FaceBox } from './face';
import {
  faceBoxToPixelRegion,
  faceBoxToUpperBodyRegion,
} from './face';

const TAG = 'restoration';

// ─── Static zone definitions (fallback when face detection unavailable) ────────

/** Fractions of the frame dimensions used for each restoration zone. */
interface Zone {
  leftFrac:   number;
  rightFrac:  number;
  topFrac:    number;
  bottomFrac: number;
}

/** Static zones used when face detection fails or is disabled.
 *
 * These zones are deliberately CONSERVATIVE — they only cover the central
 * portion of the frame where the subject typically stands.  Background
 * effects (fireworks, vehicles, environment changes) live at the edges and
 * behind the subject and must NOT be erased by the restoration zone.
 *
 * Old values were far too large (face=70%×42%, upperBody=90%×68%) and
 * wiped out all Runway-generated background content.
 */
const STATIC_ZONES: Record<'face' | 'upperBody', Zone> = {
  face: {
    leftFrac:   0.28,   // centre 44% of width — just head, not shoulders
    rightFrac:  0.72,
    topFrac:    0.01,
    bottomFrac: 0.32,   // top 31% of height — stops ABOVE shoulders/arms
  },
  upperBody: {
    leftFrac:   0.18,   // centre 64% of width
    rightFrac:  0.82,
    topFrac:    0.0,
    bottomFrac: 0.48,   // top 48% — stops at chest, not cutting through arms
  },
};

// ─── Mode selection ────────────────────────────────────────────────────────────

/**
 * Determines the restoration mode to use based on identity analysis and config.
 *
 * Decision tree:
 *   forceRestorationMode  → forced override (testing/debug)
 *   forceLegacyComposite  → FULL_SUBJECT_COMPOSITE
 *   !enableAdaptive       → FULL_SUBJECT_COMPOSITE
 *   !faceDetectedOriginal → FULL_SUBJECT_COMPOSITE (no face found — safe default)
 *   drift low             → RAW_ACCEPT
 *   drift medium          → FACE_HEAD_RESTORE
 *   drift high            → UPPER_BODY_RESTORE
 */
export function determineRestorationMode(
  analysis: IdentityAnalysis,
  config:   MotionForgeConfig,
): RestorationMode {
  if (config.forceRestorationMode) {
    log(TAG, `Restoration mode forced to ${config.forceRestorationMode}`);
    return config.forceRestorationMode;
  }

  if (config.forceLegacyComposite) {
    log(TAG, 'Legacy composite forced via MF_FORCE_LEGACY_COMPOSITE');
    return 'FULL_SUBJECT_COMPOSITE';
  }

  if (!config.enableAdaptiveRestoration) {
    log(TAG, 'Adaptive restoration disabled — using FULL_SUBJECT_COMPOSITE');
    return 'FULL_SUBJECT_COMPOSITE';
  }

  if (!analysis.faceDetectedOriginal) {
    warn(TAG, 'Face not detected in original — defaulting to FULL_SUBJECT_COMPOSITE');
    return 'FULL_SUBJECT_COMPOSITE';
  }

  // v3 embedding system: honour direct mode suggestion when it exists
  if (analysis.suggestedRestorationMode) {
    log(TAG, `Using embedding-system suggested mode: ${analysis.suggestedRestorationMode}`, {
      method: analysis.analysisMethod,
    });
    return analysis.suggestedRestorationMode;
  }

  const { driftSeverity, identityDriftScore, analysisMethod, averageSimilarity } = analysis;

  // When the analysis fell back to heuristic and returned the default 0.5
  // similarity (indicating a failed or unreliable comparison — e.g. very dark
  // scene, no usable face descriptor), compositing does more harm than good:
  // zone boundaries cut through body parts creating visible seam artifacts.
  // Skip restoration entirely and accept the raw Runway output.
  const heuristicFailure =
    analysisMethod === 'heuristic' &&
    Math.abs(averageSimilarity - 0.5) < 0.001; // exactly the default fallback value

  if (heuristicFailure) {
    warn(TAG, 'Heuristic analysis returned default 0.5 — face comparison unreliable. Using RAW_ACCEPT to avoid compositing seam artifacts.');
    return 'RAW_ACCEPT';
  }

  const mode: RestorationMode =
    driftSeverity === 'low'    ? 'RAW_ACCEPT'          :
    driftSeverity === 'medium' ? 'FACE_HEAD_RESTORE'   :
                                 'UPPER_BODY_RESTORE';

  log(TAG, `Selected restoration mode: ${mode}`, {
    method:   analysisMethod,
    detector: analysis.detectorUsed,
    drift:    identityDriftScore.toFixed(3),
    severity: driftSeverity,
  });

  return mode;
}

// ─── Soft-mask creation ───────────────────────────────────────────────────────

/**
 * Creates a greyscale soft-edge mask for a pixel-coordinate region.
 * Full-white inside the region, fades to black at edges via Gaussian blur.
 */
async function createSoftRegionMask(
  frameW:    number,
  frameH:    number,
  left:      number,
  top:       number,
  right:     number,
  bottom:    number,
  featherPx: number = 28,
): Promise<Buffer> {
  const clLeft   = Math.max(0, Math.round(left));
  const clTop    = Math.max(0, Math.round(top));
  const clRight  = Math.min(frameW, Math.round(right));
  const clBottom = Math.min(frameH, Math.round(bottom));

  const maskData = Buffer.alloc(frameW * frameH, 0);
  for (let y = clTop; y < clBottom; y++) {
    for (let x = clLeft; x < clRight; x++) {
      maskData[y * frameW + x] = 255;
    }
  }

  return sharp(maskData, { raw: { width: frameW, height: frameH, channels: 1 } })
    .blur(Math.max(1, featherPx))
    .png()
    .toBuffer();
}

/** Derives pixel region from a static Zone definition. */
function zoneToPixelEdges(
  zone:   Zone,
  frameW: number,
  frameH: number,
) {
  return {
    left:   Math.round(frameW * zone.leftFrac),
    top:    Math.round(frameH * zone.topFrac),
    right:  Math.round(frameW * zone.rightFrac),
    bottom: Math.round(frameH * zone.bottomFrac),
  };
}

// ─── Core compositing primitive ───────────────────────────────────────────────

/**
 * Blends the original frame's region over the generated frame using a soft mask.
 *
 * BUG FIX: `originalFrame` accepts EITHER a file path OR an already-loaded
 *   Buffer. This allows FACE_HEAD_RESTORE to pass the harmonized subject buffer
 *   directly instead of re-reading the pre-harmonization file from disk.
 */
async function blendRegionOntoGenerated(
  originalFrame:    string | Buffer,
  generatedFrameBuf: Buffer,
  left:      number,
  top:       number,
  right:     number,
  bottom:    number,
  frameW:    number,
  frameH:    number,
  featherPx: number,
): Promise<Buffer> {
  const softMask = await createSoftRegionMask(frameW, frameH, left, top, right, bottom, featherPx);

  // Load original frame (accepts both path and buffer)
  const origInstance = typeof originalFrame === 'string'
    ? sharp(originalFrame)
    : sharp(originalFrame);

  const origResized = await origInstance
    .resize(frameW, frameH)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data: origData, info: origInfo } = origResized;
  const { data: maskData } = await sharp(softMask).raw().toBuffer({ resolveWithObject: true });
  const ch = origInfo.channels; // 4 (RGBA)

  // Replace alpha channel with the soft-mask value
  for (let i = 0; i < maskData.length; i++) {
    origData[i * ch + 3] = maskData[i];
  }

  const origWithMask = await sharp(origData, {
    raw: { width: origInfo.width, height: origInfo.height, channels: ch },
  }).png().toBuffer();

  return sharp(generatedFrameBuf)
    .resize(frameW, frameH)
    .composite([{ input: origWithMask, blend: 'over' }])
    .jpeg({ quality: 95 })
    .toBuffer();
}

// ─── Public: compositeZone ────────────────────────────────────────────────────

/**
 * Composites the original-frame region onto the generated frame.
 *
 * Chooses between dynamic (face-box-derived) or static zone based on
 * whether a valid `faceBox` is provided.
 *
 * @param originalFrame  - Path OR harmonized Buffer of the original frame.
 * @param generatedFrameBuf - Generated frame as Buffer.
 * @param zoneKey        - Which static zone to use if face detection failed.
 * @param frameW / frameH - Composite dimensions.
 * @param faceBox        - Detected face box (normalised 0-1); null → static zone.
 * @param featherPx      - Edge feathering in pixels.
 * @param expansionX/Y   - Fractional expansion for face-box margin.
 */
export async function compositeZone(
  originalFrame:     string | Buffer,
  generatedFrameBuf: Buffer,
  zoneKey:           'face' | 'upperBody',
  frameW:            number,
  frameH:            number,
  faceBox?:          FaceBox | null,
  featherPx:         number = 28,
  expansionX:        number = 0.20,
  expansionY:        number = 0.25,
): Promise<Buffer> {
  let left   = 0;
  let top    = 0;
  let right  = frameW;
  let bottom = frameH;
  let usingDynamic = false;

  if (faceBox) {
    try {
      if (zoneKey === 'face') {
        const reg = faceBoxToPixelRegion(faceBox, frameW, frameH, expansionX, expansionY);
        left   = reg.left;
        top    = reg.top;
        right  = reg.left + reg.width;
        bottom = reg.top  + reg.height;
      } else {
        const reg = faceBoxToUpperBodyRegion(faceBox, frameW, frameH);
        left   = reg.left;
        top    = reg.top;
        right  = reg.left + reg.width;
        bottom = reg.top  + reg.height;
      }
      usingDynamic = true;
    } catch {
      warn(TAG, 'Failed to derive dynamic zone from face box — using static zone');
    }
  }

  if (!usingDynamic) {
    const zone = STATIC_ZONES[zoneKey];
    const edges = zoneToPixelEdges(zone, frameW, frameH);
    left   = edges.left;
    top    = edges.top;
    right  = edges.right;
    bottom = edges.bottom;
  }

  log(TAG, `compositeZone(${zoneKey}): dynamic=${usingDynamic}`, {
    region: `${left},${top} → ${right},${bottom}`,
    featherPx,
  });

  return blendRegionOntoGenerated(
    originalFrame,
    generatedFrameBuf,
    left!, top!, right!, bottom!,
    frameW, frameH,
    featherPx,
  );
}

// ─── Full-subject compositing (FULL_SUBJECT_COMPOSITE mode) ───────────────────

/**
 * Composites a segmented subject foreground PNG over the generated frame.
 * Used for FULL_SUBJECT_COMPOSITE mode and as fallback for failed zone modes.
 */
export async function compositeFullSubject(
  subjectPng: Buffer,
  generatedFramePath: string | Buffer,
  frameW: number,
  frameH: number,
): Promise<Buffer> {
  const genInstance = typeof generatedFramePath === 'string'
    ? sharp(generatedFramePath)
    : sharp(generatedFramePath);

  const [genBuf, subjectResized] = await Promise.all([
    genInstance.resize(frameW, frameH).toBuffer(),
    sharp(subjectPng).resize(frameW, frameH).png().toBuffer(),
  ]);

  return sharp(genBuf)
    .composite([{ input: subjectResized, blend: 'over' }])
    .jpeg({ quality: 93 })
    .toBuffer();
}

// ─── Convenience exports ───────────────────────────────────────────────────────

/** Static zone presets (exported for reference / testing). */
export const RestoreZones = STATIC_ZONES;

export type { Zone, RestorationMode };
