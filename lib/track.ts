import { track as vaTrack } from '@vercel/analytics';

type PropValue = string | number | boolean | null;

/**
 * Vercel Web Analytics custom events.
 * Pro plan allows max 2 properties per event — keep payloads lean.
 * Event NAMES encode what was clicked so the Events list is readable.
 */
export function track(
  event: string,
  properties: Record<string, PropValue> = {},
) {
  if (typeof window === 'undefined') return;
  try {
    const safeName = event
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 64) || 'event';

    const entries = Object.entries(properties)
      .filter(([, v]) => v !== undefined)
      .slice(0, 2)
      .map(([k, v]) => {
        if (typeof v === 'string') return [k, v.slice(0, 255)] as const;
        return [k, v] as const;
      });
    const data = Object.fromEntries(entries) as Record<string, PropValue>;
    if (Object.keys(data).length === 0) {
      vaTrack(safeName);
    } else {
      vaTrack(safeName, data);
    }
  } catch {
    // never break the UI
  }
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 32) || 'unknown';
}

/** CTA click — event name is exact, e.g. cta_hero_get_lifetime */
export function trackCta(location: string, label: string) {
  track(`cta_${slug(location)}_${slug(label)}`);
}

/** Nav click — e.g. nav_navbar_pricing, nav_footer_docs */
export function trackNav(label: string, location = 'nav') {
  track(`nav_${slug(location)}_${slug(label)}`);
}
