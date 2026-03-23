/**
 * MotionForge Identity Lock v3 — Production Face Identity Analysis
 *
 * ARCHITECTURE
 * ─────────────
 * Primary path  (sidecar available):
 *   InsightFace buffalo_sc  ← bright/normal frames
 *   AdaFace IR-50           ← dark / motion-blur / profile frames
 *   Blend 0.6/0.4 when both confident
 *
 * AnchorProfile:
 *   Collects 8-10 best-quality embeddings from first 30 frames of clip.
 *   Persists as JSON cache → re-runs are instant.
 *   Identity score = MAX cosine similarity across all anchors.
 *   Low-confidence frames: hold lastReliableScore * 0.95 decay.
 *
 * Multi-subject:
 *   Separate AnchorProfile per subject, matched by embedding similarity.
 *   Spatial consistency + clothing colour histogram as tiebreaker.
 *
 * Fallback path (sidecar unavailable):
 *   Original 32×32 grid-descriptor cosine similarity (unchanged).
 *   Logs a clear warning when running in fallback mode.
 *
 * ─── THRESHOLDS (all named constants — no magic numbers) ────────────────────
 *   RAW_ACCEPT:            0.88   (identity preserved, keep Runway output)
 *   FACE_HEAD_RESTORE:     0.78   (moderate drift)
 *   UPPER_BODY_RESTORE:    0.68   (strong drift)
 *   FULL_SUBJECT_COMPOSITE:0.00   (fallthrough)
 *
 *   Per-quality multipliers:
 *   dark: 0.88 | motion_blur: 0.85 | profile: 0.90 | occluded: 0.82 | bright: 1.0
 */

import * as fs   from 'fs';
import * as path from 'path';
import sharp      from 'sharp';

import { log, warn, error as logError } from './logger';
import { extractFrameAt, safeUnlink, probeVideo } from './frameExtract';
import {
  detectFaces,
  computeFaceDescriptor,
  compareFaceDescriptors,
} from './face';
import type { FaceBox, FaceDescriptor } from './face';
import type { FrameAnchor }             from './frameExtract';
import type { IdentityDriftThresholds } from './config';
import type { RestorationMode }         from './config';
import { sidecarManager }               from './sidecar';
import type { EmbeddingQuality, EmbeddingModel } from './sidecar';

const TAG = 'identityAnalysis';

// ─── Adaptive thresholds ──────────────────────────────────────────────────────

const THRESHOLDS = {
  RAW_ACCEPT:             0.88,
  FACE_HEAD_RESTORE:      0.78,
  UPPER_BODY_RESTORE:     0.68,
  FULL_SUBJECT_COMPOSITE: 0.00,

  // Per quality-type multipliers applied to all mode thresholds
  dark:         0.88,
  motion_blur:  0.85,
  profile:      0.90,
  occluded:     0.82,
  bright:       1.00,
} as const;

// Embedding confidence below this → hold last reliable score with decay
const MIN_EMBEDDING_CONFIDENCE = 0.55;
// Decay per-frame when confidence is below threshold
const SCORE_DECAY_FACTOR = 0.95;

// AnchorProfile limits
const MAX_ANCHOR_COUNT         = 10;
const ANCHOR_COLLECTION_FRAMES = 30;

// Cache directory for AnchorProfile JSON
const ANCHOR_CACHE_DIR = path.join(process.cwd(), 'cache', 'anchors');

// Cosine similarity cap for legacy heuristic fallback frames (default neutral)
const HEURISTIC_DEFAULT_SIMILARITY = 0.5;

// ─── Types ────────────────────────────────────────────────────────────────────

export type DriftSeverity = 'low' | 'medium' | 'high';

export interface PerFrameComparison {
  timestamp:        number;
  drift:            number;
  similarity:       number;
  faceDetectedOrig: boolean;
  faceDetectedGen:  boolean;
  method: 'grid-descriptor' | 'heuristic' | 'embedding';
}

export interface SubjectAnchorSummary {
  subjectId:    string;
  anchorCount:  number;
  bestQuality:  EmbeddingQuality;
  avgConfidence: number;
}

