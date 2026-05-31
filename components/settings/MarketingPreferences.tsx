'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

export function MarketingPreferences() {
  const [optIn, setOptIn]       = useState(true);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [message, setMessage]   = useState('');

  useEffect(() => {
    fetch('/api/user/marketing')
      .then((r) => r.json())
      .then((d) => {
        setOptIn(d.marketingOptIn !== false && !d.unsubscribed);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function toggle() {
    const next = !optIn;
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/user/marketing', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ marketingOptIn: next }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setOptIn(next);
      setMessage(next ? 'You will receive product tips and offers.' : 'Unsubscribed from marketing emails.');
    } catch {
      setMessage('Could not save preference. Try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-[#6B7280] py-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Loading…
      </div>
    );
  }

  return (
    <div>
      <label className="flex items-start gap-3 cursor-pointer group">
        <input
          type="checkbox"
          checked={optIn}
          disabled={saving}
          onChange={toggle}
          className="mt-1 w-4 h-4 rounded border-white/20 accent-[#39FF6A]"
        />
        <div>
          <p className="text-[13px] font-medium text-white group-hover:text-[#D1D5DB] transition-colors">
            Product updates & tips
          </p>
          <p className="text-[11px] text-[#6B7280] mt-1 leading-relaxed">
            Occasional emails about new features, VFX tips, and plan offers. Support replies when you contact us are always sent.
          </p>
        </div>
      </label>
      {message && (
        <p className={`text-[11px] mt-3 ${optIn ? 'text-[#6B7280]' : 'text-amber-400/80'}`}>{message}</p>
      )}
    </div>
  );
}
