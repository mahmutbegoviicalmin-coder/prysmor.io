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
 * Runs Topaz Labs Video Upscale (2K target).
 * Returns a new public URL pointing to the upscaled video.
 * Note: topazlabs/video-upscale returns a FileOutput object — extract URL via .url().
 */
export async function upscaleVideo(videoUrl: string): Promise<string> {
  console.log('[replicate] Starting Topaz upscale...');

  const output = await replicate.run(
    'topazlabs/video-upscale',
    {
      input: {
        video: videoUrl,
        target_resolution: '2k',
      },
    },
  ) as { url: () => string } | string;

  // topazlabs/video-upscale returns a FileOutput with a .url() method
  const resultUrl = typeof output === 'string' ? output : output.url();

  console.log('[replicate] Topaz upscale complete:', resultUrl);
  return resultUrl;
}

/**
 * Full enhancement pipeline: face restoration → 2× upscale.
 * Each step is attempted independently — if one fails the chain continues
 * with whichever URL was last successfully produced.
 */
export async function enhanceVideo(videoUrl: string): Promise<string> {
  let url = videoUrl;

  try {
    url = await restoreFaces(url);
    console.log('[replicate] Face restoration done');
  } catch (err) {
    console.warn('[replicate] Face restoration failed, skipping:', (err as Error).message);
  }

  try {
    url = await upscaleVideo(url);
    console.log('[replicate] Upscale done');
  } catch (err) {
    console.warn('[replicate] Upscale failed, using previous:', (err as Error).message);
  }

  return url;
}
