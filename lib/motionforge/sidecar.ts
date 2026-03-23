/**
 * VFXPilot Face Embedding Sidecar — Node.js Client + Lifecycle Manager
 *
 * Manages the Python face_embedding_server.py process:
 *   - Spawns on first use, restarts on crash
 *   - Waits up to STARTUP_TIMEOUT_MS for /health → "ok"
 *   - Pre-warms models with a single test image
 *   - Exposes typed HTTP methods for every endpoint
 *   - Graceful degradation: isAvailable = false when server unreachable
 *
 * Communication: HTTP on localhost:7788 only (never exposed externally).
 */

import * as child_process from 'child_process';
import * as fs            from 'fs';
import * as path          from 'path';
import { log, warn }      from './logger';

const TAG = 'sidecar';

// ─── Configuration constants ─────────────────────────────────────────────────

const SIDECAR_BASE_URL        = 'http://127.0.0.1:7788';
const STARTUP_TIMEOUT_MS      = 30_000;
const HEALTH_POLL_INTERVAL_MS = 1_000;
const REQUEST_TIMEOUT_MS      = 12_000;
const RESTART_DELAY_MS        = 2_000;
const SCRIPT_NAME             = 'face_embedding_server.py';

// ─── Public types ─────────────────────────────────────────────────────────────

export type EmbeddingQuality = 'bright' | 'dark' | 'motion_blur' | 'profile' | 'occluded';
export type EmbeddingModel   = 'insightface' | 'adaface' | 'blended';

export interface EmbeddingResult {
  embedding:    number[];        // 512-dim L2-normalised vector
  confidence:   number;          // 0-1  detection confidence
  model:        EmbeddingModel;
  qualityType:  EmbeddingQuality;
  qualityScore: number;
}

export interface BatchEmbedResult {
  results: Array<EmbeddingResult | { error: string; embedding: null; confidence: number }>;
}

export interface SidecarDetectedFace {
  box:        [number, number, number, number];  // [x1,y1,x2,y2] normalised 0-1
  landmarks:  Array<[number, number]>;           // 5 key-points [[x,y], ...]
  confidence: number;
}

export interface SidecarDetectResult {
  faces: SidecarDetectedFace[];
}

export interface SidecarQualityResult {
  type:  EmbeddingQuality;
  score: number;
}

export interface SidecarHealthStatus {
  status:        'ok' | 'loading' | 'error';
  insightface:   boolean;
  buffalo_l:     boolean;
  adaface:       boolean;
  adafaceDevice: string;
  error:         string | null;
}

// ─── Internal Python response shapes ─────────────────────────────────────────

interface PyEmbedResponse {
  embedding:    number[];
  confidence:   number;
  model:        string;
  quality_type: string;
  quality_score: number;
}

interface PyDetectFace {
  box:        number[];
  landmarks:  number[][];
  confidence: number;
}

interface PyDetectResponse {
  faces: PyDetectFace[];
}

interface PyHealthResponse {
  status:         string;
  insightface:    boolean;
  buffalo_l:      boolean;
  adaface:        boolean;
  adaface_device: string;
  error:          string | null;
}

// ─── Minimal 1×1 JPEG (pre-warm payload) ─────────────────────────────────────

// 1×1 white JPEG, base64-encoded
const PREWARM_IMAGE_B64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U' +
  'HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgN' +
  'DRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy' +
  'MjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAA' +
  'AAAAAAAAAAAAAP/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA' +
  '/9oADAMBAAIRAxEAPwCwABmX/9k=';

// ─── SidecarManager ──────────────────────────────────────────────────────────

class SidecarManager {
  private proc:         child_process.ChildProcess | null = null;
  private ready:        boolean = false;
  private available:    boolean = false;
  private startPromise: Promise<void> | null = null;
  private scriptPath:   string;

  constructor() {
    this.scriptPath = path.join(process.cwd(), SCRIPT_NAME);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async ensureRunning(): Promise<void> {
    if (this.ready) return;
    this.startPromise ??= this._doStart();
    return this.startPromise;
  }

  private async _doStart(): Promise<void> {
    if (!fs.existsSync(this.scriptPath)) {
      warn(TAG, `${SCRIPT_NAME} not found at ${this.scriptPath} — sidecar unavailable (fallback active)`);
      return;
    }

    this._spawn();

    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await _sleep(HEALTH_POLL_INTERVAL_MS);
      try {
        const res  = await _fetch('/health');
        const data = res as PyHealthResponse;
        if (data.status === 'ok') {
          this.ready     = true;
          this.available = true;
          log(TAG, 'Face embedding server ready', {
            insightface: data.insightface,
            adaface:     data.adaface,
          });
          await this._prewarm();
          return;
        }
      } catch {
        // keep polling
      }
    }

    warn(TAG, `Sidecar did not become ready within ${STARTUP_TIMEOUT_MS}ms — fallback mode active`);
  }

