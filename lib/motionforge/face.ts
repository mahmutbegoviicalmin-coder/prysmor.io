/**
 * MotionForge Identity Lock v3 — Enhanced Face Detection
 *
 * Detection stack (tried in order):
 *   1. UltraFace ONNX (version-RFB-320, ~1.2 MB) — primary detector
 *      - Dark frames: CLAHE-enhanced via sidecar /enhance, threshold lowered to 0.45
 *      - Multi-scale: also runs on 1.5× upscaled face-crop region; best box kept
 *   2. RetinaFace (via Python sidecar /detect) — secondary when UltraFace conf < 0.65
 *   3. Temporal tracking — when detection fails, predict position from velocity vector
 *   4. Skin-heuristic zone — last resort
 *
 * Identity comparison (legacy, still used as fallback when sidecar unavailable):
 *   32×32 grid-descriptor cosine similarity (unchanged from v2).
 *
 * Temporal tracking:
 *   TrackerState stores the last confirmed box + velocity (dx,dy,dw,dh per frame).
 *   Predicted box is accepted when IoU > IOU_CONFIRM_THRESHOLD (0.3) against new detection.
 *
 * Fallback order:
 *   1. UltraFace ONNX (multi-scale, dark-enhanced)
 *   2. RetinaFace via sidecar
 *   3. Temporal tracking prediction
 *   4. Skin-heuristic zone
 *   5. None
 */

import * as fs   from 'fs';
import * as path from 'path';
import * as os   from 'os';
import sharp      from 'sharp';
import { log, warn } from './logger';
import { sidecarManager } from './sidecar';

const TAG = 'face';

// ─── Model constants ──────────────────────────────────────────────────────────

const MODEL_CACHE_DIR  = path.join(os.homedir(), '.cache', 'prysmor', 'models');
const MODEL_DEST       = path.join(MODEL_CACHE_DIR, 'ultraface-rfb-320.onnx');

/**
 * Primary download URL.
 * Override via MF_ULTRAFACE_MODEL_URL env var if this moves or you have
 * a faster internal mirror.
 */
const MODEL_URL =
  process.env.MF_ULTRAFACE_MODEL_URL ??
  'https://github.com/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB/raw/master/models/onnx/version-RFB-320.onnx';

/** UltraFace-RFB-320 expected input size. */
const UF_W = 320;
const UF_H = 240;

const SCORE_THRESHOLD      = 0.65;
const SCORE_THRESHOLD_DARK = 0.45;  // lowered threshold for dark frames
const NMS_IOU              = 0.45;

// RetinaFace fallback: trigger when UltraFace top confidence below this
const RETINAFACE_FALLBACK_CONF = 0.65;

// Temporal tracking: predicted box confirmed when IoU with new detection > this
const IOU_CONFIRM_THRESHOLD    = 0.30;

// Skin-heuristic confidence cap (raised for dark-frame tolerance)
const SKIN_CONF_CAP_NORMAL     = 0.48;
const SKIN_CONF_CAP_DARK       = 0.65;

// Multi-scale: upscale factor for the second detection pass
const MULTISCALE_FACTOR        = 1.5;

/** Side length of the normalized descriptor grid (32×32 = 1024 dims). */
const DESCRIPTOR_SIDE = 32;

// ─── Types ────────────────────────────────────────────────────────────────────

/** Bounding box in normalized [0-1] image coordinates. */
export interface FaceBox {
  x:          number;   // left edge
  y:          number;   // top edge
  width:      number;
  height:     number;
  confidence: number;   // 0-1
}

/** Pixel-space face region (useful for sharp extract calls). */
export interface PixelRegion {
  left:   number;
  top:    number;
  width:  number;
  height: number;
}

export interface FaceDetectionResult {
  detected: boolean;
  faces:       FaceBox[];
  primaryFace: FaceBox | null;
  /** Which detection path was used. */
  method: 'ultraface-onnx' | 'skin-heuristic' | 'none' | 'retinaface' | 'temporal-tracking';
}

