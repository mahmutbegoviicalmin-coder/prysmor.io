/** Runway Aleph 2 accepts roughly 2–30 s of input video. */
export const RUNWAY_MIN_SEC = 2;
export const RUNWAY_MAX_SEC = 30;

/** Premiere/ffmpeg often report 1.96–1.99 s for clips that display as ~2.0 s. */
export const RUNWAY_MIN_TOLERANCE_SEC = 0.25;

export function parseClipDuration(raw: unknown, fallback = 8): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === 'string') {
    const n = parseFloat(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return fallback;
}

export function resolveClipDuration(...candidates: unknown[]): number {
  for (const c of candidates) {
    const n = parseClipDuration(c, 0);
    if (n > 0) return n;
  }
  return 8;
}

export function isRunwayClipDurationValid(sec: number): boolean {
  return sec >= RUNWAY_MIN_SEC - RUNWAY_MIN_TOLERANCE_SEC && sec <= RUNWAY_MAX_SEC;
}

export function runwayClipDurationError(sec: number): string | null {
  if (sec > RUNWAY_MAX_SEC) {
    return `Clip must be between ${RUNWAY_MIN_SEC} and ${RUNWAY_MAX_SEC} seconds.`;
  }
  if (sec < RUNWAY_MIN_SEC - RUNWAY_MIN_TOLERANCE_SEC) {
    return `Clip must be at least ${RUNWAY_MIN_SEC} seconds. Extend the clip on the timeline and sync again.`;
  }
  return null;
}

/** When near the Runway floor, extract slightly longer so the uploaded file clears 2 s. */
export function runwayExtractDurationSec(requestedSec: number): number {
  const d = parseClipDuration(requestedSec, 0);
  if (d <= 0) return d;
  if (d >= RUNWAY_MIN_SEC - RUNWAY_MIN_TOLERANCE_SEC && d < RUNWAY_MIN_SEC + 0.1) {
    return RUNWAY_MIN_SEC + 0.1;
  }
  return d;
}