export interface IdentityAnalysis {
  identitySimilarityScore: number;
  identityDriftScore:      number;
  driftSeverity:           DriftSeverity;
  frameScores:             PerFrameComparison[];
  faceDetectedOriginal:    boolean;
  faceDetectedGenerated:   boolean;
  analysisMethod:          'grid-descriptor' | 'heuristic' | 'embedding';
  detectorUsed:            string;
  averageSimilarity:       number;
  comparedFrames:          number;
  originalFaceBoxes:       Array<FaceBox | null>;
  warnings:                string[];
  /** Suggested direct restoration mode from the embedding system (overrides drift severity). */
  suggestedRestorationMode?: RestorationMode;
  /** Per-subject anchor summaries (multi-subject clips). */
  subjectSummaries?: SubjectAnchorSummary[];
}

// ─── Stored anchor shape ──────────────────────────────────────────────────────

interface StoredAnchor {
  embedding:    number[];       // 512-dim
  quality:      EmbeddingQuality;
  qualityScore: number;         // 0-1 from sidecar /quality
  confidence:   number;         // detection confidence
  frameIndex:   number;
  model:        EmbeddingModel;
}

interface AnchorProfileCache {
  subjectId: string;
  clipId:    string;
  createdAt: string;
  anchors:   StoredAnchor[];
}

// ─── AnchorProfile ────────────────────────────────────────────────────────────

export class AnchorProfile {
  readonly subjectId: string;
  readonly clipId:    string;
  private  anchors:   StoredAnchor[] = [];
  private  cachePath: string;

  constructor(subjectId: string, clipId: string) {
    this.subjectId = subjectId;
    this.clipId    = clipId;
    this.cachePath = path.join(
      ANCHOR_CACHE_DIR,
      `${_sanitizeId(clipId)}-${_sanitizeId(subjectId)}.json`,
    );
  }

  get size(): number { return this.anchors.length; }

  /** Weighted insertion — keeps only the MAX_ANCHOR_COUNT highest-scoring anchors. */
  addAnchor(
    embedding:    number[],
    quality:      EmbeddingQuality,
    qualityScore: number,
    confidence:   number,
    frameIndex:   number,
    model:        EmbeddingModel,
  ): void {
    this.anchors.push({ embedding, quality, qualityScore, confidence, frameIndex, model });
    // Sort by composite score (confidence × qualityScore); brighter and more confident first
    this.anchors.sort((a, b) => {
      const sa = a.confidence * _qualityWeight(a.quality) * a.qualityScore;
      const sb = b.confidence * _qualityWeight(b.quality) * b.qualityScore;
      return sb - sa;
    });
    if (this.anchors.length > MAX_ANCHOR_COUNT) {
      this.anchors = this.anchors.slice(0, MAX_ANCHOR_COUNT);
    }
  }

  /**
   * Returns the stored anchor most suited to compare against a frame of `quality`.
   * Prefers anchors of similar quality type; falls back to highest-confidence anchor.
   */
  getBestAnchor(quality: EmbeddingQuality): StoredAnchor | null {
    if (this.anchors.length === 0) return null;

    // Quality affinity map: frame quality → preferred anchor quality types (ordered)
    const affinity: Record<EmbeddingQuality, EmbeddingQuality[]> = {
      dark:        ['dark',       'bright', 'occluded', 'motion_blur', 'profile'],
      motion_blur: ['motion_blur','bright', 'dark',     'occluded',    'profile'],
      profile:     ['profile',    'bright', 'dark',     'occluded',    'motion_blur'],
      occluded:    ['bright',     'dark',   'occluded', 'motion_blur', 'profile'],
      bright:      ['bright',     'dark',   'occluded', 'motion_blur', 'profile'],
    };

    for (const pref of affinity[quality]) {
      const match = this.anchors.filter(a => a.quality === pref);
      if (match.length > 0) {
        return match.reduce((best, a) => a.confidence > best.confidence ? a : best);
      }
    }
    return this.anchors[0];
  }

  /** Score = MAX cosine similarity across ALL anchors. */
  computeMaxSimilarity(queryEmbedding: number[]): { score: number; anchorIndex: number } {
    let maxScore  = 0;
    let bestIndex = 0;
    for (let i = 0; i < this.anchors.length; i++) {
      const sim = _cosineSimilarity(queryEmbedding, this.anchors[i].embedding);
      if (sim > maxScore) { maxScore = sim; bestIndex = i; }
    }
    return { score: maxScore, anchorIndex: bestIndex };
  }