// ─── Temporal tracker types ───────────────────────────────────────────────────

/**
 * Per-clip temporal tracker state.
 * Pass between consecutive frame detection calls to enable velocity-based prediction.
 */
export interface TrackerState {
  lastBox:    FaceBox;
  /** Per-frame velocity: delta in normalised [0-1] space. */
  velocity:   { dx: number; dy: number; dw: number; dh: number };
  frameIndex: number;
}

export function createTrackerState(firstBox: FaceBox, frameIndex: number): TrackerState {
  return { lastBox: firstBox, velocity: { dx: 0, dy: 0, dw: 0, dh: 0 }, frameIndex };
}

export function updateTrackerState(
  state:      TrackerState,
  newBox:     FaceBox,
  frameIndex: number,
): TrackerState {
  const frameDelta = Math.max(1, frameIndex - state.frameIndex);
  return {
    lastBox:    newBox,
    velocity: {
      dx: (newBox.x      - state.lastBox.x)      / frameDelta,
      dy: (newBox.y      - state.lastBox.y)      / frameDelta,
      dw: (newBox.width  - state.lastBox.width)  / frameDelta,
      dh: (newBox.height - state.lastBox.height) / frameDelta,
    },
    frameIndex,
  };
}

export function predictBoxFromTracker(
  state:       TrackerState,
  frameIndex:  number,
): FaceBox {
  const frameDelta = frameIndex - state.frameIndex;
  const b = state.lastBox;
  const v = state.velocity;
  // Decay confidence for predicted boxes (10% per frame, floored at 0.3)
  const confDecay = Math.max(0.30, b.confidence * Math.pow(0.90, frameDelta));
  return {
    x:          Math.max(0, Math.min(1, b.x      + v.dx * frameDelta)),
    y:          Math.max(0, Math.min(1, b.y      + v.dy * frameDelta)),
    width:      Math.max(0.01, Math.min(1, b.width  + v.dw * frameDelta)),
    height:     Math.max(0.01, Math.min(1, b.height + v.dh * frameDelta)),
    confidence: confDecay,
  };
}

export interface FaceDescriptor {
  /** 1024-dim unit-normalised greyscale grid vector. */
  vector: Float32Array;
  /** Detection box used to crop — null if fallback zone was used. */
  sourceFaceBox: FaceBox | null;
  method: 'grid-descriptor';
}

// ─── ONNX session singleton ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OrtSession = any;

let _session: OrtSession | null = null;
let _initAttempted = false;

async function downloadModel(): Promise<void> {
  fs.mkdirSync(MODEL_CACHE_DIR, { recursive: true });
  log(TAG, `Downloading UltraFace model → ${MODEL_DEST}`);

  const response = await fetch(MODEL_URL);
  if (!response.ok) {
    throw new Error(`Model download failed: ${response.status} ${response.statusText}`);
  }

  const buf = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(MODEL_DEST, buf);
  log(TAG, `Model downloaded (${(buf.length / 1024).toFixed(0)} KB)`);
}

async function getSession(): Promise<OrtSession | null> {
  if (_initAttempted) return _session;
  _initAttempted = true;

  try {
    if (!fs.existsSync(MODEL_DEST)) {
      await downloadModel();
    }

    // Dynamic require avoids build-time errors on envs without native binding
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ort = require('onnxruntime-node');
    _session = await ort.InferenceSession.create(MODEL_DEST, {
      executionProviders: ['cpu'],
      logSeverityLevel:   3, // errors only
    });

    log(TAG, 'UltraFace ONNX session ready', { detector: 'ultraface-rfb-320' });
    return _session;
  } catch (err) {
    warn(TAG, 'UltraFace ONNX init failed — heuristic fallback active', {
      err: (err as Error).message,
    });
    return null;
  }
}

// ─── NMS ─────────────────────────────────────────────────────────────────────

function iou(a: FaceBox, b: FaceBox): number {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;

  const ix1 = Math.max(a.x, b.x);
  const iy1 = Math.max(a.y, b.y);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);

  const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

