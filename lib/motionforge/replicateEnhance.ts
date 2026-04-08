import Replicate from 'replicate';

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

/**
 * Runs GFPGAN face restoration on a video URL.
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

/**
 * Runs Topaz Labs Video Upscale.
 * target_resolution omitted — Topaz uses its own default upscale logic.
 * Note: topazlabs/video-upscale returns a FileOutput object — extract URL via .url().
 */
export async function upscaleVideo(videoUrl: string): Promise<string> {
  console.log('[replicate] Starting Topaz upscale...');

  const output = await replicate.run(
    'topazlabs/video-upscale',
    {
      input: {
        video: videoUrl,
      },
    },
  ) as { url: () => string } | string;

  // topazlabs/video-upscale returns a FileOutput with a .url() method
  const resultUrl = typeof output === 'string' ? output : output.url();

  console.log('[replicate] Topaz upscale complete:', resultUrl);
  return resultUrl;
}

/**
 * Enhancement pipeline: upscale only.
 * restoreFaces is kept for optional future use but not called here.
 */
export async function enhanceVideo(videoUrl: string): Promise<string> {
  let url = videoUrl;

  try {
    url = await upscaleVideo(url);
    console.log('[replicate] Upscale done');
  } catch (err) {
    console.warn('[replicate] Upscale failed, using raw output:', (err as Error).message);
  }

  return url;
}
