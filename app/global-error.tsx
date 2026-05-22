'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Auto-reload once for transient errors (Clerk token refresh, network hiccups)
  useEffect(() => {
    const key = 'prysmor_err_reloaded';
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1');
      setTimeout(() => window.location.reload(), 800);
    }
  }, []);

  return (
    <html lang="en">
      <body style={{
        background: '#080808',
        color: 'white',
        fontFamily: 'system-ui, sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        margin: 0,
      }}>
        <div style={{ textAlign: 'center', padding: '40px', maxWidth: '480px' }}>
          {/* Logo */}
          <div style={{
            width: '48px', height: '48px', borderRadius: '12px',
            background: 'rgba(57,255,106,0.08)', border: '1px solid rgba(57,255,106,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#39FF6A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>

          <p style={{ fontSize: '18px', fontWeight: 700, color: '#fff', margin: '0 0 8px', letterSpacing: '-0.4px' }}>
            Something went wrong
          </p>
          <p style={{ fontSize: '13px', color: '#555', margin: '0 0 28px', lineHeight: 1.6 }}>
            Reloading automatically…
          </p>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              onClick={() => { sessionStorage.removeItem('prysmor_err_reloaded'); reset(); }}
              style={{
                background: '#39FF6A', color: '#000', border: 'none',
                padding: '10px 24px', borderRadius: '8px', cursor: 'pointer',
                fontWeight: 700, fontSize: '13px',
              }}
            >
              Try again
            </button>
            <button
              onClick={() => { sessionStorage.removeItem('prysmor_err_reloaded'); window.location.href = '/'; }}
              style={{
                background: 'transparent', color: '#555', border: '1px solid #1e1e1e',
                padding: '10px 24px', borderRadius: '8px', cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              Go home
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
