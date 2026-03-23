/**
 * MotionForge Identity Lock v2 — Compositing Pipeline
 *
 * Main orchestrator that runs the full Identity Lock v2 workflow:
 *
 *   1. Download generated video
 *   2. Probe video metadata
 *   3. Multi-anchor identity frame extraction
 *   4. Identity drift analysis (grid-descriptor → heuristic fallback)
 *   5. Determine adaptive restoration mode
 *   6. RAW_ACCEPT short-circuit if identity is preserved
 *   7. Extract frames from both videos at a consistent fps
 *   8. Per-frame compositing (with dynamic face-box zones)
 *   9. Reassemble with original audio
 *
 * Bug fixes applied in this revision:
 *   [p1a] FACE_HEAD_RESTORE: compositeZone() now receives the already-harmonized
 *         Buffer, not the original file path. harmonizeSubject() result is no
 *         longer silently discarded.
 *   [p1b] UPPER_BODY_RESTORE: harmonization is now applied before blending,
 *         conditional on enableHarmonization flag.
 *   [p1c] identityAnalysis is now returned from runIdentityLockV2 so the caller
 *         (route.ts) can persist it to Firestore.
 *   [p1d] enableAdvancedMatting is wired into getSubjectMatte() opts.
 *   [p1e] segmentationBatchSize is documented in config.ts as intentionally
 *         unused; processing remains sequential for memory safety.
 *
 * Fallback chain:
 *   FACE_HEAD_RESTORE → UPPER_BODY_RESTORE → FULL_SUBJECT_COMPOSITE → raw Runway
 */

import * as fs   from 'fs';
import * as path from 'path';
import * as os   from 'os';
import ffmpegInstaller   from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller  from '@ffprobe-installer/ffprobe';
import ffmpeg            from 'fluent-ffmpeg';
import sharp             from 'sharp';

import { log, warn, error as logError } from './logger';
import { getConfig }                    from './config';
import {
  extractIdentityAnchors,
  pickBestAnchorFrames,
  extractAllFrames,
  probeVideo,
  safeUnlink,
}                                       from './frameExtract';
import {
  analyzeIdentityDrift,
  collectAnchorProfile,
}                                       from './identityAnalysis';
import { getSubjectMatte }              from './segmentation';
import { harmonizeSubject }             from './harmonization';
import {
  determineRestorationMode,
  compositeZone,
  compositeFullSubject,
}                                       from './restoration';
import { smoothFaceBoxes }              from './face';
import { ensureSidecarRunning, sidecarManager } from './sidecar';
import {
  openDiagnosticsSession,
  appendFrameDiagnostics,
  appendMetadata,
  closeDiagnosticsSession,
}                                       from './diagnostics';

import type { FrameAnchor }        from './frameExtract';
import type { IdentityAnalysis }   from './identityAnalysis';
import type { RestorationMode }    from './config';
import type { FaceBox }            from './face';
import type { ClipDiagnosticsSession } from './diagnostics';
import type { EmbeddingModel }     from './sidecar';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

const TAG = 'compositingPipeline';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompositingDebugMetrics {
  restorationMode:       RestorationMode;
  analysisMethod:        string;
  detectorUsed:          string;
  identityDrift:         number;
  averageSimilarity:     number;
  driftSeverity:         string;
  comparedFrames:        number;
  framesProcessed:       number;
  segmentationProvider:  string;
  harmonizationApplied:  boolean;
  advancedMattingApplied: boolean;
  dynamicFaceBoxes:      boolean;
  fallbacksUsed:         string[];
  totalMs:               number;
}

