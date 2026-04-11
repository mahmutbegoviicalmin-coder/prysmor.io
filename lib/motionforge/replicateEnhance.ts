import Replicate from 'replicate';

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

/**
 * Runs GFPGAN face restoration on a video URL via Replicate.
 * Returns a new public URL pointing to the restored video.
 */
export async function restoreFaces(videoUrl: string): Promise<string> {
  console.log('[replicate] Starting face restoration...');

  const output = await replicate.run(
    'pbarker/gfpgan-video',
    {
      input: {
        video: videoUrl,
      },
    },
  ) as string;

  console.log('[replicate] Face restoration complete:', output);
  return output;
}

// ─── WaveSpeed upscale ────────────────────────────────────────────────────────

const WAVESPEED_BASE = 'https://api.wavespeed.ai/api/v3';
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS  = 10 * 60 * 1000; // 10 minutes

/**
 * Submits a video to WaveSpeed Runway Upscale v1 and polls until complete.
 * Returns the upscaled video URL.
 */
export async function upscaleVideo(videoUrl: string): Promise<string> {
  const apiKey = process.env.WAVESPEED_API_KEY;
  if (!apiKey) throw new Error('WAVESPEED_API_KEY is not set');

  console.log('[wavespeed] Starting upscale...');

  // Submit job
  const submitRes = await fetch(`${WAVESPEED_BASE}/runwayml/upscale-v1`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ video: videoUrl }),
  });

  if (!submitRes.ok) {
    const body = await submitRes.text();
    throw new Error(`WaveSpeed submit failed ${submitRes.status}: ${body}`);
  }

  const submitted = await submitRes.json() as { data?: { id?: string } };
  const predictionId = submitted?.data?.id;
  if (!predictionId) {
    throw new Error(`WaveSpeed submit returned no prediction ID: ${JSON.stringify(submitted)}`);
  }

  console.log(`[wavespeed] Job submitted — id=${predictionId}, polling every ${POLL_INTERVAL_MS / 1000}s`);

  // Poll for result
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    const pollRes = await fetch(`${WAVESPEED_BASE}/predictions/${predictionId}/result`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!pollRes.ok) {
      console.warn(`[wavespeed] Poll returned ${pollRes.status} — retrying`);
      continue;
    }

    const poll = await pollRes.json() as {
      data?: { status?: string; outputs?: string[]; error?: string }
    };
    const data = poll?.data;

    console.log(`[wavespeed] Poll status=${data?.status}`);

    if (data?.status === 'completed') {
      const url = data?.outputs?.[0];
      if (!url) throw new Error('WaveSpeed completed but outputs[0] is empty');
      console.log('[wavespeed] Upscale complete:', url);
      return url;
    }

    if (data?.status === 'failed') {
      throw new Error(`WaveSpeed upscale failed: ${data?.error ?? 'unknown error'}`);
    }
  }

  throw new Error(`WaveSpeed upscale timed out after ${POLL_TIMEOUT_MS / 60000} minutes`);
}

// ─── Enhancement pipeline ─────────────────────────────────────────────────────

/**
 * Full enhancement pipeline:
 *   1. GFPGAN face restoration (Replicate)
 *   2. WaveSpeed video upscale
 * Each step falls back gracefully on error.
 */
export async function enhanceVideo(videoUrl: string): Promise<string> {
  let url = videoUrl;

  // Step 1 — face restoration
  try {
    url = await restoreFaces(url);
    console.log('[enhance] Face restoration done');
  } catch (err) {
    console.warn('[enhance] Face restoration failed, skipping:', (err as Error).message);
  }

  // Step 2 — upscale
  try {
    url = await upscaleVideo(url);
    console.log('[enhance] Upscale done');
  } catch (err) {
    console.warn('[enhance] Upscale failed, using previous URL:', (err as Error).message);
  }

  return url;
}
