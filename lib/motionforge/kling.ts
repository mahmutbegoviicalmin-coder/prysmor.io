import Replicate from 'replicate';
import * as fs from 'fs';

function getClient(): Replicate {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error('REPLICATE_API_TOKEN is not set');
  return new Replicate({ auth: token });
}

export interface KlingPrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[];
  error?: string;
}

const KLING_MODEL = 'kwaivgi/kling-v3-omni-video';

/**
 * Uploads a video to litterbox.catbox.moe — free, no account, 1-hour expiry.
 * Returns a URL like https://litter.catbox.moe/XXXXX.mp4 whose PATH ends in .mp4,
 * which satisfies Kling's URL extension validation check.
 */
async function uploadToCatbox(filePath: string): Promise<string> {
  const fileBuffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('time',    '1h');
  form.append('fileToUpload', new Blob([fileBuffer], { type: 'video/mp4' }), 'clip.mp4');

  const res = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
    method: 'POST',
    body:   form,
  });

  const url = (await res.text()).trim();
  if (!res.ok || !url.startsWith('https://')) {
    throw new Error(`catbox upload failed ${res.status}: ${url}`);
  }
  console.log('[kling] catbox URL:', url);
  return url;
}

export async function createKlingPrediction(
  filePath: string,
  prompt: string
): Promise<KlingPrediction> {
  const client = getClient();

  console.log('[kling] Uploading to catbox…');
  const videoUrl = await uploadToCatbox(filePath);

  console.log('[kling] Starting Kling v3 Omni via Replicate…');
  const prediction = await client.predictions.create({
    model: KLING_MODEL,
    input: {
      prompt,
      reference_video:      videoUrl,
      video_reference_type: 'base',
      mode:                 'standard',
      generate_audio:       false,
    },
  });

  console.log(`[kling] Prediction: ${prediction.id} status=${prediction.status}`);
  return prediction as unknown as KlingPrediction;
}

export async function getKlingPredictionStatus(
  predictionId: string
): Promise<KlingPrediction> {
  const client = getClient();
  const prediction = await client.predictions.get(predictionId);

  if (prediction.status === 'succeeded') {
    const out = prediction.output;
    const outputUrl = Array.isArray(out) ? out[0] : (out as string | undefined);
    return { id: predictionId, status: 'succeeded', output: outputUrl };
  }

  if (prediction.status === 'failed' || prediction.status === 'canceled') {
    return {
      id:     predictionId,
      status: prediction.status as 'failed' | 'canceled',
      error:  (prediction.error as string) || `Kling prediction ${prediction.status}`,
    };
  }

  return { id: predictionId, status: prediction.status as 'starting' | 'processing' };
}