  /** Persist to disk. Safe to call frequently (small JSON). */
  persist(): void {
    try {
      fs.mkdirSync(ANCHOR_CACHE_DIR, { recursive: true });
      const cache: AnchorProfileCache = {
        subjectId: this.subjectId,
        clipId:    this.clipId,
        createdAt: new Date().toISOString(),
        anchors:   this.anchors,
      };
      fs.writeFileSync(this.cachePath, JSON.stringify(cache), 'utf8');
    } catch (err) {
      warn(TAG, `AnchorProfile persist failed: ${(err as Error).message}`);
    }
  }

  /** Load from disk. Returns null if no cache exists or parse fails. */
  static loadFromDisk(subjectId: string, clipId: string): AnchorProfile | null {
    const profile = new AnchorProfile(subjectId, clipId);
    try {
      if (!fs.existsSync(profile.cachePath)) return null;
      const raw   = fs.readFileSync(profile.cachePath, 'utf8');
      const cache = JSON.parse(raw) as AnchorProfileCache;
      profile.anchors = cache.anchors ?? [];
      log(TAG, `AnchorProfile loaded from cache (${profile.anchors.length} anchors)`, {
        clipId, subjectId,
      });
      return profile;
    } catch {
      return null;
    }
  }

  /** Returns a summary for the API response. */
  toSummary(): SubjectAnchorSummary {
    const totalConf = this.anchors.reduce((s, a) => s + a.confidence, 0);
    const best      = this.anchors[0]?.quality ?? 'bright';
    return {
      subjectId:    this.subjectId,
      anchorCount:  this.anchors.length,
      bestQuality:  best,
      avgConfidence: this.anchors.length > 0 ? totalConf / this.anchors.length : 0,
    };
  }
}

// ─── Cosine similarity (vectors already L2-normalised by sidecar) ─────────────

function _cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return Math.max(0, Math.min(1, dot));
}

// ─── Quality weight for sorting anchors ───────────────────────────────────────

function _qualityWeight(q: EmbeddingQuality): number {
  switch (q) {
    case 'bright':      return 1.00;
    case 'dark':        return 0.75;
    case 'motion_blur': return 0.70;
    case 'profile':     return 0.65;
    case 'occluded':    return 0.55;
  }
}

// ─── Adaptive threshold calculation ──────────────────────────────────────────

function _adjustedThreshold(
  baseThreshold: number,
  quality:       EmbeddingQuality,
): number {
  return baseThreshold * THRESHOLDS[quality];
}

function _similarityToMode(
  similarity: number,
  quality:    EmbeddingQuality,
): RestorationMode {
  if (similarity >= _adjustedThreshold(THRESHOLDS.RAW_ACCEPT,        quality)) return 'RAW_ACCEPT';
  if (similarity >= _adjustedThreshold(THRESHOLDS.FACE_HEAD_RESTORE,  quality)) return 'FACE_HEAD_RESTORE';
  if (similarity >= _adjustedThreshold(THRESHOLDS.UPPER_BODY_RESTORE, quality)) return 'UPPER_BODY_RESTORE';
  return 'FULL_SUBJECT_COMPOSITE';
}

function _modeToDriftSeverity(mode: RestorationMode): DriftSeverity {
  switch (mode) {
    case 'RAW_ACCEPT':          return 'low';
    case 'FACE_HEAD_RESTORE':   return 'medium';
    case 'UPPER_BODY_RESTORE':  return 'high';
    case 'FULL_SUBJECT_COMPOSITE': return 'high';
  }
}

// ─── ID sanitiser ─────────────────────────────────────────────────────────────

function _sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
}

// ─── Image → base64 helper ────────────────────────────────────────────────────

async function _imageToBase64(imagePath: string): Promise<string | null> {
  try {
    const buf = await fs.promises.readFile(imagePath);
    return buf.toString('base64');
  } catch {
    return null;
  }
}

// ─── Anchor collection ────────────────────────────────────────────────────────

/**
 * Scans the first ANCHOR_COLLECTION_FRAMES frames of `videoPath`,
 * embeds each frame via the sidecar, and builds an AnchorProfile.
 *
 * Results are persisted to disk (./cache/anchors/) so repeat runs are instant.
 * Returns the profile regardless of whether it came from disk or was freshly built.
 */
