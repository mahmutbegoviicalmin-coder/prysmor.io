'use client';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: '#080808', color: 'white', fontFamily: 'system-ui', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', margin: 0 }}>
        <div style={{ textAlign: 'center', padding: '40px', maxWidth: '500px' }}>
          <p style={{ color: '#666', fontSize: '12px', marginBottom: '16px' }}>Something went wrong</p>
          <p style={{ color: '#444', fontSize: '11px', marginBottom: '24px', fontFamily: 'monospace', wordBreak: 'break-all' }}>{error.message}</p>
          <button onClick={reset} style={{ background: '#39FF6A', color: '#000', border: 'none', padding: '10px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
