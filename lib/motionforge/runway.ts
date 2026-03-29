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
 *
 * Uses the native Node 18+ Web APIs (FormData, Blob, fetch) which work
 * correctly with undici — no npm form-data package needed.
 */
export async function uploadToRunway(filePath: string): Promise<string> {
  const filename = `clip-${Date.now()}.mp4`;

  // Step 1 — request an upload slot
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

  // Step 2 — multipart POST to the pre-signed S3 URL.
  // Use native FormData + Blob (Node 18+ / undici) so that fetch can compute
  // the correct Content-Type boundary and Content-Length automatically.
  const fileBytes = fs.readFileSync(filePath);
  const formData  = new FormData();
  for (const [k, v] of Object.entries(fields)) formData.append(k, v);
  // 'file' MUST be the last field for S3 pre-signed POST uploads
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
 * and returns a runway:// URI. Used to pass a reference frame for
 * identity/style conditioning in video_to_video.
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

  console.log(`[runway] Reference image uploaded → ${runwayUri}`);
  return runwayUri;
}

export interface RunwayTaskCreated {
  id: string;
  status: string;
}

export interface RunwayTaskStatus {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  output?: string[];
  /** Runway uses "failure" (not "error") for the failure description */
  failure?: string;
  failureCode?: string;
  progress?: number;
}

/**
 * Starts a Runway video-to-video generation task.
 *
 * API shape (gen4_aleph):
 *   model:          "gen4_aleph"
 *   videoUri:       HTTPS URL or runway:// URI of the input video
 *   promptText:     generation prompt (max 1000 chars)
 *   references:     optional array of reference images for identity conditioning
 *                   — ONLY for background/environment effects. For overlay effects
 *                   (lighting, fog, particles) a reference image prevents VFX from
 *                   applying because Runway treats it as "keep output close to this".
 *
 * Duration is NOT a parameter — output length matches the input video.
 * Trim the input to max 8 s before calling this function.
 *
 * @param effectType  'overlay' | 'background' — controls whether the reference
 *                    image is attached. Overlay effects MUST NOT use a reference.
 */
export async function createVideoToVideoTask(
  inputVideoUrl: string,
  prompt: string,
  referenceImageUri?: string,
  effectType: 'overlay' | 'background' = 'background',
): Promise<RunwayTaskCreated> {

  const body: Record<string, unknown> = {
    model:      'gen4_aleph',
    videoUri:   inputVideoUrl,
    promptText: prompt,
    contentModeration: {
      // "low" = less strict about recognising public figures (artists, celebrities)
      publicFigureThreshold: 'low',
    },
  };

  // CRITICAL: Only attach reference image for background/environment effects.
  // For overlay effects (lighting, glow, fog, particles, god rays) the reference
  // image tells Runway "keep output looking like this frame" — which directly
  // prevents VFX from being applied. The VFX prompt alone is sufficient for overlays.
  if (referenceImageUri && effectType === 'background') {
    body.references = [{ type: 'image', uri: referenceImageUri }];
    console.log(`[runway] Using reference image for identity conditioning (background effect)`);
  } else if (referenceImageUri && effectType === 'overlay') {
    console.log(`[runway] Skipping reference image for overlay effect — letting prompt drive VFX`);
  }

  const res = await fetch(`${RUNWAY_API_BASE}/v1/video_to_video`, {
    method:  'POST',
    headers: runwayHeaders(),
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[runway] video_to_video ${res.status}:`, body);
    throw new Error(`Runway video_to_video error ${res.status}: ${body}`);
  }

  return res.json() as Promise<RunwayTaskCreated>;
}

/**
 * Starts a Runway image-to-video task using gen3a_turbo.
 * Much faster than video_to_video gen4_aleph (~30-60s vs 5-10 min).
 *
 * API shape (gen3a_turbo):
 *   model:       "gen3a_turbo"
 *   promptImage: runway:// URI of the input frame (JPEG/PNG)
 *   promptText:  generation prompt
 *   duration:    5 | 10 (seconds)
 *   ratio:       "1280:768" | "768:1280" | "1104:832" | "832:1104" | "960:960"
 */
export async function createImageToVideoTask(
  frameUri: string,
  prompt: string,
  durationSec: number,
): Promise<RunwayTaskCreated> {
  // gen3a_turbo supports 5s or 10s — pick the nearest
  const duration = durationSec <= 5 ? 5 : 10;

  const body = {
    model:       'gen3a_turbo',
    promptImage: frameUri,
    promptText:  prompt,
    duration,
    ratio:       '1280:768', // standard 16:9 landscape
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
    signal: AbortSignal.timeout(20_000), // 20s — leaves buffer before Vercel's 60s maxDuration
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Runway tasks error ${res.status}: ${body}`);
  }

  return res.json() as Promise<RunwayTaskStatus>;
}
