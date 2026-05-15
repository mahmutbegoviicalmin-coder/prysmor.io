'use client';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{ background: '#080808', color: 'white', fontFamily: 'system-ui', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center', padding: '40px', maxWidth: '500px' }}>
        <p style={{ color: '#666', fontSize: '12px', marginBottom: '8px' }}>Page error</p>
        <p style={{ color: '#444', fontSize: '11px', marginBottom: '24px', fontFamily: 'monospace' }}>{error.message}</p>
        <button onClick={reset} style={{ background: '#39FF6A', color: '#000', border: 'none', padding: '10px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
          Reload
        </button>
      </div>
    </div>
  );
}
