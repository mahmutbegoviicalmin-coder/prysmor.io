'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Plus, RefreshCw, Loader2, X, Edit2, Trash2, Link2, UserCheck, UserX,
} from 'lucide-react';
import type { AffiliateChart } from '@/lib/affiliateChart';
import { DEFAULT_AFFILIATE_CHART } from '@/lib/affiliateChart';

interface AffiliateRow {
  id: string;
  email: string;
  userId: string | null;
  code: string;
  commissionPercent: number;
  manualTotalEarnings: number;
  manualPendingEarnings: number;
  manualPaidEarnings: number;
  manualActiveMembers: number;
  manualInactiveMembers: number;
  manualStarterCount: number;
  manualProCount: number;
  manualExclusiveCount: number;
  manualChart: AffiliateChart;
  note: string;
  status: 'active' | 'inactive';
  referralCount?: number;
}

type EditState = {
  commissionPercent: string;
  status: 'active' | 'inactive';
  manualTotalEarnings: string;
  manualPendingEarnings: string;
  manualPaidEarnings: string;
  manualStarterCount: string;
  manualProCount: string;
  manualExclusiveCount: string;
  note: string;
  userId: string;
};

export function AffiliatesSection() {
  const [affiliates, setAffiliates] = useState<AffiliateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newCommission, setNewCommission] = useState('15');
  const [newUserId, setNewUserId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/affiliates')
      .then((r) => r.json())
      .then((d) => setAffiliates(d.affiliates ?? []))
      .catch(() => setAffiliates([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addAffiliate = async () => {
    setError('');
    if (!newEmail.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/affiliates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail.trim(),
          code: newCode.trim() || undefined,
          commissionPercent: Number(newCommission) || 15,
          userId: newUserId.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to create staff member');
        return;
      }
      setShowAdd(false);
      setNewEmail('');
      setNewCode('');
      setNewCommission('15');
      setNewUserId('');
      load();
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (aff: AffiliateRow) => {
    setEditId(aff.id);
    setEditState({
      commissionPercent: String(aff.commissionPercent),
      status: aff.status,
      manualTotalEarnings: String(aff.manualTotalEarnings),
      manualPendingEarnings: String(aff.manualPendingEarnings),
      manualPaidEarnings: String(aff.manualPaidEarnings),
      manualStarterCount: String(aff.manualStarterCount ?? 0),
      manualProCount: String(aff.manualProCount ?? 0),
      manualExclusiveCount: String(aff.manualExclusiveCount ?? 0),
      note: aff.note,
      userId: aff.userId ?? '',
    });
  };

  const saveEdit = async (id: string) => {
    if (!editState) return;
    setSaving(true);
    await fetch(`/api/admin/affiliates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commissionPercent: Number(editState.commissionPercent),
        status: editState.status,
        manualTotalEarnings: Number(editState.manualTotalEarnings),
        manualPendingEarnings: Number(editState.manualPendingEarnings),
        manualPaidEarnings: Number(editState.manualPaidEarnings),
        manualStarterCount: Number(editState.manualStarterCount),
        manualProCount: Number(editState.manualProCount),
        manualExclusiveCount: Number(editState.manualExclusiveCount),
        note: editState.note,
        userId: editState.userId.trim() || null,
        manualChart: DEFAULT_AFFILIATE_CHART,
      }),
    });
    setSaving(false);
    setEditId(null);
    load();
  };

  const deleteAffiliate = async (id: string) => {
    if (!confirm('Delete this staff profile?')) return;
    setDeletingId(id);
    await fetch(`/api/admin/affiliates/${id}`, { method: 'DELETE' });
    setDeletingId(null);
    load();
  };

  const inputClass =
    'w-full rounded-lg border border-white/[0.08] bg-[#0a0a0a] px-3 py-2 text-[13px] text-white outline-none focus:border-[#39FF6A]/40';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-semibold text-white">Staff</h2>
          <p className="mt-1 text-[13px] text-[#6B7280]">
            Add partners by email only. They auto-link when they sign in with the same email.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-2 text-[12px] text-[#9CA3AF] hover:text-white"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#39FF6A] px-3 py-2 text-[12px] font-semibold text-black"
          >
            <Plus className="h-3.5 w-3.5" />
            Add staff
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-[#333]" />
        </div>
      ) : affiliates.length === 0 ? (
        <div className="rounded-xl border border-white/[0.07] bg-[#0c0c0c] px-6 py-16 text-center text-[13px] text-[#555]">
          No staff yet.
        </div>
      ) : (
        <div className="space-y-3">
          {affiliates.map((aff) => (
            <div
              key={aff.id}
              className="rounded-xl border border-white/[0.07] bg-[#0c0c0c] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[14px] font-semibold text-white">{aff.email}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        aff.status === 'active'
                          ? 'bg-[#39FF6A]/10 text-[#39FF6A]'
                          : 'bg-white/[0.05] text-[#666]'
                      }`}
                    >
                      {aff.status}
                    </span>
                    {aff.userId ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-[#39FF6A]/80">
                        <UserCheck className="h-3 w-3" />
                        Linked
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] text-[#F59E0B]">
                        <UserX className="h-3 w-3" />
                        Awaiting login
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-[#666]">
                    <code className="rounded bg-white/[0.04] px-2 py-0.5 font-mono text-[#39FF6A]">
                      {aff.code}
                    </code>
                    <span>{aff.commissionPercent}% commission</span>
                    <span>
                      S {aff.manualStarterCount ?? 0} · P {aff.manualProCount ?? 0} · E{' '}
                      {aff.manualExclusiveCount ?? 0}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Link2 className="h-3 w-3" />
                      prysmor.io/?ref={aff.code}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 text-center">
                  {[
                    { label: 'Total', value: `$${aff.manualTotalEarnings}` },
                    { label: 'Available', value: `$${aff.manualPendingEarnings}` },
                    { label: 'Paid', value: `$${aff.manualPaidEarnings}` },
                  ].map((s) => (
                    <div key={s.label}>
                      <p className="text-[15px] font-bold text-white">{s.value}</p>
                      <p className="text-[10px] uppercase tracking-wider text-[#444]">{s.label}</p>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(aff)}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] px-3 py-1.5 text-[12px] text-[#888] hover:text-white"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteAffiliate(aff.id)}
                    disabled={deletingId === aff.id}
                    className="rounded-lg border border-red-500/20 px-2.5 py-1.5 text-red-400/70 hover:text-red-400"
                  >
                    {deletingId === aff.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {aff.note && (
                <p className="mt-3 border-t border-white/[0.06] pt-3 text-[12px] text-[#666]">
                  Note: {aff.note}
                </p>
              )}

              {editId === aff.id && editState && (
                <div className="mt-4 border-t border-white/[0.06] pt-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {[
                      ['commissionPercent', 'Commission %'],
                      ['manualTotalEarnings', 'Total ($)'],
                      ['manualPendingEarnings', 'Available ($)'],
                      ['manualPaidEarnings', 'Paid ($)'],
                      ['manualStarterCount', 'Starter referrals'],
                      ['manualProCount', 'Pro referrals'],
                      ['manualExclusiveCount', 'Exclusive referrals'],
                    ].map(([key, label]) => (
                      <div key={key}>
                        <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#555]">
                          {label}
                        </label>
                        <input
                          className={inputClass}
                          value={editState[key as keyof EditState]}
                          onChange={(e) =>
                            setEditState((prev) =>
                              prev ? { ...prev, [key]: e.target.value } : prev,
                            )
                          }
                        />
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#555]">
                        Status
                      </label>
                      <select
                        className={inputClass}
                        value={editState.status}
                        onChange={(e) =>
                          setEditState((prev) =>
                            prev
                              ? { ...prev, status: e.target.value as 'active' | 'inactive' }
                              : prev,
                          )
                        }
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#555]">
                        Clerk user ID (optional)
                      </label>
                      <input
                        className={inputClass}
                        value={editState.userId}
                        onChange={(e) =>
                          setEditState((prev) =>
                            prev ? { ...prev, userId: e.target.value } : prev,
                          )
                        }
                        placeholder="Auto-links on login if empty"
                      />
                    </div>
                  </div>

                  <div className="mt-3">
                    <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#555]">
                      Note (visible to partner)
                    </label>
                    <textarea
                      className={`${inputClass} min-h-[72px] resize-y`}
                      value={editState.note}
                      onChange={(e) =>
                        setEditState((prev) => (prev ? { ...prev, note: e.target.value } : prev))
                      }
                    />
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => saveEdit(aff.id)}
                      disabled={saving}
                      className="rounded-lg bg-[#39FF6A] px-4 py-2 text-[12px] font-semibold text-black"
                    >
                      {saving ? 'Saving…' : 'Save changes'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditId(null)}
                      className="rounded-lg border border-white/[0.08] px-4 py-2 text-[12px] text-[#888]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0c0c0c] p-6">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-[16px] font-semibold text-white">Add staff</h3>
              <button type="button" onClick={() => setShowAdd(false)} className="text-[#555]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#555]">
                  Email *
                </label>
                <input
                  className={inputClass}
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="partner@example.com"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#555]">
                  Custom code (optional)
                </label>
                <input
                  className={inputClass}
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="Auto-generated"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#555]">
                  Commission %
                </label>
                <input
                  className={inputClass}
                  value={newCommission}
                  onChange={(e) => setNewCommission(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#555]">
                  Clerk user ID (optional)
                </label>
                <input
                  className={inputClass}
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value)}
                  placeholder="Leave empty — links when they log in"
                />
              </div>
            </div>

            {error && <p className="mt-3 text-[12px] text-red-400">{error}</p>}

            <button
              type="button"
              onClick={addAffiliate}
              disabled={saving || !newEmail.trim()}
              className="mt-5 w-full rounded-lg bg-[#39FF6A] py-2.5 text-[13px] font-semibold text-black disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create staff'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