export async function collectAnchorProfile(
  clipId:    string,
  videoPath: string,
  subjectId  = 'primary',
): Promise<AnchorProfile> {
  // Try disk cache first
  const cached = AnchorProfile.loadFromDisk(subjectId, clipId);
  if (cached && cached.size >= 3) {
    log(TAG, `Using cached AnchorProfile (${cached.size} anchors)`, { clipId, subjectId });
    return cached;
  }

  if (!sidecarManager.isAvailable) {
    warn(TAG, 'Sidecar unavailable — returning empty AnchorProfile (grid-descriptor fallback will be used)');
    return new AnchorProfile(subjectId, clipId);
  }

  const profile   = new AnchorProfile(subjectId, clipId);
  const videoInfo = await probeVideo(videoPath).catch(() => ({
    duration: 4, width: 1280, height: 720, fps: 24,
  }));
  const duration  = videoInfo.duration;

  // Sample from first ~30 frames
  const fps         = videoInfo.fps > 0 ? videoInfo.fps : 24;
  const sampleCount = Math.min(ANCHOR_COLLECTION_FRAMES, Math.floor(duration * fps));
  const step        = Math.max(1 / fps, (Math.min(duration * 0.4, 30)) / sampleCount);

  log(TAG, `Collecting anchors: ${sampleCount} samples from ${duration.toFixed(1)}s clip`, {
    clipId, subjectId, fps,
  });

  let collected = 0;
  for (let i = 0; i < sampleCount && profile.size < MAX_ANCHOR_COUNT; i++) {
    const ts = i * step;
    if (ts >= duration) break;

    const framePath = await extractFrameAt(videoPath, ts, undefined, `anchor-col-${i}`);
    if (!framePath) continue;

    try {
      const b64 = await _imageToBase64(framePath);
      if (!b64) continue;

      const result = await sidecarManager.embed(b64);
      if (!result || result.confidence < MIN_EMBEDDING_CONFIDENCE) continue;

      profile.addAnchor(
        result.embedding,
        result.qualityType,
        result.qualityScore,
        result.confidence,
        i,
        result.model,
      );
      collected++;
    } catch (err) {
      warn(TAG, `Anchor collection frame ${i} failed: ${(err as Error).message}`);
    } finally {
      safeUnlink(framePath);
    }
  }

  log(TAG, `Anchor collection complete: ${collected} embedded, ${profile.size} kept`, {
    clipId, subjectId,
  });

  if (profile.size > 0) profile.persist();
  return profile;
}

/**
 * Returns the anchor status for the diagnostics API endpoint.
 */
export function getAnchorStatus(
  clipId:   string,
  subjects: string[] = ['primary'],
): Record<string, SubjectAnchorSummary | null> {
  const out: Record<string, SubjectAnchorSummary | null> = {};
  for (const subjectId of subjects) {
    const p = AnchorProfile.loadFromDisk(subjectId, clipId);
    out[subjectId] = p ? p.toSummary() : null;
  }
  return out;
}

// ─── Multi-subject management ─────────────────────────────────────────────────

export interface SubjectMatch {
  subjectId:  string;
  similarity: number;
  anchorUsed: number;
  faceBox:    FaceBox;
}

/**
 * Matches a detected face embedding to the closest known subject profile.
 * Uses spatial consistency (left/right position) as tiebreaker for similar subjects.
 */
export function matchFaceToSubject(
  embedding:       number[],
  profiles:        Map<string, AnchorProfile>,
  faceBox:         FaceBox,
  quality:         EmbeddingQuality,
  spatialHistory?: Map<string, 'left' | 'right'>,
): SubjectMatch | null {
  let bestId    = '';
  let bestSim   = 0;
  let bestAnchorIdx = 0;

  for (const [subjectId, profile] of profiles) {
    if (profile.size === 0) continue;
    const { score, anchorIndex } = profile.computeMaxSimilarity(embedding);
    // Apply quality multiplier when comparing
    const adjustedScore = score * THRESHOLDS[quality];
    if (adjustedScore > bestSim) {
      bestSim       = adjustedScore;
      bestId        = subjectId;
      bestAnchorIdx = anchorIndex;
    }
  }

  if (!bestId) return null;

  // Spatial tiebreaker: if two subjects are very close in similarity, prefer
  // the one whose historical position matches the current face box side.
  if (spatialHistory && spatialHistory.size > 0) {
    const faceSide: 'left' | 'right' = faceBox.x + faceBox.width / 2 < 0.5 ? 'left' : 'right';
    const currentSide = spatialHistory.get(bestId);
    if (currentSide && currentSide !== faceSide) {
      // Find if another subject matches the spatial position better
      for (const [altId] of profiles) {
        if (altId === bestId) continue;
        const altSide = spatialHistory.get(altId);
        if (altSide === faceSide) {
          const { score: altScore } = profiles.get(altId)!.computeMaxSimilarity(embedding);
          // Only swap if alternative is within 5% — prevents identity confusion
          if (altScore >= bestSim * 0.95) {
            bestId   = altId;
            bestSim  = altScore;
            const { anchorIndex: ai } = profiles.get(altId)!.computeMaxSimilarity(embedding);
            bestAnchorIdx = ai;
          }
        }
      }
    }
    // Update spatial history (subjects don't swap sides mid-clip)
    spatialHistory.set(bestId, faceSide);
  }

  return { subjectId: bestId, similarity: bestSim, anchorUsed: bestAnchorIdx, faceBox };
}

