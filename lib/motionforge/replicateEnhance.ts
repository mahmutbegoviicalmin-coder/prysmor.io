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

/**
 * Enhancement pipeline — face restoration only.
 * If restoration fails, returns the original URL unchanged.
 */
export async function enhanceVideo(videoUrl: string): Promise<string> {
  try {
    const url = await restoreFaces(videoUrl);
    console.log('[enhance] Face restoration done');
    return url;
  } catch (err) {
    console.warn('[enhance] Face restoration failed, returning original URL:', (err as Error).message);
    return videoUrl;
  }
}