function applyNMS(boxes: FaceBox[], iouThreshold: number): FaceBox[] {
  const sorted = [...boxes].sort((a, b) => b.confidence - a.confidence);
  const kept: FaceBox[] = [];
  for (const candidate of sorted) {
    if (!kept.some(k => iou(k, candidate) > iouThreshold)) {
      kept.push(candidate);
    }
  }
  return kept;
}

// ─── Detection: UltraFace ONNX ────────────────────────────────────────────────

async function detectWithONNX(
  imagePath:      string,
  imageW:         number,
  imageH:         number,
  scoreThreshold: number = SCORE_THRESHOLD,
): Promise<FaceBox[] | null> {
  const session = await getSession();
  if (!session) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ort = require('onnxruntime-node');

    // Preprocess: resize to UF_W × UF_H, normalise to [-1, 1] CHW
    const { data: raw } = await sharp(imagePath)
      .resize(UF_W, UF_H, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const floatData = new Float32Array(3 * UF_H * UF_W);
    for (let h = 0; h < UF_H; h++) {
      for (let w = 0; w < UF_W; w++) {
        const src = (h * UF_W + w) * 3;
        const dst =  h * UF_W + w;
        floatData[0 * UF_H * UF_W + dst] = (raw[src]     - 127) / 128;
        floatData[1 * UF_H * UF_W + dst] = (raw[src + 1] - 127) / 128;
        floatData[2 * UF_H * UF_W + dst] = (raw[src + 2] - 127) / 128;
      }
    }

    // Use the session's actual input name (defensive — avoid hard-coding)
    const inputName   = session.inputNames[0] as string;
    const inputTensor = new ort.Tensor('float32', floatData, [1, 3, UF_H, UF_W]);
    const output      = await session.run({ [inputName]: inputTensor });

    const outNames  = Object.keys(output) as string[];
    const scoresKey = outNames.find(k => k.toLowerCase().includes('score')) ?? outNames[0];
    const boxesKey  = outNames.find(k => k.toLowerCase().includes('box'))  ?? outNames[1];

    const scoreData = output[scoresKey].data as Float32Array;
    const boxData   = output[boxesKey].data  as Float32Array;
    const nAnchors  = scoreData.length / 2;

    const raw2: FaceBox[] = [];
    for (let i = 0; i < nAnchors; i++) {
      const score = scoreData[i * 2 + 1]; // index 1 = face class
      if (score < scoreThreshold) continue;

      const x1 = Math.max(0, boxData[i * 4 + 0]);
      const y1 = Math.max(0, boxData[i * 4 + 1]);
      const x2 = Math.min(1, boxData[i * 4 + 2]);
      const y2 = Math.min(1, boxData[i * 4 + 3]);
      if (x2 <= x1 || y2 <= y1) continue;

      raw2.push({ x: x1, y: y1, width: x2 - x1, height: y2 - y1, confidence: score });
    }

    const results = applyNMS(raw2, NMS_IOU);
    log(TAG, `ONNX detection: ${results.length} face(s) found`, {
      imageW, imageH, topScore: results[0]?.confidence.toFixed(3) ?? 'n/a',
      threshold: scoreThreshold,
    });
    return results;

  } catch (err) {
    warn(TAG, 'ONNX detection inference failed', { err: (err as Error).message });
    return null;
  }
}

// ─── Multi-scale ONNX detection ───────────────────────────────────────────────

/**
 * Runs UltraFace at the original image AND on a 1.5× upscaled crop of the
 * face region found in the first pass. Merges and de-duplicates with NMS.
 * Returns the best result; falls back to single-scale if upscale pass fails.
 */