export interface PipelineResult {
  outputPath:          string;
  debugMetrics:        CompositingDebugMetrics;
  /** Full identity analysis — passed to caller for Firestore persistence. */
  identityAnalysis:    IdentityAnalysis | null;
  /** Whether the Python sidecar was active for this run. */
  sidecarActive:       boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function downloadVideo(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download generated video: ${res.status} ${res.statusText}`);
  }
  fs.writeFileSync(destPath, Buffer.from(await res.arrayBuffer()));
}

/**
 * Removes horizontal banding and scan-line artifacts from Runway-generated video.
 *
 * gen4_aleph tends to produce horizontal stripe patterns on dark or high-contrast
 * source clips. This filter pass cleans those up before the compositing step so
 * neither frame extraction nor blending amplifies the artifacts.
 *
 * Filters applied:
 *   deband  — smooths out horizontal colour banding and posterisation bands
 *   yadif   — removes interlacing-like scan-line patterns (mode=0 = no fps doubling)
 *
 * Non-destructive: if ffmpeg fails the original file is left untouched and
 * compositing continues normally with the raw Runway output.
 */
function cleanGeneratedArtifacts(videoPath: string): Promise<void> {
  const tmpOut = videoPath.replace(/\.mp4$/, '-clean.mp4');
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .videoFilters([
        'deband=1thr=0.03:2thr=0.03:3thr=0.03:4thr=0.015:range=22:direction=random:blur=true',
        'yadif=mode=0:deint=all',
      ])
      .videoCodec('libx264')
      .outputOptions(['-crf 17', '-preset fast', '-pix_fmt yuv420p', '-movflags +faststart'])
      .noAudio()
      .output(tmpOut)
      .on('end', () => {
        try {
          fs.renameSync(tmpOut, videoPath);
        } catch (_) {
          // rename failed (cross-device?) — fall back to copy+delete
          fs.copyFileSync(tmpOut, videoPath);
          fs.unlinkSync(tmpOut);
        }
        resolve();
      })
      .on('error', (err: Error) => {
        try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch (_) {}
        reject(err);
      })
      .run();
  });
}

/**
 * Upscales a video to match the target width×height using high-quality
 * Lanczos resampling. No-ops if the video is already at or above the target.
 *
 * Runway Gen4 Aleph always outputs 1280×720 regardless of input resolution.
 * This step restores the original clip's resolution so the composited output
 * matches the editor's timeline settings.
 *
 * Uses lanczos (best quality for upscaling) with a scale-to-fit + pad to
 * handle edge cases where aspect ratio differs slightly.
 */
function upscaleVideo(
  inputPath:    string,
  outputPath:   string,
  targetWidth:  number,
  targetHeight: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoFilters([
        // Scale to fit inside target box, keep aspect ratio, then pad to exact size
        `scale=${targetWidth}:${targetHeight}:flags=lanczos:force_original_aspect_ratio=decrease`,
        `pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:black`,
        // Force even dimensions (libx264 requirement)
        'crop=trunc(iw/2)*2:trunc(ih/2)*2',
      ])
      .videoCodec('libx264')
      .outputOptions(['-crf 15', '-preset fast', '-pix_fmt yuv420p', '-movflags +faststart'])
      .noAudio()
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err))
      .run();
  });
}

function reassembleVideo(
  framesDir:         string,
  originalVideoPath: string,
  outputPath:        string,
  fps:               number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(path.join(framesDir, 'comp-%04d.jpg'))
      .inputFPS(fps)
      .input(originalVideoPath)
      .outputOptions([
        '-map 0:v:0',
        '-map 1:a:0?',
        '-c:v libx264',
        '-crf 17',
        '-preset fast',
        '-pix_fmt yuv420p',
        '-c:a aac',
        '-shortest',
        '-movflags +faststart',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

function makeWorkDir(prefix: string): string {
  const dir = path.join(os.tmpdir(), `${prefix}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupDir(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

// ─── Segmentation cache ───────────────────────────────────────────────────────

interface SegCache {
  lastMask:   Buffer | null;
  lastIndex:  number;
  sampleRate: number;
}

// ─── Per-frame compositing ────────────────────────────────────────────────────

/**
 * Processes a single frame pair and returns the composited JPEG buffer.
 *
 * Bug-fix [p1a]: FACE_HEAD_RESTORE now passes the harmonized Buffer directly
 *   to compositeZone() — the harmonized result is no longer discarded.
 *
 * Bug-fix [p1b]: UPPER_BODY_RESTORE now applies harmonization before blending,
 *   using the same pipeline as FACE_HEAD_RESTORE and FULL_SUBJECT_COMPOSITE.
 *
 * @param faceBox - Smoothed detected face box for this frame (null = fallback to static zone).
 */
async function processFrame(
  origFramePath:         string,
  genFramePath:          string,
  frameIndex:            number,
  mode:                  RestorationMode,
  frameW:                number,
  frameH:                number,
  segCache:              SegCache,
  harmonizationStrength: number,
  enableHarmonization:   boolean,
  enableAdvancedMatting: boolean,
  faceBox:               FaceBox | null,
  faceExpansionX:        number,
  faceExpansionY:        number,
  faceFeatherPx:         number,
): Promise<Buffer> {
  try {
    // ── FACE_HEAD_RESTORE ──────────────────────────────────────────────────
    if (mode === 'FACE_HEAD_RESTORE') {
      // Load original frame as buffer
      let subjectBuf: Buffer = await fs.promises.readFile(origFramePath) as Buffer;

      // Apply harmonization BEFORE compositing (bug-fix p1a)
      if (enableHarmonization) {
        const { buffer: harmonized } = await harmonizeSubject(
          subjectBuf, genFramePath, harmonizationStrength,
        ).catch(() => ({ buffer: subjectBuf }));

        if (harmonized !== subjectBuf) {
          log(TAG, `Frame ${frameIndex}: harmonization applied (FACE_HEAD_RESTORE)`);
        }
        subjectBuf = harmonized;
      }

      const genBuf = await fs.promises.readFile(genFramePath);

      // Pass harmonized buffer (not the original file path) — bug-fix p1a
      return compositeZone(
        subjectBuf,         // ← harmonized buffer, not origFramePath
        genBuf,
        'face',
        frameW,
        frameH,
        faceBox,            // ← dynamic face box (null = static zone fallback)
        faceFeatherPx,
        faceExpansionX,
        faceExpansionY,
      );
    }

    // ── UPPER_BODY_RESTORE ─────────────────────────────────────────────────
    if (mode === 'UPPER_BODY_RESTORE') {
      // Load original frame as buffer
      let subjectBuf: Buffer = await fs.promises.readFile(origFramePath) as Buffer;

      // Bug-fix [p1b]: harmonization now applied for UPPER_BODY_RESTORE
      if (enableHarmonization) {
        const { buffer: harmonized } = await harmonizeSubject(
          subjectBuf, genFramePath, harmonizationStrength,
        ).catch(() => ({ buffer: subjectBuf }));

        if (harmonized !== subjectBuf) {
          log(TAG, `Frame ${frameIndex}: harmonization applied (UPPER_BODY_RESTORE)`);
        }
        subjectBuf = harmonized;
      }

      const genBuf = await fs.promises.readFile(genFramePath);

      return compositeZone(
        subjectBuf,         // ← harmonized buffer
        genBuf,
        'upperBody',
        frameW,
        frameH,
        faceBox,            // ← dynamic upper-body region derived from face box
        faceFeatherPx + 12, // slightly wider feather for upper-body edge
        faceExpansionX,
        faceExpansionY,
      );
    }

    // ── FULL_SUBJECT_COMPOSITE ─────────────────────────────────────────────
    const isSampleFrame = frameIndex % segCache.sampleRate === 0;
    let subjectPng: Buffer | null = segCache.lastMask;

    if (isSampleFrame || segCache.lastMask === null) {
      const result = await getSubjectMatte(origFramePath, {
        hardenAlpha:          true,
        removeIslands:        true,
        erodePixels:          2,
        enableAdvancedMatting,   // ← bug-fix p1d: wired from config
      });

      if (result) {
        subjectPng         = result.foregroundPng;
        segCache.lastMask  = subjectPng;
        segCache.lastIndex = frameIndex;
      } else {
        return sharp(genFramePath).resize(frameW, frameH).jpeg({ quality: 93 }).toBuffer();
      }
    }

    if (!subjectPng) {
      return sharp(genFramePath).resize(frameW, frameH).jpeg({ quality: 93 }).toBuffer();
    }

    let finalSubject = subjectPng;
    if (enableHarmonization) {
      const { buffer: harmonized } = await harmonizeSubject(
        subjectPng, genFramePath, harmonizationStrength,
      ).catch(() => ({ buffer: subjectPng! }));
      finalSubject = harmonized;
    }

    return compositeFullSubject(finalSubject, genFramePath, frameW, frameH);

  } catch (err) {
    logError(TAG, `Frame ${frameIndex} compositing failed — using raw generated frame`, err);
    try {
      return await sharp(genFramePath).resize(frameW, frameH).jpeg({ quality: 90 }).toBuffer();
    } catch {
      return fs.promises.readFile(genFramePath);
    }
  }
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

/**
 * Runs the Identity Lock v2 compositing pipeline.
 *
 * @param originalVideoPath - Local path to the trimmed original clip.
 * @param generatedVideoUrl - Public URL of the Runway-generated video.
 * @returns                 - Local output path, debug metrics, and identity analysis.
 *
 * Throws only on completely unrecoverable errors (e.g. cannot download video,
 * cannot extract any frames). All other failures degrade gracefully.
 */
export async function runIdentityLockV2(
  originalVideoPath: string,
  generatedVideoUrl: string,
  clipId?:           string,
  effectType?:       'overlay' | 'background',
): Promise<PipelineResult> {
  const startMs       = Date.now();
  const config        = getConfig();
  const fallbacksUsed: string[] = [];

  // ── Step 0: Start Python sidecar (non-blocking — graceful degradation) ────
  const effectiveClipId = clipId ?? path.basename(originalVideoPath, path.extname(originalVideoPath));
  let sidecarActive     = false;

  try {
    sidecarActive = await ensureSidecarRunning();
    if (!sidecarActive) {
      warn(TAG, '⚠ Sidecar unavailable — running in legacy grid-descriptor fallback mode');
      fallbacksUsed.push('sidecar-unavailable');
    }
  } catch (err) {
    warn(TAG, 'Sidecar startup error — fallback active', { err: (err as Error).message });
    fallbacksUsed.push('sidecar-startup-error');
  }

  // ── Diagnostics session ───────────────────────────────────────────────────
  const diagSession: ClipDiagnosticsSession = openDiagnosticsSession(effectiveClipId);
  appendMetadata(diagSession, 'session_start', {
    clipId:       effectiveClipId,
    sidecarActive,
    originalPath: originalVideoPath,
    generatedUrl: generatedVideoUrl,
  });

  // ── Effect-type smart mode override ───────────────────────────────────────
  // overlay    → RAW_ACCEPT: lighting/atmosphere applied ON TOP of scene.
  //              Runway preserves identity natively. No compositing needed.
  // background → FULL_SUBJECT_COMPOSITE: environment/scene replacement.
  //              We must composite original subjects back to protect their faces.
  //
  // This overrides MF_FORCE_RESTORATION_MODE when effectType is explicitly set.
  if (effectType === 'overlay' && !config.forceRestorationMode) {
    log(TAG, 'overlay effect → RAW_ACCEPT short-circuit (no compositing)');
    const workDir  = makeWorkDir('idlock-raw');
    const genVideo = path.join(workDir, 'generated.mp4');
    const outVideo = path.join(workDir, 'output.mp4');
    try {
      await downloadVideo(generatedVideoUrl, genVideo);
      try { await cleanGeneratedArtifacts(genVideo); } catch (_) {}

      // ── Upscale to original resolution (Runway always outputs 1280×720) ──
      let upscaled = false;
      try {
        const origInfo = await probeVideo(originalVideoPath);
        const genInfo  = await probeVideo(genVideo);
        if (origInfo.width > genInfo.width || origInfo.height > genInfo.height) {
          log(TAG, `Upscaling Runway output ${genInfo.width}×${genInfo.height} → ${origInfo.width}×${origInfo.height}`);
          const upscaledVideo = path.join(workDir, 'upscaled.mp4');
          await upscaleVideo(genVideo, upscaledVideo, origInfo.width, origInfo.height);
          safeUnlink(genVideo);
          fs.renameSync(upscaledVideo, genVideo);
          upscaled = true;
        }
      } catch (upErr) {
        warn(TAG, 'Upscale failed — using Runway native resolution', { err: (upErr as Error).message });
      }

      fs.copyFileSync(genVideo, outVideo);
      safeUnlink(genVideo);
      log(TAG, `RAW_ACCEPT complete (upscaled: ${upscaled})`);
    } catch (err) {
      cleanupDir(workDir);
      throw err;
    }
    closeDiagnosticsSession(effectiveClipId);
    return {
      outputPath: outVideo,
      identityAnalysis: null,
      sidecarActive,
      debugMetrics: {
        restorationMode:        'RAW_ACCEPT',
        analysisMethod:         'effect-type-classifier',
        detectorUsed:           'none',
        identityDrift:          0,
        averageSimilarity:      1,
        driftSeverity:          'low',
        comparedFrames:         0,
        framesProcessed:        0,
        segmentationProvider:   'none',
        harmonizationApplied:   false,
        advancedMattingApplied: false,
        dynamicFaceBoxes:       false,
        fallbacksUsed,
        totalMs:                Date.now() - startMs,
      },
    };
  }

  // For background effects, force FULL_SUBJECT_COMPOSITE to protect all faces
  if (effectType === 'background' && !config.forceRestorationMode) {
    log(TAG, 'background effect → FULL_SUBJECT_COMPOSITE forced (face protection)');
    // Will be set after identity analysis below, but pre-set as default
  }

  // ── Legacy composite shortcut ──────────────────────────────────────────────
  if (config.forceLegacyComposite) {
    log(TAG, 'Legacy composite mode active — delegating to faceComposite.ts');
    const { runFaceCompositing } = await import('./faceComposite');
    const legacyPath = await runFaceCompositing(originalVideoPath, generatedVideoUrl);
    closeDiagnosticsSession(effectiveClipId);
    return {
      outputPath: legacyPath,
      identityAnalysis: null,
      sidecarActive,
      debugMetrics: {
        restorationMode:        'FULL_SUBJECT_COMPOSITE',
        analysisMethod:         'legacy',
        detectorUsed:           'none',
        identityDrift:          -1,
        averageSimilarity:      -1,
        driftSeverity:          'legacy',
        comparedFrames:         0,
        framesProcessed:        0,
        segmentationProvider:   '@imgly (legacy)',
        harmonizationApplied:   false,
        advancedMattingApplied: false,
        dynamicFaceBoxes:       false,
        fallbacksUsed:          ['legacy-composite'],
        totalMs:                Date.now() - startMs,
      },
    };
  }

  // ── Work directory setup ───────────────────────────────────────────────────
  const workDir  = makeWorkDir('idlock');
  const origDir  = path.join(workDir, 'orig');
  const genDir   = path.join(workDir, 'gen');
  const compDir  = path.join(workDir, 'comp');
  const genVideo = path.join(workDir, 'generated.mp4');
  const outVideo = path.join(workDir, 'composited.mp4');

  fs.mkdirSync(origDir, { recursive: true });
  fs.mkdirSync(genDir,  { recursive: true });
  fs.mkdirSync(compDir, { recursive: true });

  let restorationMode:    RestorationMode   = 'FULL_SUBJECT_COMPOSITE';
  let identityAnalysis:   IdentityAnalysis | null = null;
  let segProvider         = 'none';
  let harmonized          = false;
  let framesProcessed     = 0;
  let dynamicFaceBoxesUsed = false;

  try {
    // ── 1. Download generated video ──────────────────────────────────────────
    log(TAG, 'Downloading generated video…');
    await downloadVideo(generatedVideoUrl, genVideo);
    log(TAG, 'Generated video downloaded', { size: fs.statSync(genVideo).size });

    // ── 1b. Remove scan-line / banding artifacts ──────────────────────────
    // gen4_aleph produces horizontal bands on dark/high-contrast clips.
    // cleanGeneratedArtifacts() runs deband + yadif to clean them up before
    // frame extraction so compositing doesn't amplify the patterns.
    try {
      await cleanGeneratedArtifacts(genVideo);
      log(TAG, 'Artifact cleaning (deband + yadif) applied to generated video');
    } catch (err) {
      warn(TAG, 'Artifact cleaning failed — compositing will proceed with raw output', {
        err: (err as Error).message,
      });
    }

    // ── 2. Probe videos ──────────────────────────────────────────────────────
    const [origInfo, genInfo] = await Promise.all([
      probeVideo(originalVideoPath),
      probeVideo(genVideo),
    ]);

    // ── 2b. Upscale Runway output to original resolution ─────────────────────
    // Runway Gen4 Aleph always outputs 1280×720 regardless of input resolution.
    // Upscale back to the original clip's resolution before compositing so the
    // final output matches the editor's timeline settings.
    if (origInfo.width > genInfo.width || origInfo.height > genInfo.height) {
      log(TAG, `Upscaling generated video ${genInfo.width}×${genInfo.height} → ${origInfo.width}×${origInfo.height}`);
      const upscaledPath = path.join(workDir, 'generated-upscaled.mp4');
      try {
        await upscaleVideo(genVideo, upscaledPath, origInfo.width, origInfo.height);
        safeUnlink(genVideo);
        fs.renameSync(upscaledPath, genVideo);
        log(TAG, 'Upscale complete');
      } catch (upErr) {
        warn(TAG, 'Upscale failed — compositing at Runway native resolution', { err: (upErr as Error).message });
        try { safeUnlink(upscaledPath); } catch (_) {}
      }
    }

    // Re-probe after potential upscale
    const genInfoFinal = await probeVideo(genVideo);

    const frameW = genInfoFinal.width;
    const frameH = genInfoFinal.height;
    const fps    = genInfoFinal.fps > 0 ? genInfoFinal.fps : config.compositingFps;

    log(TAG, 'Video info', {
      orig: `${origInfo.width}x${origInfo.height} @ ${origInfo.fps}fps ${origInfo.duration.toFixed(2)}s`,
      gen:  `${frameW}x${frameH} @ ${fps}fps ${genInfoFinal.duration.toFixed(2)}s`,
    });

    // ── 3. Multi-anchor identity extraction ──────────────────────────────────
    let anchorFrames: FrameAnchor[] = [];
    if (config.enableMultiAnchorIdentity) {
      anchorFrames = await extractIdentityAnchors(originalVideoPath, config.maxAnchorFrames)
        .catch((err) => {
          warn(TAG, 'Multi-anchor extraction failed — using empty set', {
            err: (err as Error).message,
          });
          fallbacksUsed.push('anchor-extraction-failed');
          return [] as FrameAnchor[];
        });
    }

    if (anchorFrames.length === 0) {
      const midTs = origInfo.duration / 2;
      const { extractFrameAt } = await import('./frameExtract');
      const midFrame = await extractFrameAt(originalVideoPath, midTs, workDir, 'fallback-anchor');
      if (midFrame) {
        anchorFrames = [{ path: midFrame, timestamp: midTs, quality: 'unknown' }];
      }
      fallbacksUsed.push('single-anchor-fallback');
    }

    const bestAnchors = pickBestAnchorFrames(anchorFrames);
    log(TAG, `Using ${bestAnchors.length} best-quality anchors`);

    // ── 3b. Anchor collection phase (new in v3) ───────────────────────────────
    // Scans first 30 frames of the original clip to build/load AnchorProfile.
    // Caches to disk — instant on re-runs.
    let anchorProfile = null;
    if (sidecarActive && config.enableIdentityScoring) {
      log(TAG, 'Running anchor collection phase…');
      anchorProfile = await collectAnchorProfile(
        effectiveClipId,
        originalVideoPath,
        'primary',
      ).catch((err) => {
        warn(TAG, 'Anchor collection failed — falling back to legacy analysis', {
          err: (err as Error).message,
        });
        fallbacksUsed.push('anchor-collection-failed');
        return null;
      });

      appendMetadata(diagSession, 'anchors_collected', {
        anchorCount: anchorProfile?.size ?? 0,
        subjectId:   'primary',
      });
    }

    // ── 4. Identity drift analysis ────────────────────────────────────────────
    if (config.enableIdentityScoring && bestAnchors.length > 0) {
      identityAnalysis = await analyzeIdentityDrift(
        bestAnchors,
        genVideo,
        config.identityDriftThresholds,
        {
          clipId:        effectiveClipId,
          anchorProfile: anchorProfile ?? undefined,
        },
      ).catch((err) => {
        warn(TAG, 'Identity analysis failed — defaulting to FULL_SUBJECT_COMPOSITE', {
          err: (err as Error).message,
        });
        fallbacksUsed.push('identity-analysis-failed');
        return null;
      });
    }

    // ── 5. Determine restoration mode ─────────────────────────────────────────
    if (effectType === 'background') {
      // Background/environment effects: always use FULL_SUBJECT_COMPOSITE
      // regardless of identity analysis score — we MUST protect all faces.
      restorationMode = 'FULL_SUBJECT_COMPOSITE';
      log(TAG, 'background effect → forced FULL_SUBJECT_COMPOSITE');
    } else if (identityAnalysis) {
      if (
        sidecarActive &&
        config.enableAdaptiveRestoration &&
        !config.forceRestorationMode &&
        identityAnalysis.suggestedRestorationMode
      ) {
        restorationMode = identityAnalysis.suggestedRestorationMode;
        log(TAG, `Embedding-system suggested mode: ${restorationMode}`);
      } else {
        restorationMode = determineRestorationMode(identityAnalysis, config);
      }
    } else {
      warn(TAG, 'No identity analysis — defaulting to FULL_SUBJECT_COMPOSITE');
      restorationMode = 'FULL_SUBJECT_COMPOSITE';
    }

    appendMetadata(diagSession, 'mode_selected', {
      restorationMode,
      analysisMethod: identityAnalysis?.analysisMethod ?? 'none',
      avgSimilarity:  identityAnalysis?.averageSimilarity ?? 0,
      sidecarActive,
    });

    // ── 6. RAW_ACCEPT short-circuit ───────────────────────────────────────────
    if (restorationMode === 'RAW_ACCEPT') {
      log(TAG, 'RAW_ACCEPT: identity preserved — returning generated video as-is');
      fs.copyFileSync(genVideo, outVideo);

      appendMetadata(diagSession, 'session_end', { restorationMode, totalMs: Date.now() - startMs });
      closeDiagnosticsSession(effectiveClipId);

      return {
        outputPath: outVideo,
        identityAnalysis,
        sidecarActive,
        debugMetrics: {
          restorationMode,
          analysisMethod:        identityAnalysis?.analysisMethod ?? 'none',
          detectorUsed:          identityAnalysis?.detectorUsed   ?? 'none',
          identityDrift:         identityAnalysis?.identityDriftScore ?? 0,
          averageSimilarity:     identityAnalysis?.averageSimilarity  ?? 1,
          driftSeverity:         identityAnalysis?.driftSeverity ?? 'low',
          comparedFrames:        identityAnalysis?.comparedFrames ?? 0,
          framesProcessed:       0,
          segmentationProvider:  'none',
          harmonizationApplied:  false,
          advancedMattingApplied: false,
          dynamicFaceBoxes:      false,
          fallbacksUsed,
          totalMs:               Date.now() - startMs,
        },
      };
    }

    // ── 7. Extract all frames ─────────────────────────────────────────────────
    log(TAG, `Extracting frames at ${fps}fps…`);
    const [origFrames, genFrames] = await Promise.all([
      extractAllFrames(originalVideoPath, origDir, fps),
      extractAllFrames(genVideo,          genDir,  fps),
    ]);

    if (!origFrames.length || !genFrames.length) {
      throw new Error('Frame extraction produced no frames');
    }

    log(TAG, `Frames extracted: orig=${origFrames.length} gen=${genFrames.length}`);
    const totalFrames = Math.min(origFrames.length, genFrames.length);

    // ── 8. Build per-frame face box array (smoothed) ──────────────────────────
    //
    // The identity analysis collected face boxes for up to 5 anchor frames.
    // We map those to the full frame sequence by interpolating (nearest-anchor
    // assignment). Then smooth across neighbours to reduce jitter.
    //
    // If no face boxes are available, all entries remain null → static zone fallback.

    const anchorBoxes = identityAnalysis?.originalFaceBoxes ?? [];
    const anchorTimestamps = bestAnchors.map(a => a.timestamp);

    // Build full-length face box array by nearest-anchor lookup
    const rawFaceBoxes: Array<FaceBox | null> = new Array(totalFrames).fill(null);

    if (config.enableFaceDetection && anchorBoxes.length > 0) {
      for (let fi = 0; fi < totalFrames; fi++) {
        const frameTs = fi / fps;

        let nearestIdx  = 0;
        let nearestDist = Infinity;
        for (let ai = 0; ai < anchorTimestamps.length; ai++) {
          const dist = Math.abs(anchorTimestamps[ai] - frameTs);
          if (dist < nearestDist) { nearestDist = dist; nearestIdx = ai; }
        }

        rawFaceBoxes[fi] = anchorBoxes[nearestIdx] ?? null;
      }
    }

    // Smooth face boxes over neighbouring frames to reduce jitter (Phase 7)
    const perFrameFaceBoxes = smoothFaceBoxes(rawFaceBoxes);
    dynamicFaceBoxesUsed = perFrameFaceBoxes.some(b => b !== null);

    log(TAG, `Dynamic face boxes: ${dynamicFaceBoxesUsed ? 'enabled' : 'disabled (static zones)'}`);

    // ── 9. Frame-by-frame compositing ──────────────────────────────────────────
    log(TAG, `Compositing ${totalFrames} frames (mode: ${restorationMode})…`);

    const segCache: SegCache = {
      lastMask:   null,
      lastIndex:  -999,
      sampleRate: config.segmentationSampleRate,
    };

    const {
      harmonizationStrength,
      enableHarmonization,
      enableAdvancedMatting,
      faceRegionExpansion,
    } = config;

    for (let i = 0; i < totalFrames; i++) {
      const origPath = path.join(origDir, origFrames[i]);
      const genPath  = path.join(genDir,  genFrames[i]);
      const compPath = path.join(compDir, `comp-${String(i + 1).padStart(4, '0')}.jpg`);

      const composed = await processFrame(
        origPath,
        genPath,
        i,
        restorationMode,
        frameW,
        frameH,
        segCache,
        harmonizationStrength,
        enableHarmonization,
        enableAdvancedMatting,
        perFrameFaceBoxes[i] ?? null,
        faceRegionExpansion.xMargin,
        faceRegionExpansion.yMargin,
        faceRegionExpansion.featherPx,
      ).catch(async () => {
        fallbacksUsed.push(`frame-${i}-fallback`);
        try { return await sharp(genPath).jpeg({ quality: 88 }).toBuffer(); }
        catch { return Buffer.alloc(0); }
      });

      if (composed.length > 0) fs.writeFileSync(compPath, composed);
      framesProcessed++;

      // ── Per-frame diagnostics ─────────────────────────────────────────────
      appendFrameDiagnostics(diagSession, {
        frameIndex:          i,
        detectionMethod:     perFrameFaceBoxes[i] !== null ? 'ultraface' : 'skin_heuristic',
        detectionConfidence: perFrameFaceBoxes[i]?.confidence ?? 0,
        embeddingModel:      sidecarActive ? 'insightface' as EmbeddingModel : 'none',
        embeddingConfidence: 0,  // per-frame embedding confidence not available here
        frameQuality:        'bright',  // quality classification happens in sidecar
        identityScore:       identityAnalysis?.averageSimilarity ?? 0,
        adjustedScore:       identityAnalysis?.averageSimilarity ?? 0,
        restorationMode,
        subjectId:           'primary',
        anchorUsed:          0,
        timestamp:           i / fps,
      });

      if ((i + 1) % 30 === 0 || i + 1 === totalFrames) {
        log(TAG, `Progress: ${i + 1}/${totalFrames} (${Math.round((i + 1) / totalFrames * 100)}%)`);
      }
    }

    // At this point RAW_ACCEPT has already short-circuited above, so any
    // remaining mode (FACE_HEAD, UPPER_BODY, FULL_COMPOSITE) can be harmonized.
    harmonized = enableHarmonization;

    if (restorationMode === 'FULL_SUBJECT_COMPOSITE') {
      segProvider = segCache.lastMask ? '@imgly' : 'none';
    } else {
      segProvider = 'none (zone-composite)';
    }

    // ── 10. Reassemble video ───────────────────────────────────────────────────
    log(TAG, 'Reassembling video with original audio…');
    await reassembleVideo(compDir, originalVideoPath, outVideo, fps);

    const durationMs = Date.now() - startMs;
    log(TAG, `Pipeline complete in ${(durationMs / 1000).toFixed(1)}s → ${outVideo}`);

    appendMetadata(diagSession, 'session_end', {
      restorationMode, totalMs: durationMs, framesProcessed,
    });
    closeDiagnosticsSession(effectiveClipId);

    return {
      outputPath:       outVideo,
      identityAnalysis,                // ← returned for Firestore persistence (bug-fix p1c)
      sidecarActive,
      debugMetrics: {
        restorationMode,
        analysisMethod:         identityAnalysis?.analysisMethod  ?? 'none',
        detectorUsed:           identityAnalysis?.detectorUsed    ?? 'none',
        identityDrift:          identityAnalysis?.identityDriftScore  ?? -1,
        averageSimilarity:      identityAnalysis?.averageSimilarity   ?? -1,
        driftSeverity:          identityAnalysis?.driftSeverity   ?? 'unknown',
        comparedFrames:         identityAnalysis?.comparedFrames  ?? 0,
        framesProcessed,
        segmentationProvider:   segProvider,
        harmonizationApplied:   harmonized,
        advancedMattingApplied: enableAdvancedMatting,
        dynamicFaceBoxes:       dynamicFaceBoxesUsed,
        fallbacksUsed,
        totalMs:                durationMs,
      },
    };

  } finally {
    cleanupDir(origDir);
    cleanupDir(genDir);
    cleanupDir(compDir);
    safeUnlink(genVideo);
  }
}
