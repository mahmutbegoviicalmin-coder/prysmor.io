import * as fs from 'fs';
import * as path from 'path';

const RUNWAY_API_BASE =
  process.env.RUNWAY_API_BASE || 'https://api.dev.runwayml.com';
const RUNWAY_VERSION = '2024-11-06';

function runwayHeaders(): Record<string, string> {
  const key = process.env.RUNWAY_API_KEY;
  if (!key) throw new Error('RUNWAY_API_KEY is not set');
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    'X-Runway-Version': RUNWAY_VERSION,
  };
}

export interface RunwayUploadSlot {
  uploadUrl: string;
  fields:    Record<string, string>;
  runwayUri: string;
}

/**
 * Creates an ephemeral Runway upload slot and returns the pre-signed S3 URL,
 * the required FormData fields, and the runway:// URI.
 * The caller is responsible for uploading the file to uploadUrl.
 */
export async function createRunwayUploadSlot(filename: string): Promise<RunwayUploadSlot> {
  const res = await fetch(`${RUNWAY_API_BASE}/v1/uploads`, {
    method:  'POST',
    headers: runwayHeaders(),
    body:    JSON.stringify({ filename, type: 'ephemeral' }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Runway /v1/uploads init failed ${res.status}: ${body}`);
  }
  return res.json() as Promise<RunwayUploadSlot>;
}

/**
 * Uploads a local video file to Runway's ephemeral upload storage
 * and returns a runway:// URI valid for 24 hours.
 */
export async function uploadToRunway(filePath: string): Promise<string> {
  const filename = `clip-${Date.now()}.mp4`;

  const initRes = await fetch(`${RUNWAY_API_BASE}/v1/uploads`, {
    method:  'POST',
    headers: runwayHeaders(),
    body:    JSON.stringify({ filename, type: 'ephemeral' }),
  });
  if (!initRes.ok) {
    const body = await initRes.text();
    throw new Error(`Runway /v1/uploads init failed ${initRes.status}: ${body}`);
  }
  const { uploadUrl, fields, runwayUri } = await initRes.json() as {
    uploadUrl: string;
    fields:    Record<string, string>;
    runwayUri: string;
  };

  const fileBytes = fs.readFileSync(filePath);
  const formData  = new FormData();
  for (const [k, v] of Object.entries(fields)) formData.append(k, v);
  formData.append('file', new Blob([fileBytes], { type: 'video/mp4' }), filename);

  const uploadRes = await fetch(uploadUrl, { method: 'POST', body: formData });
  if (!uploadRes.ok && uploadRes.status !== 204) {
    const body = await uploadRes.text();
    throw new Error(`Runway S3 upload failed ${uploadRes.status}: ${body}`);
  }

  console.log(`[runway] Uploaded → ${runwayUri}`);
  return runwayUri;
}

/**
 * Uploads a single image file (JPEG/PNG) to Runway ephemeral storage
 * and returns a runway:// URI. Used for Aleph 2 keyframe anchors.
 */
export async function uploadImageToRunway(imagePath: string): Promise<string> {
  const ext      = path.extname(imagePath).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
  const filename = `ref-frame-${Date.now()}${ext}`;

  const initRes = await fetch(`${RUNWAY_API_BASE}/v1/uploads`, {
    method:  'POST',
    headers: runwayHeaders(),
    body:    JSON.stringify({ filename, type: 'ephemeral' }),
  });
  if (!initRes.ok) {
    const body = await initRes.text();
    throw new Error(`Runway image upload init failed ${initRes.status}: ${body}`);
  }
  const { uploadUrl, fields, runwayUri } = await initRes.json() as {
    uploadUrl: string;
    fields:    Record<string, string>;
    runwayUri: string;
  };

  const fileBytes = fs.readFileSync(imagePath);
  const formData  = new FormData();
  for (const [k, v] of Object.entries(fields)) formData.append(k, v);
  formData.append('file', new Blob([fileBytes], { type: mimeType }), filename);

  const uploadRes = await fetch(uploadUrl, { method: 'POST', body: formData });
  if (!uploadRes.ok && uploadRes.status !== 204) {
    const body = await uploadRes.text();
    throw new Error(`Runway image S3 upload failed ${uploadRes.status}: ${body}`);
  }

  console.log(`[runway] Keyframe image uploaded → ${runwayUri}`);
  return runwayUri;
}

/** Aleph 2 keyframe anchor — pin a reference image to a point in the clip. */
export interface Aleph2Keyframe {
  uri: string;
  /** Absolute seconds from clip start (0.01 precision). */
  seconds?: number;
  /** Fraction of clip duration [0.0, 1.0]. */
  at?: number;
}

export interface RunwayTaskCreated {
  id: string;
  status: string;
}

export interface RunwayTaskStatus {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  output?: string[];
  failure?: string;
  failureCode?: string;
  progress?: number;
}

/**
 * Starts a Runway Aleph 2 video-to-video edit task.
 *
 * API shape (aleph2):
 *   model:          "aleph2"
 *   videoUri:       runway:// or HTTPS URL of input video (2–30 s, ≤1080p, ≤30 fps)
 *   promptText:     edit instruction (max 1000 chars) — describe only what changes
 *   keyframes:      optional, up to 5 anchored reference images
 *
 * Output preserves input resolution and aspect ratio (no ratio/duration params).
 */
export async function createVideoToVideoTask(
  inputVideoUrl: string,
  prompt: string,
  keyframes?: Aleph2Keyframe[],
): Promise<RunwayTaskCreated> {

  const anchors = (keyframes ?? [])
    .filter(k => k.uri && k.uri.length > 0)
    .slice(0, 5)
    .map(k => {
      if (k.seconds !== undefined) return { seconds: k.seconds, uri: k.uri };
      if (k.at !== undefined) return { at: k.at, uri: k.uri };
      return { seconds: 0, uri: k.uri };
    });

  const body: Record<string, unknown> = {
    model:      'aleph2',
    videoUri:   inputVideoUrl,
    promptText: prompt,
    contentModeration: { publicFigureThreshold: 'low' },
    ...(anchors.length > 0 ? { keyframes: anchors } : {}),
  };

  console.log(
    `[runway] createVideoToVideoTask aleph2 — prompt="${prompt.slice(0, 80)}…" ` +
    `keyframes=${anchors.length}`,
  );
  console.log('[runway] request body (no video data):', JSON.stringify({ ...body, videoUri: '[redacted]' }));

  const res = await fetch(`${RUNWAY_API_BASE}/v1/video_to_video`, {
    method:  'POST',
    headers: runwayHeaders(),
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[runway] ❌ video_to_video FAILED ${res.status} — FULL ERROR BODY:`, errBody);
    throw new Error(`VFX generation failed (${res.status}): ${errBody}`);
  }

  return res.json() as Promise<RunwayTaskCreated>;
}

/**
 * Starts a Runway image-to-video task using gen3a_turbo.
 */
export async function createImageToVideoTask(
  frameUri: string,
  prompt: string,
  durationSec: number,
): Promise<RunwayTaskCreated> {
  const duration = durationSec <= 5 ? 5 : 10;

  const body = {
    model:       'gen3a_turbo',
    promptImage: frameUri,
    promptText:  prompt,
    duration,
    ratio:       '1280:768',
    contentModeration: { publicFigureThreshold: 'low' },
  };

  const res = await fetch(`${RUNWAY_API_BASE}/v1/image_to_video`, {
    method:  'POST',
    headers: runwayHeaders(),
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[runway] image_to_video ${res.status}:`, text);
    throw new Error(`Runway image_to_video error ${res.status}: ${text}`);
  }

  return res.json() as Promise<RunwayTaskCreated>;
}

/**
 * Polls a single Runway task for its current status.
 */
export async function getRunwayTaskStatus(
  taskId: string
): Promise<RunwayTaskStatus> {
  const res = await fetch(`${RUNWAY_API_BASE}/v1/tasks/${taskId}`, {
    headers: {
      Authorization: runwayHeaders().Authorization,
      'X-Runway-Version': RUNWAY_VERSION,
    },
    signal: AbortSignal.timeout(50_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Runway tasks error ${res.status}: ${body}`);
  }

  return res.json() as Promise<RunwayTaskStatus>;
}