async function detectWithONNXMultiScale(
  imagePath:      string,
  imageW:         number,
  imageH:         number,
  scoreThreshold: number,
): Promise<FaceBox[] | null> {
  // ── Pass 1: full image ──────────────────────────────────────────────────
  const pass1 = await detectWithONNX(imagePath, imageW, imageH, scoreThreshold);
  if (!pass1) return null;

  // ── Pass 2: upscaled crop around best detection ─────────────────────────
  if (pass1.length > 0) {
    const best = pass1[0];
    try {
      // Expand box by 15%, scale up by MULTISCALE_FACTOR, clamp to image bounds
      const margin = 0.15;
      const cx1 = Math.max(0, best.x - best.width  * margin);
      const cy1 = Math.max(0, best.y - best.height * margin);
      const cx2 = Math.min(1, best.x + best.width  * (1 + margin));
      const cy2 = Math.min(1, best.y + best.height * (1 + margin));

      const cropW = Math.max(1, Math.round((cx2 - cx1) * imageW));
      const cropH = Math.max(1, Math.round((cy2 - cy1) * imageH));
      const scaleW = Math.round(cropW * MULTISCALE_FACTOR);
      const scaleH = Math.round(cropH * MULTISCALE_FACTOR);

      const tmpPath = path.join(os.tmpdir(), `uf-scale2-${Date.now()}.jpg`);
      await sharp(imagePath)
        .extract({
          left:   Math.round(cx1 * imageW),
          top:    Math.round(cy1 * imageH),
          width:  cropW,
          height: cropH,
        })
        .resize(scaleW, scaleH, { fit: 'fill' })
        .jpeg({ quality: 95 })
        .toFile(tmpPath);

      const pass2Raw = await detectWithONNX(tmpPath, scaleW, scaleH, scoreThreshold);
      fs.unlink(tmpPath, () => {});

      if (pass2Raw && pass2Raw.length > 0) {
        // Re-map pass2 boxes back to full-image coordinates
        const remapped = pass2Raw.map(b => ({
          x:          cx1 + b.x      * (cx2 - cx1),
          y:          cy1 + b.y      * (cy2 - cy1),
          width:      b.width        * (cx2 - cx1),
          height:     b.height       * (cy2 - cy1),
          confidence: b.confidence,
        }));
        // Merge both passes and apply NMS
        return applyNMS([...pass1, ...remapped], NMS_IOU);
      }
    } catch (err) {
      warn(TAG, 'Multi-scale pass 2 failed — using single-scale result', {
        err: (err as Error).message,
      });
    }
  }

  return pass1;
}

// ─── RetinaFace via sidecar ───────────────────────────────────────────────────

/**
 * Calls the Python sidecar's /detect endpoint (RetinaFace-based detection).
 * Used as secondary when UltraFace confidence < RETINAFACE_FALLBACK_CONF.
 */
async function detectWithRetinaFace(
  imagePath: string,
): Promise<FaceBox[] | null> {
  if (!sidecarManager.isAvailable) return null;
  try {
    const buf = await fs.promises.readFile(imagePath);
    const b64 = buf.toString('base64');
    const res = await sidecarManager.detect(b64);
    if (!res || res.faces.length === 0) return null;

    return res.faces.map(f => ({
      x:          f.box[0],
      y:          f.box[1],
      width:      f.box[2] - f.box[0],
      height:     f.box[3] - f.box[1],
      confidence: f.confidence,
    }));
  } catch (err) {
    warn(TAG, 'RetinaFace sidecar detection failed', { err: (err as Error).message });
    return null;
  }
}

// ─── Dark-frame enhancement via sidecar ──────────────────────────────────────

/**
 * Applies CLAHE via sidecar /enhance and writes the result to a temp file.
 * Returns the temp file path (caller must unlink), or null if enhancement fails.
 */
async function enhanceDarkFrame(imagePath: string): Promise<string | null> {
  if (!sidecarManager.isAvailable) return null;
  try {
    const buf = await fs.promises.readFile(imagePath);
    const b64 = buf.toString('base64');
    const enhanced = await sidecarManager.enhance(b64);
    if (!enhanced) return null;

    const tmpPath = imagePath.replace(/(\.\w+)$/, '-clahe$1');
    const imgBuf  = Buffer.from(enhanced, 'base64');
    await fs.promises.writeFile(tmpPath, imgBuf);
    return tmpPath;
  } catch {
    return null;
  }
}

