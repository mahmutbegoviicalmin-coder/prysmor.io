const SESSION_KEY    = 'prysmor_session_id';
const SESSION_TS_KEY = 'prysmor_session_ts';
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes of inactivity = new session

export function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  try {
    const now       = Date.now();
    const stored    = localStorage.getItem(SESSION_KEY);
    const lastTouch = parseInt(localStorage.getItem(SESSION_TS_KEY) ?? '0', 10);
    const expired   = now - lastTouch > SESSION_TTL_MS;

    const sessionId = (stored && !expired) ? stored : crypto.randomUUID();

    // Refresh the last-touched timestamp on every call
    localStorage.setItem(SESSION_KEY,    sessionId);
    localStorage.setItem(SESSION_TS_KEY, String(now));

    return sessionId;
  } catch {
    return crypto.randomUUID();
  }
}
