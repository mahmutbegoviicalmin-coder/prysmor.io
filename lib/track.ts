import { track as vaTrack } from '@vercel/analytics';

export function track(event: string, properties: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return;
  try {
    vaTrack(event, properties);
  } catch {
    // always fail silently — never break the UI
  }
}