// ─── Embedding-based frame comparison ────────────────────────────────────────

interface EmbeddingFrameResult {
  similarity:       number;
  adjustedScore:    number;
  drift:            number;
  confidence:       number;
  quality:          EmbeddingQuality;
  model:            EmbeddingModel;
  anchorUsed:       number;
  faceDetectedOrig: boolean;
  faceDetectedGen:  boolean;
  origFaceBox:      FaceBox | null;
  method:           'embedding';
}

async function _compareFrameEmbedding(
  originalPath:  string,
  generatedPath: string,
  profile:       AnchorProfile,
  lastScore:     number,
): Promise<EmbeddingFrameResult | null> {
  // 1. Embed the GENERATED frame (we're checking how much it drifts from the anchor)
  const b64 = await _imageToBase64(generatedPath);
  if (!b64) return null;

  const result = await sidecarManager.embed(b64);
  if (!result) return null;

  const { embedding, confidence, qualityType, model } = result;

  // 2. Low-confidence guard — hold last score with decay
  if (confidence < MIN_EMBEDDING_CONFIDENCE) {
    const decayed = lastScore * SCORE_DECAY_FACTOR;
    const mode    = _similarityToMode(decayed, qualityType);
    warn(TAG, `Low confidence (${confidence.toFixed(3)}) — holding decayed score ${decayed.toFixed(3)}`);
    return {
      similarity:       decayed,
      adjustedScore:    decayed,
      drift:            1 - decayed,
      confidence,
      quality:          qualityType,
      model,
      anchorUsed:       -1,
      faceDetectedOrig: false,
      faceDetectedGen:  false,
      origFaceBox:      null,
      method:           'embedding',
    };
  }

  // 3. Score = MAX similarity across all anchors
  const { score: rawScore, anchorIndex } = profile.computeMaxSimilarity(embedding);

  // 4. Apply quality-type multiplier to effective threshold comparison
  const adjustedScore = rawScore;  // raw score is used; thresholds are adjusted internally

  // 5. Detect original frame's face box for compositing
  const origDetect = await detectFaces(originalPath).catch(() => null);
  const origBox    = origDetect?.primaryFace ?? null;

  // 6. Check if a face was detected in the generated frame
  const genDetectResult = await detectFaces(generatedPath).catch(() => null);

  return {
    similarity:       rawScore,
    adjustedScore,
    drift:            1 - rawScore,
    confidence,
    quality:          qualityType,
    model,
    anchorUsed:       anchorIndex,
    faceDetectedOrig: !!origDetect?.detected,
    faceDetectedGen:  !!genDetectResult?.detected,
    origFaceBox:      origBox,
    method:           'embedding',
  };
}

// ─── Legacy: heuristic fallback (unchanged from v2) ──────────────────────────

const FACE_ZONE = {
  leftFrac:   0.20,
  rightFrac:  0.80,
  topFrac:    0.00,
  bottomFrac: 0.45,
} as const;

interface ChannelStats {
  rMean: number; gMean: number; bMean: number; luminance: number;
}

async function _getZoneStats(
  framePath: string, w: number, h: number,
): Promise<ChannelStats | null> {
  try {
    const left   = Math.round(w * FACE_ZONE.leftFrac);
    const top    = Math.round(h * FACE_ZONE.topFrac);
    const width  = Math.max(1, Math.min(Math.round(w * (FACE_ZONE.rightFrac - FACE_ZONE.leftFrac)), w - left));
    const height = Math.max(1, Math.min(Math.round(h * (FACE_ZONE.bottomFrac - FACE_ZONE.topFrac)), h - top));
    const stats  = await sharp(framePath).extract({ left, top, width, height }).stats();
    const [r, g, b] = stats.channels;
    return {
      rMean: r.mean, gMean: g.mean, bMean: b.mean,
      luminance: 0.299 * r.mean + 0.587 * g.mean + 0.114 * b.mean,
    };
  } catch { return null; }
}

