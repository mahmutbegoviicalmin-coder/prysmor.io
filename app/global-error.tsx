'use client';

import { useEffect } from 'react';

function clearClerkSession() {
  // Clear all cookies for this domain
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0].trim();
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
  });
  // Clear local + session storage Clerk state
  try {
    Object.keys(localStorage).filter(k => k.startsWith('clerk') || k.startsWith('__clerk') || k.startsWith('prysmor')).forEach(k => localStorage.removeItem(k));
    Object.keys(sessionStorage).filter(k => k.startsWith('clerk') || k.startsWith('__clerk') || k.startsWith('prysmor')).forEach(k => sessionStorage.removeItem(k));
  } catch {}
  window.location.href = '/';
}

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Auto-reload once for transient errors (network hiccup, Clerk token refresh)
    const key = 'prysmor_err_reloaded';
    try {
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        setTimeout(() => window.location.reload(), 1000);
        return;
      }
    } catch {}
  }, []);

  return (
    <html lang="en">
      <body style={{
        background: '#0a0a0a',
        color: 'white',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        margin: 0,
        padding: '24px',
        boxSizing: 'border-box',
      }}>
        <div style={{ textAlign: 'center', maxWidth: '400px', width: '100%' }}>
          {/* Logo mark */}
          <div style={{
            width: '52px', height: '52px', borderRadius: '14px',
            background: 'rgba(57,255,106,0.08)', border: '1px solid rgba(57,255,106,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#39FF6A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>

          <p style={{ fontSize: '16px', fontWeight: 700, color: '#fff', margin: '0 0 8px', letterSpacing: '-0.3px' }}>
            Something went wrong
          </p>
          <p style={{ fontSize: '13px', color: '#6B7280', margin: '0 0 28px', lineHeight: 1.6 }}>
            This is usually caused by an expired session.<br/>
            Refreshing automatically…
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              onClick={() => {
                try { sessionStorage.removeItem('prysmor_err_reloaded'); } catch {}
                reset();
              }}
              style={{
                background: '#39FF6A', color: '#000', border: 'none',
                padding: '12px 24px', borderRadius: '9px', cursor: 'pointer',
                fontWeight: 700, fontSize: '14px', width: '100%',
              }}
            >
              Try again
            </button>
            <button
              onClick={clearClerkSession}
              style={{
                background: 'transparent', color: '#9CA3AF',
                border: '1px solid #1e1e1e',
                padding: '12px 24px', borderRadius: '9px', cursor: 'pointer',
                fontSize: '13px', width: '100%',
              }}
            >
              Clear session &amp; go home
            </button>
          </div>

          <p style={{ fontSize: '11px', color: '#374151', marginTop: '20px' }}>
            If this keeps happening, try clearing your browser cache.
          </p>
        </div>
      </body>
    </html>
  );
}
