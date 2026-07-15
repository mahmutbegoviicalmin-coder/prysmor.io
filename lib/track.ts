import { track as vaTrack } from '@vercel/analytics';

type PropValue = string | number | boolean | null;

/**
 * Vercel Web Analytics custom events.
 * Pro plan allows max 2 properties per event — keep payloads lean.
 * Events appear under Project → Analytics → Events.
 */
export function track(
  event: string,
  properties: Record<string, PropValue> = {},
) {
  if (typeof window === 'undefined') return;
  try {
    const entries = Object.entries(properties)
      .filter(([, v]) => v !== undefined)
      .slice(0, 2)
      .map(([k, v]) => {
        if (typeof v === 'string') return [k, v.slice(0, 255)] as const;
        return [k, v] as const;
      });
    const data = Object.fromEntries(entries) as Record<string, PropValue>;
    if (Object.keys(data).length === 0) {
      vaTrack(event);
    } else {
      vaTrack(event, data);
    }
  } catch {
    // never break the UI
  }
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'unknown';
}

/**
 * CTA clicks — event name encodes where + which button.
 * Examples: cta_hero_get_lifetime, cta_navbar_get_lifetime, cta_hero_see_pricing
 */
export function trackCta(location: string, label: string) {
  track(`cta_${slug(location)}_${slug(label)}`);
}

/** In-page or route navigation clicks (nav, footer, anchors). */
export function trackNav(label: string, location = 'nav') {
  track(`nav_${slug(location)}_${slug(label)}`);
}