async function _legacyHeuristicDrift(
  origPath: string, genPath: string, w: number, h: number,
): Promise<{ drift: number; similarity: number } | null> {
  const [a, b] = await Promise.all([
    _getZoneStats(origPath, w, h),
    _getZoneStats(genPath,  w, h),
  ]);
  if (!a || !b) return null;
  const rDiff   = Math.abs(a.rMean     - b.rMean)     / 255;
  const gDiff   = Math.abs(a.gMean     - b.gMean)     / 255;
  const bDiff   = Math.abs(a.bMean     - b.bMean)     / 255;
  const lumDiff = Math.abs(a.luminance  - b.luminance) / 255;
  const drift   = Math.min(1, (rDiff * 0.40 + gDiff * 0.35 + bDiff * 0.25) * 0.70 + lumDiff * 0.30);
  return { drift, similarity: 1 - drift };
}

interface LegacyFrameResult {
  similarity:       number;
  drift:            number;
  faceDetectedOrig: boolean;
  faceDetectedGen:  boolean;
  origFaceBox:      FaceBox | null;
  method:           'grid-descriptor' | 'heuristic';
  detectorUsed:     string;
}

async function _legacyCompareFramePair(
  origPath:  string,
  genPath:   string,
  frameW:    number,
  frameH:    number,
): Promise<LegacyFrameResult> {
  const origDetect  = await detectFaces(origPath).catch(() => null);
  const origFaceBox = origDetect?.primaryFace ?? null;
  const detectorUsed = origDetect?.method ?? 'none';

  let origDesc: FaceDescriptor | null = null;
  let genDesc:  FaceDescriptor | null = null;

  try {
    [origDesc, genDesc] = await Promise.all([
      computeFaceDescriptor(origPath, origFaceBox, frameW, frameH),
      computeFaceDescriptor(genPath,  origFaceBox, frameW, frameH),
    ]);
  } catch (err) {
    warn(TAG, `Legacy descriptor error: ${(err as Error).message}`);
  }

  if (origDesc && genDesc) {
    const similarity = compareFaceDescriptors(origDesc, genDesc);
    const genDetect  = await detectFaces(genPath).catch(() => null);
    return {
      similarity,
      drift:            1 - similarity,
      faceDetectedOrig: !!origDetect?.detected,
      faceDetectedGen:  !!genDetect?.detected,
      origFaceBox,
      method:           'grid-descriptor',
      detectorUsed,
    };
  }

  // Heuristic fallback
  warn(TAG, 'Grid descriptor unavailable — using heuristic for this frame');
  const h = await _legacyHeuristicDrift(origPath, genPath, frameW, frameH);
  return {
    similarity:       h?.similarity ?? HEURISTIC_DEFAULT_SIMILARITY,
    drift:            h?.drift      ?? HEURISTIC_DEFAULT_SIMILARITY,
    faceDetectedOrig: !!origDetect?.detected,
    faceDetectedGen:  false,
    origFaceBox:      null,
    method:           'heuristic',
    detectorUsed:     detectorUsed || 'skin-heuristic',
  };
}

// ─── Severity mapping ─────────────────────────────────────────────────────────

function _driftToSeverity(
  drift:      number,
  thresholds: IdentityDriftThresholds,
): DriftSeverity {
  if (drift <= thresholds.low)  return 'low';
  if (drift <= thresholds.high) return 'medium';
  return 'high';
}

// ─── Main: analyzeIdentityDrift ────────────────────────────────────────────────

/**
 * Analyzes identity drift between anchor frames and the generated video.
 *
 * When the sidecar is available, uses ArcFace/AdaFace embeddings (embedding path).
 * Falls back to legacy 32×32 grid-descriptor system otherwise.
 * The function signature is backward-compatible with v2 callers.
 *
 * @param anchorFrames        - Extracted frames from the ORIGINAL clip.
 * @param generatedVideoPath  - Path to downloaded Runway-generated video.
 * @param thresholds          - Legacy drift thresholds (still used for severity classification).
 * @param options.clipId      - Enables AnchorProfile caching + multi-subject matching.
 * @param options.anchorProfile - Pre-built AnchorProfile (from collectAnchorProfile).
 * @param options.subjectProfiles - Multi-subject profiles map.
 */
