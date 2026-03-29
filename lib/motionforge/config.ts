/**
 * MotionForge Identity Lock v2 — Central Configuration
 *
 * All feature flags are read from environment variables at runtime.
 * Defaults are production-safe: advanced features are ON, legacy is OFF.
 * Set MF_FORCE_LEGACY_COMPOSITE=true to roll back to v1 behaviour instantly.
 */

export type RestorationMode =
  | 'RAW_ACCEPT'            // identity preserved — keep raw Runway output
  | 'FACE_HEAD_RESTORE'     // moderate drift — restore face/head region only
  | 'UPPER_BODY_RESTORE'    // strong drift — restore upper body
  | 'FULL_SUBJECT_COMPOSITE'; // severe drift — full background-removal composite

export interface IdentityDriftThresholds {
  /** Below this → RAW_ACCEPT. Range 0-1. */
  low: number;
  /** Above this → UPPER_BODY_RESTORE or higher. Range 0-1. */
  high: number;
}

export interface FaceExpansionConfig {
  /** Fraction of face-box width to expand left/right (for head padding). */
  xMargin: number;
  /** Fraction of face-box height to expand up/down (for forehead/chin). */
  yMargin: number;
  /** Soft feather radius in pixels for zone blending. */
  featherPx: number;
}

export interface MotionForgeConfig {
  // ── Phase 1: multi-anchor identity ────────────────────────────────────────
  enableMultiAnchorIdentity: boolean;
  maxAnchorFrames: number;

  // ── Phase 2: identity scoring ──────────────────────────────────────────────
  enableIdentityScoring: boolean;
  identityDriftThresholds: IdentityDriftThresholds;

  /**
   * Grid-descriptor similarity thresholds.
   * Used when analysis method = 'grid-descriptor'.
   * Grid similarity = cosine similarity ∈ [0, 1] (higher = more similar).
   *
   * MF_DESCRIPTOR_SIMILARITY_HIGH: above this → identity preserved (RAW_ACCEPT)
   * MF_DESCRIPTOR_SIMILARITY_LOW:  below this → severe drift (UPPER_BODY or higher)
   *
   * Note: these are similarity scores, so the inequality direction is inverted
   * compared to drift thresholds. Drift = 1 − similarity.
   */
  descriptorSimilarityHigh: number;   // above → RAW_ACCEPT
  descriptorSimilarityLow:  number;   // below → UPPER_BODY_RESTORE / FULL_COMPOSITE

  // ── Phase 3: adaptive restoration ─────────────────────────────────────────
  enableAdaptiveRestoration: boolean;
  forceRestorationMode: RestorationMode | null;

  // ── Phase 4: advanced matting ──────────────────────────────────────────────
  enableAdvancedMatting: boolean;

  // ── Phase 5: harmonization ─────────────────────────────────────────────────
  enableHarmonization: boolean;
  harmonizationStrength: number; // 0-1

  // ── Face detection + region expansion ─────────────────────────────────────
  enableFaceDetection: boolean;

  /** Expansion margins applied to the raw detected face box. */
  faceRegionExpansion: FaceExpansionConfig;

  /** Maximum fraction of frame that a face patch may occupy (safety clamp). */
  maxFacePatchFrac: number;

  // ── Legacy / safety ────────────────────────────────────────────────────────
  forceLegacyComposite: boolean;

  // ── Compositing parameters ─────────────────────────────────────────────────
  compositingFps: number;
  compositingTimeoutMs: number;

  /**
   * segmentationBatchSize: intentionally not wired to parallel batching.
   * @imgly background-removal is stateful/singleton under the hood and
   * does NOT benefit from concurrency — calling it in parallel causes
   * memory spikes and model-reload races. Sequential processing is the
   * correct strategy. This value is preserved for future use if a
   * thread-safe multi-model segmentation provider is ever added.
   * Override via MF_SEG_BATCH_SIZE if you add your own provider.
   */
  segmentationBatchSize: number;
  segmentationSampleRate: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function envBool(key: string, defaultVal: boolean): boolean {
  const v = process.env[key];
  if (v === undefined) return defaultVal;
  return v === '1' || v.toLowerCase() === 'true';
}

function envFloat(key: string, defaultVal: number): number {
  const v = process.env[key];
  if (v === undefined) return defaultVal;
  const n = parseFloat(v);
  return isNaN(n) ? defaultVal : n;
}

const VALID_MODES: RestorationMode[] = [
  'RAW_ACCEPT',
  'FACE_HEAD_RESTORE',
  'UPPER_BODY_RESTORE',
  'FULL_SUBJECT_COMPOSITE',
];

// ─── Main config factory ───────────────────────────────────────────────────────

export function getConfig(): MotionForgeConfig {
  const forceMode = process.env.MF_FORCE_RESTORATION_MODE as RestorationMode | undefined;

  return {
    enableMultiAnchorIdentity:  envBool('MF_ENABLE_MULTI_ANCHOR',         true),
    maxAnchorFrames:            Math.round(envFloat('MF_MAX_ANCHOR_FRAMES', 5)),

    enableIdentityScoring:      envBool('MF_ENABLE_IDENTITY_SCORING',     true),
    identityDriftThresholds: {
      low:  envFloat('MF_DRIFT_THRESHOLD_LOW',  0.15),
      high: envFloat('MF_DRIFT_THRESHOLD_HIGH', 0.40),
    },

    // Grid-descriptor similarity thresholds (cosine similarity ∈ [0, 1])
    descriptorSimilarityHigh: envFloat('MF_DESCRIPTOR_SIMILARITY_HIGH', 0.88),
    descriptorSimilarityLow:  envFloat('MF_DESCRIPTOR_SIMILARITY_LOW',  0.72),

    enableAdaptiveRestoration:  envBool('MF_ENABLE_ADAPTIVE_RESTORATION', true),
    forceRestorationMode:       (forceMode && VALID_MODES.includes(forceMode)) ? forceMode : null,

    enableAdvancedMatting:      envBool('MF_ENABLE_ADVANCED_MATTING',     true),

    enableHarmonization:        envBool('MF_ENABLE_HARMONIZATION',        true),
    harmonizationStrength:      envFloat('MF_HARMONIZATION_STRENGTH',      0.55),

    enableFaceDetection:        envBool('MF_ENABLE_FACE_DETECTION',       true),

    faceRegionExpansion: {
      xMargin:   envFloat('MF_FACE_EXPAND_X',       0.20),
      yMargin:   envFloat('MF_FACE_EXPAND_Y',       0.25),
      featherPx: Math.round(envFloat('MF_FACE_FEATHER_PX', 28)),
    },

    maxFacePatchFrac:           envFloat('MF_MAX_FACE_PATCH_FRAC',        0.85),

    forceLegacyComposite:       envBool('MF_FORCE_LEGACY_COMPOSITE',      false),

    compositingFps:             envFloat('MF_COMPOSITING_FPS',            24),
    compositingTimeoutMs:       Math.round(envFloat('MF_COMPOSITING_TIMEOUT_MS', 90_000)),
    segmentationBatchSize:      Math.round(envFloat('MF_SEG_BATCH_SIZE',   1)),
    segmentationSampleRate:     Math.round(envFloat('MF_SEG_SAMPLE_RATE',  3)),
  };
}