  private _spawn(): void {
    const python = process.platform === 'win32' ? 'python' : 'python3';
    this.proc = child_process.spawn(python, [this.scriptPath], {
      stdio:  ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    this.proc.stdout?.on('data', (d: Buffer) => {
      const line = d.toString().trim();
      if (line) log(`${TAG}[py]`, line);
    });

    this.proc.stderr?.on('data', (d: Buffer) => {
      const line = d.toString().trim();
      if (line) warn(`${TAG}[py]`, line);
    });

    this.proc.on('exit', (code) => {
      warn(TAG, `Sidecar exited (code=${code ?? '?'}) — restarting in ${RESTART_DELAY_MS}ms`);
      this.ready = false;
      setTimeout(() => {
        this._spawn();
        this._waitForReady().catch(() => {});
      }, RESTART_DELAY_MS);
    });

    log(TAG, `Spawned face_embedding_server.py (pid=${this.proc.pid})`);
  }

  private async _waitForReady(): Promise<void> {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await _sleep(HEALTH_POLL_INTERVAL_MS);
      try {
        const res = await _fetch('/health') as PyHealthResponse;
        if (res.status === 'ok') {
          this.ready     = true;
          this.available = true;
          log(TAG, 'Sidecar reconnected after restart');
          return;
        }
      } catch { /* keep polling */ }
    }
  }

  private async _prewarm(): Promise<void> {
    try {
      await this.embed(PREWARM_IMAGE_B64);
      log(TAG, 'Models pre-warmed');
    } catch {
      log(TAG, 'Pre-warm skipped (no face in test image — expected)');
    }
  }

  shutdown(): void {
    if (this.proc) {
      try { this.proc.kill('SIGTERM'); } catch { /* ignore */ }
      this.proc = null;
    }
    this.ready     = false;
    this.available = false;
  }

  get isAvailable(): boolean {
    return this.available && this.ready;
  }

  // ── HTTP client methods ────────────────────────────────────────────────────

  async embed(imageB64: string): Promise<EmbeddingResult | null> {
    if (!this.ready) return null;
    try {
      const raw = await _fetch('/embed', 'POST', { image: imageB64 }) as PyEmbedResponse;
      return _mapEmbedResult(raw);
    } catch {
      return null;
    }
  }

  async embedBatch(imagesB64: string[]): Promise<BatchEmbedResult | null> {
    if (!this.ready) return null;
    try {
      const raw = await _fetch('/embed_batch', 'POST', { images: imagesB64 }) as {
        results: Array<PyEmbedResponse | { error: string; embedding: null; confidence: number }>;
      };
      return {
        results: raw.results.map(r => {
          if ('error' in r && r.embedding === null) return r;
          return _mapEmbedResult(r as PyEmbedResponse);
        }),
      };
    } catch {
      return null;
    }
  }

  async detect(imageB64: string): Promise<SidecarDetectResult | null> {
    if (!this.ready) return null;
    try {
      const raw = await _fetch('/detect', 'POST', { image: imageB64 }) as PyDetectResponse;
      return {
        faces: raw.faces.map(f => ({
          box:        f.box  as [number, number, number, number],
          landmarks:  f.landmarks.map(pt => pt as [number, number]),
          confidence: f.confidence,
        })),
      };
    } catch {
      return null;
    }
  }

  async enhance(imageB64: string): Promise<string | null> {
    if (!this.ready) return null;
    try {
      const raw = await _fetch('/enhance', 'POST', { image: imageB64 }) as { image: string };
      return raw.image;
    } catch {
      return null;
    }
  }

  async quality(imageB64: string): Promise<SidecarQualityResult | null> {
    if (!this.ready) return null;
    try {
      const raw = await _fetch('/quality', 'POST', { image: imageB64 }) as {
        type: string; score: number;
      };
      return { type: raw.type as EmbeddingQuality, score: raw.score };
    } catch {
      return null;
    }
  }

  async health(): Promise<SidecarHealthStatus | null> {
    try {
      const raw = await _fetch('/health') as PyHealthResponse;
      return {
        status:        raw.status as SidecarHealthStatus['status'],
        insightface:   raw.insightface,
        buffalo_l:     raw.buffalo_l,
        adaface:       raw.adaface,
        adafaceDevice: raw.adaface_device,
        error:         raw.error,
      };
    } catch {
      return null;
    }
  }
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function _fetch(
  endpoint: string,
  method:   'GET' | 'POST' = 'GET',
  body?:    Record<string, unknown>,
): Promise<unknown> {
  const url  = `${SIDECAR_BASE_URL}${endpoint}`;
  const init: RequestInit = {
    method,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body    = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`Sidecar ${method} ${endpoint} → HTTP ${res.status}`);
  }
  return res.json();
}

function _sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function _mapEmbedResult(raw: PyEmbedResponse): EmbeddingResult {
  return {
    embedding:    raw.embedding,
    confidence:   raw.confidence,
    model:        raw.model        as EmbeddingModel,
    qualityType:  raw.quality_type as EmbeddingQuality,
    qualityScore: raw.quality_score,
  };
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const sidecarManager = new SidecarManager();

/**
 * Call this once at pipeline startup.
 * Launches the Python server and waits up to 30 s for it to become ready.
 * Safe to call multiple times (no-op after first call).
 */
export async function ensureSidecarRunning(): Promise<boolean> {
  await sidecarManager.ensureRunning();
  return sidecarManager.isAvailable;
}