// ─── Dark-frame check ─────────────────────────────────────────────────────────

async function isDarkFrame(imagePath: string): Promise<boolean> {
  try {
    const stats = await sharp(imagePath).greyscale().stats();
    return stats.channels[0].mean < 60;
  } catch {
    return false;
  }
}

// ─── Detection: skin-heuristic fallback ──────────────────────────────────────

/**
 * Improved skin-tone heuristic: samples three vertical strips
 * (left-of-centre, centre, right-of-centre) in the upper half of the frame
 * and picks the strip with the strongest skin-tone signal.
 *
 * Returns a single low-confidence face box if skin-tone is plausible.
 * Much better than the old full-frame mean comparison.
 *
 * @param isDark - When true, raises the confidence cap to SKIN_CONF_CAP_DARK (0.65).
 */
async function detectWithHeuristic(
  imagePath: string,
  imageW:    number,
  imageH:    number,
  isDark     = false,
): Promise<FaceBox[]> {
  try {
    const strips = [
      { leftFrac: 0.20, widthFrac: 0.20 },
      { leftFrac: 0.40, widthFrac: 0.20 },
      { leftFrac: 0.60, widthFrac: 0.20 },
    ];

    let bestScore = 0;
    let bestStrip: typeof strips[0] | null = null;

    const topFrac    = 0.0;
    const heightFrac = 0.45;
    const top    = 0;
    const height = Math.round(imageH * heightFrac);

    for (const strip of strips) {
      const left  = Math.round(imageW * strip.leftFrac);
      const width = Math.round(imageW * strip.widthFrac);
      if (width < 1 || height < 1) continue;

      const stats = await sharp(imagePath)
        .extract({ left, top, width, height })
        .stats()
        .catch(() => null);

      if (!stats) continue;

      const [r, g, b] = stats.channels;
      const luminance  = 0.299 * r.mean + 0.587 * g.mean + 0.114 * b.mean;
      const hasSkin    = r.mean > b.mean && r.mean >= g.mean * 0.85;
      const hasLight   = luminance > 25 && luminance < 242;

      if (hasSkin && hasLight) {
        const skinScore = (r.mean - b.mean) / 255 + (luminance / 255) * 0.3;
        if (skinScore > bestScore) {
          bestScore = skinScore;
          bestStrip = strip;
        }
      }
    }

    if (!bestStrip) return [];

    const confCap    = isDark ? SKIN_CONF_CAP_DARK : SKIN_CONF_CAP_NORMAL;
    const confidence = Math.min(confCap, 0.25 + bestScore * 0.5);
    const result: FaceBox = {
      x:          bestStrip.leftFrac,
      y:          topFrac,
      width:      bestStrip.widthFrac * 2.0, // widen to encompass more of face
      height:     heightFrac,
      confidence,
    };

    // Clamp
    result.x     = Math.max(0, result.x);
    result.width = Math.min(1 - result.x, result.width);

    log(TAG, `Skin-heuristic: face-zone confidence=${confidence.toFixed(2)}`);
    return [result];
  } catch {
    return [];
  }
}

// ─── Public: detectFaces ──────────────────────────────────────────────────────

/**
 * Detects all faces in an image.
 * Returns normalized bounding boxes (0-1 coords), sorted by confidence desc.
 *
 * Enhanced detection stack:
 *   1. Dark check → optional CLAHE enhance via sidecar
 *   2. UltraFace ONNX multi-scale (lowered threshold for dark frames)
 *   3. RetinaFace via sidecar (when top UltraFace confidence < RETINAFACE_FALLBACK_CONF)
 *   4. Temporal tracking prediction (when tracker state is provided)
 *   5. Skin-heuristic zone (last resort)
 *
 * @param imagePath    - Path to the input image.
 * @param trackerState - Optional tracker state for temporal prediction fallback.
 * @param frameIndex   - Current frame index (required for tracker update).
 */
