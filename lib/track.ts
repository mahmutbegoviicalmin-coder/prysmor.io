import { getSessionId } from './session';

export async function track(event: string, properties: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return;
  try {
    const userId = localStorage.getItem('prysmor_user_id') ?? null;
    await fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: getSessionId(),
        userId,
        event,
        properties,
        page: window.location.pathname,
        referrer: document.referrer || 'direct',
        userAgent: navigator.userAgent,
      }),
    });
  } catch {
    // always fail silently — never break the UI
  }
}
