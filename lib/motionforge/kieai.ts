/**
 * KIE.AI client — Gemini Omni Video
 * Replaces Runway for VFX and style video generation.
 * Docs: https://docs.kie.ai/market/gemini-omni-video
 */

import { bucket } from '@/lib/firebaseAdmin';

const KIE_API_BASE = process.env.KIE_API_BASE || 'https://api.kie.ai';

function kieHeaders(): Record<string, string> {
  const key = process.env.KIE_API_KEY;
  if (!key) throw new Error('KIE_API_KEY is not set');
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

// ─── Firebase Storage upload slot ────────────────────────────────────────────

export interface KieStorageSlot {
  uploadUrl:   string;  // Signed PUT URL — panel uploads directly to this
  kieAssetUrl: string;  // Signed GET URL — passed to KIE.AI as video_list[].url
  storagePath: string;  // GCS path for later cleanup
}

/**
 * Creates a Firebase Storage pre-signed slot for a VFX clip.
 * Returns a write URL (PUT) for the panel and a read URL for KIE.AI.
 * Both are valid for 1 hour — enough for any generation.
 */
export async function createKieUploadSlot(jobId: string): Promise<KieStorageSlot> {
  const storagePath = `vfx-input/${jobId}.mp4`;
  const file = bucket.file(storagePath);

  const expires = Date.now() + 60 * 60 * 1000; // 1 hour

  const [uploadUrl] = await file.getSignedUrl({
    version:     'v4',
    action:      'write',
    expires,
    contentType: 'video/mp4',
  });

  const [kieAssetUrl] = await file.getSignedUrl({
    version: 'v4',
    action:  'read',
    expires,
  });

  return { uploadUrl, kieAssetUrl, storagePath };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns '16:9' or '9:16' based on clip dimensions. Defaults to landscape. */
export function pickKieAspectRatio(w: number, h: number): '16:9' | '9:16' {
  if (w > 0 && h > 0 && h > w) return '9:16';
  return '16:9';
}

/**
 * Returns the nearest KIE duration ('4' | '6' | '8' | '10') that is ≥ clipDurSec.
 * Note: when video_list is provided the model ignores this param, but we pass it anyway.
 */
export function pickKieDuration(clipDurSec: number): '4' | '6' | '8' | '10' {
  if (clipDurSec <= 4) return '4';
  if (clipDurSec <= 6) return '6';
  if (clipDurSec <= 8) return '8';
  return '10';
}

// ─── Task creation ────────────────────────────────────────────────────────────

export interface KieOmniVideoOptions {
  videoUrl:     string;   // Public/signed HTTPS URL of the source clip
  prompt:       string;
  mediaInSec:   number;   // Source in-point (clip.inPoint.seconds from Premiere)
  clipDurSec:   number;   // Duration to use (capped to 10 s by KIE.AI)
  videoWidth?:  number;
  videoHeight?: number;
  resolution?:  '720p' | '1080p' | '4k';
  callbackUrl?: string;
}

export interface KieTaskCreated {
  taskId: string;
}

/**
 * Creates a Gemini Omni Video task on KIE.AI.
 * The Premiere clip is passed as video_list with start/end trim points
 * matching exactly what was selected in the timeline.
 */
export async function createKieOmniVideoTask(opts: KieOmniVideoOptions): Promise<KieTaskCreated> {
  const {
    videoUrl,
    prompt,
    mediaInSec,
    clipDurSec,
    videoWidth  = 0,
    videoHeight = 0,
    resolution  = '1080p',
    callbackUrl,
  } = opts;

  // KIE.AI max clip window is 10 s
  const ends = parseFloat((mediaInSec + Math.min(clipDurSec, 10)).toFixed(3));

  const aspectRatio = pickKieAspectRatio(videoWidth, videoHeight);
  const duration    = pickKieDuration(clipDurSec);

  const body: Record<string, unknown> = {
    model: 'gemini-omni-video',
    input: {
      prompt,
      video_list:   [{ url: videoUrl, start: mediaInSec, ends }],
      aspect_ratio: aspectRatio,
      resolution,
      duration,
    },
  };

  if (callbackUrl) body.callBackUrl = callbackUrl;

  console.log(
    `[kieai] createOmniVideoTask — prompt="${prompt.slice(0, 80)}" ` +
    `start=${mediaInSec} ends=${ends} ratio=${aspectRatio} res=${resolution}`,
  );

  const res = await fetch(`${KIE_API_BASE}/api/v1/jobs/createTask`, {
    method:  'POST',
    headers: kieHeaders(),
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[kieai] createTask FAILED ${res.status}:`, errBody);
    throw new Error(`KIE.AI Gemini Omni Video failed (${res.status}): ${errBody}`);
  }

  const json = await res.json() as {
    code: number;
    msg:  string;
    data: { taskId: string };
  };

  if (!json?.data?.taskId) {
    throw new Error(`KIE.AI response missing taskId: ${JSON.stringify(json).slice(0, 200)}`);
  }

  console.log(`[kieai] Task created: ${json.data.taskId}`);
  return { taskId: json.data.taskId };
}

// ─── Task status ──────────────────────────────────────────────────────────────

export type KieTaskState = 'waiting' | 'queuing' | 'generating' | 'success' | 'fail';

export interface KieTaskStatus {
  state:      KieTaskState;
  progress?:  number;   // 0-100 when available
  resultUrl?: string;   // populated when state === 'success'
  failMsg?:   string;
}

/**
 * Polls the KIE.AI unified task status endpoint.
 * Endpoint: GET /api/v1/jobs/recordInfo?taskId=...
 */
export async function getKieTaskStatus(taskId: string): Promise<KieTaskStatus> {
  const res = await fetch(
    `${KIE_API_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
    {
      headers: { Authorization: kieHeaders().Authorization },
      signal:  AbortSignal.timeout(30_000),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`KIE.AI task status error ${res.status}: ${body}`);
  }

  const json = await res.json() as {
    code: number;
    data: {
      taskId:     string;
      state:      string;
      progress:   number;
      failMsg:    string;
      resultJson: string;
    };
  };

  const data     = json?.data ?? ({} as typeof json.data);
  const state    = (data.state ?? 'waiting') as KieTaskState;
  const progress = typeof data.progress === 'number' ? data.progress : undefined;

  let resultUrl: string | undefined;
  if (state === 'success' && data.resultJson) {
    try {
      const result = JSON.parse(data.resultJson) as { resultUrls?: string[] };
      resultUrl = result.resultUrls?.[0];
    } catch (_) {}
  }

  return { state, progress, resultUrl, failMsg: data.failMsg };
}