export async function detectFaces(
  imagePath:    string,
  trackerState?: TrackerState | null,
  frameIndex?:   number,
): Promise<FaceDetectionResult & { updatedTrackerState?: TrackerState }> {
  let imageW = 1280;
  let imageH = 720;

  try {
    const meta = await sharp(imagePath).metadata();
    imageW = meta.width  ?? 1280;
    imageH = meta.height ?? 720;
  } catch { /* use defaults */ }

  // ── Step 1: dark-frame check + CLAHE enhancement ──────────────────────────
  const dark = await isDarkFrame(imagePath);
  let procPath  = imagePath;       // path to (possibly enhanced) image for detection
  let claheTemp: string | null = null;

  if (dark && sidecarManager.isAvailable) {
    claheTemp = await enhanceDarkFrame(imagePath);
    if (claheTemp) {
      procPath = claheTemp;
      log(TAG, 'Dark frame detected — using CLAHE-enhanced image for detection');
    }
  }

  const threshold = dark ? SCORE_THRESHOLD_DARK : SCORE_THRESHOLD;

  try {
    // ── Step 2: UltraFace ONNX multi-scale ────────────────────────────────
    const onnxBoxes = await detectWithONNXMultiScale(procPath, imageW, imageH, threshold);

    if (onnxBoxes !== null && onnxBoxes.length > 0) {
      const topConf = onnxBoxes[0].confidence;

      // ── Step 3: RetinaFace secondary when UltraFace confidence is low ──
      if (topConf < RETINAFACE_FALLBACK_CONF) {
        log(TAG, `UltraFace low confidence (${topConf.toFixed(3)}) — trying RetinaFace`);
        const rfBoxes = await detectWithRetinaFace(procPath);
        if (rfBoxes && rfBoxes.length > 0 && rfBoxes[0].confidence > topConf) {
          const faces = rfBoxes;
          const fi    = frameIndex ?? 0;
          const newState = trackerState
            ? updateTrackerState(trackerState, faces[0], fi)
            : createTrackerState(faces[0], fi);
          return {
            detected:    true,
            faces,
            primaryFace: faces[0],
            method:      'retinaface',
            updatedTrackerState: newState,
          };
        }
      }

      const faces = onnxBoxes;
      const fi    = frameIndex ?? 0;
      const newState = trackerState
        ? updateTrackerState(trackerState, faces[0], fi)
        : createTrackerState(faces[0], fi);
      return {
        detected:    true,
        faces,
        primaryFace: faces[0],
        method:      'ultraface-onnx',
        updatedTrackerState: newState,
      };
    }

    // ── ONNX found nothing — try RetinaFace before tracking ───────────────
    if (onnxBoxes !== null && onnxBoxes.length === 0) {
      const rfBoxes = await detectWithRetinaFace(procPath);
      if (rfBoxes && rfBoxes.length > 0) {
        const fi       = frameIndex ?? 0;
        const newState = trackerState
          ? updateTrackerState(trackerState, rfBoxes[0], fi)
          : createTrackerState(rfBoxes[0], fi);
        return {
          detected:    true,
          faces:       rfBoxes,
          primaryFace: rfBoxes[0],
          method:      'retinaface',
          updatedTrackerState: newState,
        };
      }
    }

    // ── Step 4: Temporal tracking prediction ──────────────────────────────
    if (trackerState && frameIndex !== undefined) {
      const predicted = predictBoxFromTracker(trackerState, frameIndex);
      log(TAG, `Temporal tracking: using predicted box (conf=${predicted.confidence.toFixed(3)})`);
      return {
        detected:    true,
        faces:       [predicted],
        primaryFace: predicted,
        method:      'temporal-tracking',
        // Do NOT update tracker — prediction doesn't confirm a new detection
        updatedTrackerState: trackerState,
      };
    }

  } finally {
    // Clean up CLAHE temp file
    if (claheTemp) {
      try { fs.unlinkSync(claheTemp); } catch { /* ignore */ }
    }
  }

  // ── Step 5: Skin-heuristic fallback ──────────────────────────────────────
  warn(TAG, 'All detectors failed — falling back to skin-heuristic');
  const heurBoxes = await detectWithHeuristic(imagePath, imageW, imageH, dark);
  return {
    detected:    heurBoxes.length > 0,
    faces:       heurBoxes,
    primaryFace: heurBoxes[0] ?? null,
    method:      heurBoxes.length > 0 ? 'skin-heuristic' : 'none',
  };
}

