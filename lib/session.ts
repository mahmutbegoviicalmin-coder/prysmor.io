export function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let sessionId = localStorage.getItem('prysmor_session_id');
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      localStorage.setItem('prysmor_session_id', sessionId);
    }
    return sessionId;
  } catch {
    return crypto.randomUUID();
  }
}
