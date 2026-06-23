/**
 * User-facing error copy for the panel. Never expose provider names, doc URLs, or raw API JSON.
 */

function stripProviderLeakage(raw: string): string {
  let msg = raw
    .replace(/\{[\s\S]*\}/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/VFX generation failed\s*\(\d+\)\s*:?/gi, ' ')
    .replace(/\brunway(ml)?\b/gi, ' ')
    .replace(/\baleph\s*2?\b/gi, ' ')
    .replace(/docurl\s*:?\s*/gi, ' ')
    .replace(/\s*[\u2014—]\s*/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return msg;
}

export function friendlyFailureMessage(raw: string | undefined | null): string {
  const cleaned = stripProviderLeakage(raw || '');
  const r = cleaned.toLowerCase();

  if (!cleaned) {
    return 'Generation failed. Please try again.';
  }

  if (
    r.includes('not enough credits') ||
    r.includes('insufficient credits') ||
    r.includes('could not process credits')
  ) {
    if (r.includes('upgrade') || (r.includes('need') && r.includes('have'))) {
      return cleaned.replace(/^not enough credits/i, 'Not enough credits');
    }
    return 'Effect engine is temporarily unavailable. Please try again later.';
  }

  if (r.includes('moderation') || r.includes('content policy') || r.includes('safety')) {
    const mediaFlagged =
      r.includes('media') || r.includes('image') || r.includes('video') || r.includes('input') || r.includes('footage') || r.includes('clip');
    const promptFlagged = r.includes('text') || r.includes('prompt');

    if (mediaFlagged && !promptFlagged) {
      return 'Your clip was blocked by the safety filter. Try a different frame, avoid tight face close-ups, or use a wider shot.';
    }
    if (promptFlagged && !mediaFlagged) {
      return 'Your prompt was blocked by the safety filter. Use neutral wording without violence, weapons, nudity, names, or brands.';
    }
    return 'This request was blocked by the safety filter. Try a different clip and a neutral prompt.';
  }

  if (r.includes('aspect') && r.includes('ratio')) {
    return 'Video is too wide for processing. Crop your clip to 16:9 or narrower before generating.';
  }

  if (r.includes('api_key') || r.includes('unauthorized') || r.includes('temporarily unavailable')) {
    return 'Generation service is temporarily unavailable. Please try again.';
  }

  return cleaned.length > 220 ? 'Generation failed. Please try again.' : cleaned;
}

export function sanitizeUserFacingError(raw: string | undefined | null): string {
  return friendlyFailureMessage(stripProviderLeakage(raw || ''));
}

export function parseProviderHttpError(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: string; message?: string };
    const inner = parsed.error || parsed.message;
    if (inner) return sanitizeUserFacingError(inner);
  } catch {
    // not JSON
  }
  return sanitizeUserFacingError(body) || `Generation failed (${status}). Please try again.`;
}