/**
 * Convenience wrapper: returns only the most confident face box (or null).
 */
export async function detectPrimaryFace(imagePath: string): Promise<FaceBox | null> {
  const result = await detectFaces(imagePath);
  return result.primaryFace;
}

/**
 * Detects ALL faces in a frame (not just primary).
 * Used for multi-subject clips.
 */
export async function detectAllFaces(
  imagePath:    string,
  trackerState?: TrackerState | null,
  frameIndex?:   number,
): Promise<FaceDetectionResult & { updatedTrackerState?: TrackerState }> {
  return detectFaces(imagePath, trackerState, frameIndex);
}

// ─── Descriptor computation ───────────────────────────────────────────────────

/**
 * Computes a 32×32 = 1024-dim L2-normalised greyscale grid descriptor
 * from the face region.
 *
 * If `faceBox` is provided the crop is centred on it (with margin).
 * Otherwise falls back to the upper-centre zone heuristic.
 *
 * The descriptor captures spatial luminance structure of the face at a
 * coarse scale — far superior to global channel means for identity
 * comparison. Labeled honestly as 'grid-descriptor'.
 */
export async function computeFaceDescriptor(
  imagePath:  string,
  faceBox?:   FaceBox | null,
  imageW?:    number,
  imageH?:    number,
): Promise<FaceDescriptor | null> {
  try {
    let w = imageW ?? 1280;
    let h = imageH ?? 720;

    if (!imageW || !imageH) {
      const meta = await sharp(imagePath).metadata();
      w = meta.width  ?? 1280;
      h = meta.height ?? 720;
    }

    let instance = sharp(imagePath);

    if (faceBox) {
      // Expand box by 15% margin to include forehead + chin + sides
      const margin = 0.15;
      const left   = Math.max(0, Math.round((faceBox.x - faceBox.width  * margin) * w));
      const top    = Math.max(0, Math.round((faceBox.y - faceBox.height * margin) * h));
      const right  = Math.min(w, Math.round((faceBox.x + faceBox.width  * (1 + margin)) * w));
      const bottom = Math.min(h, Math.round((faceBox.y + faceBox.height * (1 + margin)) * h));
      const cw = Math.max(1, right - left);
      const ch = Math.max(1, bottom - top);
      instance = sharp(imagePath).extract({ left, top, width: cw, height: ch });
    } else {
      // Fallback: upper-centre zone
      const left   = Math.round(w * 0.20);
      const top    = 0;
      const width  = Math.round(w * 0.60);
      const height = Math.round(h * 0.45);
      instance = sharp(imagePath).extract({ left, top, width, height });
    }

    const { data } = await instance
      .resize(DESCRIPTOR_SIDE, DESCRIPTOR_SIDE, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // L2-normalise
    const vec = new Float32Array(DESCRIPTOR_SIDE * DESCRIPTOR_SIDE);
    let norm  = 0;
    for (let i = 0; i < data.length; i++) {
      vec[i] = data[i] / 255.0;
      norm  += vec[i] * vec[i];
    }
    norm = Math.sqrt(norm);
    if (norm > 1e-8) {
      for (let i = 0; i < vec.length; i++) vec[i] /= norm;
    }

    return { vector: vec, sourceFaceBox: faceBox ?? null, method: 'grid-descriptor' };
  } catch (err) {
    warn(TAG, 'Grid descriptor computation failed', { err: (err as Error).message });
    return null;
  }
}

/**
 * Cosine similarity between two grid descriptors.
 * Both vectors are pre-normalised, so dot product = cosine similarity.
 * Returns a value in [0, 1] where 1 = identical.
 */
export function compareFaceDescriptors(a: FaceDescriptor, b: FaceDescriptor): number {
  if (a.vector.length !== b.vector.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.vector.length; i++) dot += a.vector[i] * b.vector[i];
  return Math.max(0, Math.min(1, dot));
}

// ─── Region utilities (used by restoration module) ────────────────────────────

/**
 * Expands a normalised face box by fractional margins.
 * Clamped to [0, 1].
 */
export function expandFaceBox(
  box:   FaceBox,
  xFrac: number = 0.20,
  yFrac: number = 0.25,
): FaceBox {
  const x = Math.max(0, box.x - box.width  * xFrac);
  const y = Math.max(0, box.y - box.height * yFrac);
  const x2 = Math.min(1, box.x + box.width  * (1 + xFrac));
  const y2 = Math.min(1, box.y + box.height * (1 + yFrac));
  return { x, y, width: x2 - x, height: y2 - y, confidence: box.confidence };
}

/**
 * Converts normalised face box to pixel coordinates, with optional margin.
 */
export function faceBoxToPixelRegion(
  box:    FaceBox,
  imageW: number,
  imageH: number,
  xMarginFrac = 0.20,
  yMarginFrac = 0.25,
): PixelRegion {
  const expanded = expandFaceBox(box, xMarginFrac, yMarginFrac);
  const left   = Math.round(expanded.x * imageW);
  const top    = Math.round(expanded.y * imageH);
  const right  = Math.round((expanded.x + expanded.width)  * imageW);
  const bottom = Math.round((expanded.y + expanded.height) * imageH);
  return {
    left,
    top,
    width:  Math.max(1, right  - left),
    height: Math.max(1, bottom - top),
  };
}

/**
 * Derives an upper-body region from a face box.
 * Extends the face region downward by ~3× face height and widens proportionally.
 */
export function faceBoxToUpperBodyRegion(
  box:    FaceBox,
  imageW: number,
  imageH: number,
): PixelRegion {
  const bodyHeightFrac = box.height * 3.0;
  const xMargin        = box.width  * 0.5;

  const x1 = Math.max(0, box.x - xMargin);
  const y1 = Math.max(0, box.y);
  const x2 = Math.min(1, box.x + box.width + xMargin);
  const y2 = Math.min(1, box.y + box.height + bodyHeightFrac);

  return {
    left:   Math.round(x1 * imageW),
    top:    Math.round(y1 * imageH),
    width:  Math.max(1, Math.round((x2 - x1) * imageW)),
    height: Math.max(1, Math.round((y2 - y1) * imageH)),
  };
}

/** Smooth a sequence of face boxes with a simple 3-frame average window. */
export function smoothFaceBoxes(boxes: Array<FaceBox | null>): Array<FaceBox | null> {
  const out: Array<FaceBox | null> = [];
  for (let i = 0; i < boxes.length; i++) {
    const prev = i > 0           ? boxes[i - 1] : null;
    const curr =                   boxes[i];
    const next = i < boxes.length - 1 ? boxes[i + 1] : null;

    if (!curr) { out.push(null); continue; }

    const neighbours = [prev, curr, next].filter(Boolean) as FaceBox[];
    if (neighbours.length === 1) { out.push(curr); continue; }

    const avg: FaceBox = {
      x:          neighbours.reduce((s, b) => s + b.x,          0) / neighbours.length,
      y:          neighbours.reduce((s, b) => s + b.y,          0) / neighbours.length,
      width:      neighbours.reduce((s, b) => s + b.width,      0) / neighbours.length,
      height:     neighbours.reduce((s, b) => s + b.height,     0) / neighbours.length,
      confidence: curr.confidence,
    };
    out.push(avg);
  }
  return out;
}
