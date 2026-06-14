'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Wallet, Check, X } from 'lucide-react';
import type { PayoutRequest } from '@/lib/payouts';

const CARD = 'rounded-[13px] border border-white/[0.07] bg-[#111113]';

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatusBadge({ status }: { status: PayoutRequest['status'] }) {
  const styles = {
    pending: 'text-amber-400/80 bg-amber-500/10 border-amber-500/20',
    paid: 'text-[#39FF6A]/80 bg-[#39FF6A]/10 border-[#39FF6A]/20',
    rejected: 'text-red-400/80 bg-red-500/10 border-red-500/20',
  };
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[status]}`}>
      {status}
    </span>
  );
}

export function PayoutsSection() {
  const [requests, setRequests] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/payouts')
      .then((r) => r.json())
      .then((d) => setRequests(d.requests ?? []))
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateStatus = async (id: string, status: 'paid' | 'rejected') => {
    const label = status === 'paid' ? 'Mark this payout as paid?' : 'Reject this payout request?';
    if (!confirm(label)) return;
    setActingId(id);
    try {
      const res = await fetch(`/api/admin/payouts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert((d as { error?: string }).error ?? `Failed to update payout (${res.status})`);
        return;
      }
      load();
    } finally {
      setActingId(null);
    }
  };

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-[#4B5563]">Payout requests</p>
          <h2 className="text-[20px] font-bold tracking-tight text-white">Partner payouts</h2>
          <p className="mt-1 text-[12px] text-[#4B5563]">
            PayPal and bank transfer details submitted by affiliates.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-[8px] border border-white/[0.08] px-3 py-2 text-[11px] text-[#6B7280] transition-all hover:border-white/[0.15] hover:text-white disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-[#333]" />
        </div>
      ) : requests.length === 0 ? (
        <div className={`${CARD} px-6 py-16 text-center text-[13px] text-[#4B5563]`}>
          No payout requests yet.
        </div>
      ) : (
        <div className="space-y-4">
          {pendingCount > 0 && (
            <p className="text-[12px] text-amber-400/70">{pendingCount} pending request(s)</p>
          )}
          {requests.map((req) => (
            <div key={req.id} className={`${CARD} p-5 sm:p-6`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[15px] font-semibold text-white">{req.email}</p>
                    <StatusBadge status={req.status} />
                  </div>
                  <p className="mt-1 text-[12px] text-[#6B7280]">{fmtDate(req.createdAt)}</p>
                </div>
                <p className="text-[22px] font-bold tracking-tight text-[#39FF6A]">${req.amount.toFixed(2)}</p>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4B5563]">Method</p>
                  <p className="mt-1 text-[13px] text-white/80">
                    {req.method === 'paypal' ? 'PayPal' : 'Bank transfer'}
                  </p>
                </div>
                <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4B5563]">Affiliate ID</p>
                  <p className="mt-1 break-all font-mono text-[12px] text-white/60">{req.affiliateId}</p>
                </div>
              </div>

              {req.method === 'paypal' ? (
                <div className="mt-3 rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4B5563]">PayPal.me</p>
                  <a
                    href={req.paypalMeLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block break-all text-[13px] text-[#60A5FA] hover:underline"
                  >
                    {req.paypalMeLink}
                  </a>
                </div>
              ) : (
                req.bank && (
                  <div className="mt-3 grid gap-2 rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-4 sm:grid-cols-2">
                    {[
                      ['Name', `${req.bank.firstName} ${req.bank.lastName}`],
                      ['Phone', req.bank.phone],
                      ['Address', req.bank.address],
                      ['City', req.bank.city],
                      ['Account number', req.bank.accountNumber],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4B5563]">{label}</p>
                        <p className="mt-1 text-[13px] text-white/75">{value}</p>
                      </div>
                    ))}
                  </div>
                )
              )}

              {req.status === 'pending' && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={actingId === req.id}
                    onClick={() => updateStatus(req.id, 'paid')}
                    className="inline-flex items-center gap-1.5 rounded-[8px] bg-[#39FF6A] px-4 py-2 text-[12px] font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {actingId === req.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Mark as paid
                  </button>
                  <button
                    type="button"
                    disabled={actingId === req.id}
                    onClick={() => updateStatus(req.id, 'rejected')}
                    className="inline-flex items-center gap-1.5 rounded-[8px] border border-red-500/20 px-4 py-2 text-[12px] font-medium text-red-400/80 transition-colors hover:border-red-500/40 hover:text-red-400 disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                    Reject
                  </button>
                </div>
              )}

              {req.paidAt && (
                <p className="mt-3 text-[11px] text-[#4B5563]">Paid on {fmtDate(req.paidAt)}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