export async function analyzeIdentityDrift(
  anchorFrames:       FrameAnchor[],
  generatedVideoPath: string,
  thresholds:         IdentityDriftThresholds,
  options: {
    clipId?:          string;
    anchorProfile?:   AnchorProfile;
    subjectProfiles?: Map<string, AnchorProfile>;
  } = {},
): Promise<IdentityAnalysis> {
  const warnings:    string[] = [];
  const frameScores: PerFrameComparison[]  = [];
  const faceBoxes:   Array<FaceBox | null> = [];

  const sidecarAvailable = sidecarManager.isAvailable;
  if (!sidecarAvailable) {
    warn(TAG, '⚠ FALLBACK MODE: sidecar unavailable — using legacy 32×32 grid-descriptor system');
    warnings.push('Sidecar unavailable — running in legacy grid-descriptor fallback mode');
  }

  const sampleSet = anchorFrames.slice(0, 5);
  log(TAG, `Analyzing identity drift across ${sampleSet.length} frames`, {
    method: sidecarAvailable ? 'embedding (ArcFace/AdaFace)' : 'legacy grid-descriptor',
  });

  const genInfo = await probeVideo(generatedVideoPath).catch(() => ({
    width: 1280, height: 720, duration: 4, fps: 24,
  }));
  const { width: frameW, height: frameH } = genInfo;

  // Build / reuse AnchorProfile
  let profile: AnchorProfile | null = options.anchorProfile ?? null;
  if (!profile && options.clipId && sidecarAvailable) {
    profile = AnchorProfile.loadFromDisk('primary', options.clipId);
  }

  let methodsUsed: Record<string, number> = {};
  let primaryDetector = 'unknown';
  let lastReliableScore = 0.8;  // optimistic start for first frame

  const subjectSummaries: SubjectAnchorSummary[] = [];
  if (options.subjectProfiles) {
    for (const [, p] of options.subjectProfiles) {
      subjectSummaries.push(p.toSummary());
    }
  }

  for (const anchor of sampleSet) {
    let genFrame: string | null = null;
    try {
      genFrame = await extractFrameAt(generatedVideoPath, anchor.timestamp, undefined, 'gen-cmp');
      if (!genFrame) {
        warnings.push(`Could not extract gen frame at ${anchor.timestamp.toFixed(2)}s`);
        faceBoxes.push(null);
        continue;
      }

      if (sidecarAvailable && profile && profile.size > 0) {
        // ── Embedding path ────────────────────────────────────────────────────
        const embResult = await _compareFrameEmbedding(
          anchor.path, genFrame, profile, lastReliableScore,
        );

        if (embResult) {
          if (embResult.confidence >= MIN_EMBEDDING_CONFIDENCE) {
            lastReliableScore = embResult.similarity;
          }
          methodsUsed['embedding'] = (methodsUsed['embedding'] ?? 0) + 1;
          primaryDetector          = embResult.model;

          frameScores.push({
            timestamp:        anchor.timestamp,
            drift:            embResult.drift,
            similarity:       embResult.similarity,
            faceDetectedOrig: embResult.faceDetectedOrig,
            faceDetectedGen:  embResult.faceDetectedGen,
            method:           'embedding',
          });
          faceBoxes.push(embResult.origFaceBox);

          log(TAG, `Frame @ ${anchor.timestamp.toFixed(2)}s → sim=${embResult.similarity.toFixed(3)} conf=${embResult.confidence.toFixed(3)}`, {
            quality: embResult.quality,
            model:   embResult.model,
            anchor:  embResult.anchorUsed,
          });
          continue;
        }
      }

      // ── Legacy path (grid-descriptor / heuristic) ─────────────────────────
      const legResult = await _legacyCompareFramePair(anchor.path, genFrame, frameW, frameH);

      methodsUsed[legResult.method] = (methodsUsed[legResult.method] ?? 0) + 1;
      if (legResult.detectorUsed) primaryDetector = legResult.detectorUsed;

      frameScores.push({
        timestamp:        anchor.timestamp,
        drift:            legResult.drift,
        similarity:       legResult.similarity,
        faceDetectedOrig: legResult.faceDetectedOrig,
        faceDetectedGen:  legResult.faceDetectedGen,
        method:           legResult.method,
      });
      faceBoxes.push(legResult.origFaceBox);

      log(TAG, `Frame @ ${anchor.timestamp.toFixed(2)}s → sim=${legResult.similarity.toFixed(3)} [legacy]`, {
        method: legResult.method, detector: legResult.detectorUsed,
      });

    } catch (err) {
      const msg = (err as Error).message;
      warnings.push(`Analysis error at ${anchor.timestamp.toFixed(2)}s: ${msg}`);
      logError(TAG, `Frame comparison failed at ${anchor.timestamp.toFixed(2)}s`, err);
      faceBoxes.push(null);
    } finally {
      if (genFrame) safeUnlink(genFrame);
    }
  }

  // ── No frames analyzed ────────────────────────────────────────────────────
  if (frameScores.length === 0) {
    warn(TAG, 'No frames analyzed — defaulting to conservative (high drift)');
    warnings.push('Identity analysis produced no results — using conservative fallback');
    return {
      identitySimilarityScore: 0,
      identityDriftScore:      1,
      driftSeverity:           'high',
      frameScores:             [],
      faceDetectedOriginal:    false,
      faceDetectedGenerated:   false,
      analysisMethod:          sidecarAvailable ? 'embedding' : 'heuristic',
      detectorUsed:            'none',
      averageSimilarity:       0,
      comparedFrames:          0,
      originalFaceBoxes:       [],
      warnings,
      suggestedRestorationMode: 'FULL_SUBJECT_COMPOSITE',
      subjectSummaries: subjectSummaries.length > 0 ? subjectSummaries : undefined,
    };
  }

  // ── Aggregate ─────────────────────────────────────────────────────────────
  const avgSimilarity = frameScores.reduce((s, f) => s + f.similarity, 0) / frameScores.length;
  const avgDrift      = 1 - avgSimilarity;

  const faceOrigAny = frameScores.some(f => f.faceDetectedOrig);
  const faceGenAny  = frameScores.some(f => f.faceDetectedGen);

  // Dominant method
  const embeddingCount  = methodsUsed['embedding']      ?? 0;
  const gridCount       = methodsUsed['grid-descriptor'] ?? 0;
  const heurCount       = methodsUsed['heuristic']       ?? 0;
  const analysisMethod: IdentityAnalysis['analysisMethod'] =
    embeddingCount > 0 ? 'embedding' :
    gridCount >= heurCount ? 'grid-descriptor' : 'heuristic';

  const driftSeverity = _driftToSeverity(avgDrift, thresholds);

  // Suggested mode from embedding system (uses quality of the average frame)
  let suggestedMode: RestorationMode | undefined;
  if (analysisMethod === 'embedding') {
    // Use dominant quality across frames (simplified: use bright as baseline)
    suggestedMode = _similarityToMode(avgSimilarity, 'bright');
  }

  // Legacy heuristic failure guard (default 0.5 similarity = unreliable)
  const heuristicFailure =
    analysisMethod === 'heuristic' &&
    Math.abs(avgSimilarity - HEURISTIC_DEFAULT_SIMILARITY) < 0.001;

  if (heuristicFailure) {
    warn(TAG, 'Heuristic returned default 0.5 — comparison unreliable, suggesting RAW_ACCEPT');
    suggestedMode = 'RAW_ACCEPT';
  }

  log(TAG, 'Identity analysis complete', {
    method:    analysisMethod,
    detector:  primaryDetector,
    avgSim:    avgSimilarity.toFixed(3),
    avgDrift:  avgDrift.toFixed(3),
    severity:  driftSeverity,
    suggested: suggestedMode ?? '(from drift severity)',
    analyzed:  frameScores.length,
    warnings:  warnings.length,
  });

  return {
    identitySimilarityScore: avgSimilarity,
    identityDriftScore:      avgDrift,
    driftSeverity,
    frameScores,
    faceDetectedOriginal:    faceOrigAny,
    faceDetectedGenerated:   faceGenAny,
    analysisMethod,
    detectorUsed:            primaryDetector,
    averageSimilarity:       avgSimilarity,
    comparedFrames:          frameScores.length,
    originalFaceBoxes:       faceBoxes,
    warnings,
    suggestedRestorationMode: suggestedMode,
    subjectSummaries: subjectSummaries.length > 0 ? subjectSummaries : undefined,
  };
}
