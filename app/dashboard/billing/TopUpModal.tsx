'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Zap, Star, Rocket, Check, Loader2 } from 'lucide-react';

interface CreditPack {
  id:       string;
  label:    string;
  credits:  number;
  seconds:  number;
  price:    string;
  popular?: boolean;
}

const PACKS: CreditPack[] = [
  { id: 'boost',   label: 'Boost',   credits: 500,  seconds: 125,  price: '$9.99'  },
  { id: 'creator', label: 'Creator', credits: 1500, seconds: 375,  price: '$24.99', popular: true },
  { id: 'power',   label: 'Power',   credits: 4000, seconds: 1000, price: '$59.99' },
];

const PACK_ICONS = {
  boost:   Zap,
  creator: Star,
  power:   Rocket,
};

interface TopUpModalProps {
  open:    boolean;
  onClose: () => void;
}

export function TopUpModal({ open, onClose }: TopUpModalProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  // Close on Escape
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKey);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [open, handleKey]);

  if (!open) return null;

  async function handleBuy(packId: string) {
    setLoading(packId);
    setError(null);
    try {
      const res  = await fetch('/api/checkout/topup', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ packId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Checkout failed');
      window.location.href = json.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(null);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="topup-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
      >
        <div
          className="relative w-full max-w-[560px] rounded-[18px] border border-white/[0.09] bg-[#0C0C14] shadow-[0_40px_120px_rgba(0,0,0,0.9)] pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-7 h-7 rounded-full flex items-center justify-center text-[#6B7280] hover:text-white hover:bg-white/[0.07] transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Header */}
          <div className="px-7 pt-7 pb-5">
            <h2 id="topup-title" className="text-[20px] font-semibold text-white tracking-tight">
              Top up credits
            </h2>
            <p className="text-[13px] text-[#6B7280] mt-1">
              One-time purchase — credits added instantly to your balance.
            </p>
          </div>

          {/* Divider */}
          <div className="h-px bg-white/[0.06] mx-7" />

          {/* Packs */}
          <div className="px-7 py-5 flex flex-col gap-3">
            {PACKS.map((pack) => {
              const Icon = PACK_ICONS[pack.id as keyof typeof PACK_ICONS] ?? Zap;
              const isLoading = loading === pack.id;
              return (
                <div
                  key={pack.id}
                  className={`relative rounded-[12px] border p-4 flex items-center gap-4 transition-colors ${
                    pack.popular
                      ? 'border-[#A3FF12]/30 bg-[#A3FF12]/[0.04]'
                      : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.12]'
                  }`}
                >
                  {/* Popular badge */}
                  {pack.popular && (
                    <span className="absolute -top-2.5 left-4 text-[10px] font-semibold text-[#050505] bg-[#A3FF12] px-2 py-0.5 rounded-full">
                      Most Popular
                    </span>
                  )}

                  {/* Icon */}
                  <div className={`w-9 h-9 rounded-[8px] flex items-center justify-center flex-shrink-0 ${
                    pack.popular ? 'bg-[#A3FF12]/[0.12]' : 'bg-white/[0.05]'
                  }`}>
                    <Icon className={`w-4 h-4 ${pack.popular ? 'text-[#A3FF12]' : 'text-[#9CA3AF]'}`} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[14px] font-semibold text-white">{pack.label}</span>
                      <span className="text-[12px] text-[#6B7280]">— {pack.credits.toLocaleString()} credits</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <Check className="w-3 h-3 text-[#A3FF12] flex-shrink-0" />
                      <span className="text-[11px] text-[#4B5563]">
                        ~{pack.seconds}s of AI VFX · Never expires
                      </span>
                    </div>
                  </div>

                  {/* Price + CTA */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-[15px] font-semibold text-white">{pack.price}</span>
                    <button
                      onClick={() => handleBuy(pack.id)}
                      disabled={loading !== null}
                      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-[8px] text-[12px] font-semibold transition-all ${
                        pack.popular
                          ? 'bg-[#A3FF12] text-[#050505] hover:bg-[#B6FF3C] disabled:opacity-60'
                          : 'border border-white/[0.12] text-white hover:bg-white/[0.05] disabled:opacity-60'
                      }`}
                    >
                      {isLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : null}
                      {isLoading ? 'Loading…' : 'Buy'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Error message */}
          {error && (
            <div className="mx-7 mb-5 rounded-[8px] border border-red-500/20 bg-red-500/[0.06] px-4 py-3">
              <p className="text-[12px] text-red-400">{error}</p>
            </div>
          )}

          {/* Footer */}
          <div className="px-7 pb-6 pt-0">
            <p className="text-[11px] text-[#374151] text-center">
              Secure checkout via Lemon Squeezy · Credits added immediately after payment
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
