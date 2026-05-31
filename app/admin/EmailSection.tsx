'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Mail, Loader2, RefreshCw, Play, ToggleLeft, ToggleRight,
  Users, Send, AlertCircle,
} from 'lucide-react';
import { FUNNEL_DEFINITIONS } from '@/lib/email/funnels';
import type { FunnelId } from '@/lib/email/constants';

interface EmailLog {
  id: string;
  userId: string;
  email: string;
  funnelId: string;
  step: number;
  status: string;
  subject: string;
  error?: string;
  createdAt: string | null;
}

interface EmailStats {
  settings: {
    dailyMarketingCap: number;
    funnels: Record<FunnelId, { enabled: boolean }>;
  };
  dailySent: number;
  activeEnrollments: number;
  unpaidUsers: number;
  enrollmentCounts: Record<string, number>;
  logs: EmailLog[];
}

export function EmailSection() {
  const [data, setData]       = useState<EmailStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [saving, setSaving]     = useState<string | null>(null);
  const [runResult, setRunResult] = useState<string | null>(null);
  const [error, setError]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/email');
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to load');
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleFunnel(id: FunnelId, enabled: boolean) {
    setSaving(id);
    try {
      const res = await fetch('/api/admin/email', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ funnels: { [id]: { enabled } } }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Save failed');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(null);
    }
  }

  async function updateDailyCap(cap: number) {
    setSaving('cap');
    try {
      const res = await fetch('/api/admin/email', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ dailyMarketingCap: cap }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Save failed');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(null);
    }
  }

  async function runQueue() {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await fetch('/api/admin/email', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Run failed');
      setRunResult(`Sent ${json.sent}, skipped ${json.skipped}, processed ${json.processed}${json.dailyCapHit ? ' (daily cap reached)' : ''}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setRunning(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20 text-[#6B7280]">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading email…
      </div>
    );
  }

  const cap = data?.settings.dailyMarketingCap ?? 40;
  const sent = data?.dailySent ?? 0;
  const capPct = Math.min((sent / cap) * 100, 100);

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-[10px] border border-red-500/20 bg-red-500/[0.06] text-[13px] text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {runResult && (
        <div className="px-4 py-3 rounded-[10px] border border-[#A3FF12]/20 bg-[#A3FF12]/[0.06] text-[13px] text-[#A3FF12]">
          {runResult}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: Users, label: 'Unpaid users', value: data?.unpaidUsers ?? 0, sub: 'Eligible for unpaid funnel' },
          { icon: Mail, label: 'Active enrollments', value: data?.activeEnrollments ?? 0, sub: 'In a funnel now' },
          { icon: Send, label: 'Sent today', value: `${sent} / ${cap}`, sub: 'Resend free plan: keep under 100/day total' },
          { icon: Mail, label: 'From address', value: 'hello@', sub: 'prysmor.io (verified)' },
        ].map((c) => (
          <div key={c.label} className="rounded-[12px] border border-white/[0.07] bg-[#111113] p-4">
            <div className="flex items-center gap-2 mb-2">
              <c.icon className="w-3.5 h-3.5 text-[#A3FF12]" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[#4B5563]">{c.label}</span>
            </div>
            <p className="text-[22px] font-bold text-white leading-none">{c.value}</p>
            <p className="text-[10px] text-[#374151] mt-1.5">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Daily cap */}
      <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
          <div>
            <h3 className="text-[14px] font-semibold text-white">Daily marketing cap</h3>
            <p className="text-[12px] text-[#6B7280] mt-0.5">
              Limits automated funnel sends (support emails are separate). Protects Resend free quota.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {[30, 40, 60, 80].map((n) => (
              <button
                key={n}
                disabled={saving === 'cap'}
                onClick={() => updateDailyCap(n)}
                className={`px-3 py-1.5 rounded-[8px] text-[12px] font-medium border transition-all ${
                  cap === n
                    ? 'bg-[#A3FF12]/10 border-[#A3FF12]/30 text-[#A3FF12]'
                    : 'border-white/[0.08] text-[#6B7280] hover:text-white'
                }`}
              >
                {n}/day
              </button>
            ))}
          </div>
        </div>
        <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${capPct >= 90 ? 'bg-orange-400' : 'bg-[#A3FF12]'}`}
            style={{ width: `${capPct}%` }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={runQueue}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2.5 rounded-[9px] bg-[#A3FF12] text-black text-[13px] font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Run queue now
        </button>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-[9px] border border-white/[0.08] text-[13px] text-[#9CA3AF] hover:text-white"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Funnels */}
      <div>
        <h3 className="text-[14px] font-semibold text-white mb-3">Upsell funnels</h3>
        <div className="space-y-3">
          {(Object.keys(FUNNEL_DEFINITIONS) as FunnelId[]).map((id) => {
            const def = FUNNEL_DEFINITIONS[id];
            const enabled = data?.settings.funnels[id]?.enabled ?? false;
            const active = data?.enrollmentCounts[id] ?? 0;
            return (
              <div
                key={id}
                className="rounded-[12px] border border-white/[0.07] bg-[#111113] p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-[15px] font-semibold text-white">{def.name}</h4>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                        enabled
                          ? 'text-[#A3FF12] border-[#A3FF12]/25 bg-[#A3FF12]/[0.08]'
                          : 'text-[#6B7280] border-white/[0.06]'
                      }`}>
                        {enabled ? 'ON' : 'OFF'}
                      </span>
                    </div>
                    <p className="text-[12px] text-[#6B7280] mb-3">{def.description}</p>
                    <p className="text-[11px] text-[#4B5563]">
                      {active} active enrollment{active !== 1 ? 's' : ''} · {def.steps.length} emails
                    </p>
                    <ol className="mt-3 space-y-1.5">
                      {def.steps.map((step, i) => (
                        <li key={i} className="text-[11px] text-[#9CA3AF] flex gap-2">
                          <span className="text-[#4B5563] w-16 flex-shrink-0">
                            {step.delayDays === 0 ? 'Immediately' : `+${step.delayDays}d`}
                          </span>
                          <span className="truncate">{step.subject}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <button
                    disabled={saving === id}
                    onClick={() => toggleFunnel(id, !enabled)}
                    className="flex items-center gap-2 text-[12px] text-[#9CA3AF] hover:text-white transition-colors"
                  >
                    {saving === id ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : enabled ? (
                      <ToggleRight className="w-8 h-8 text-[#A3FF12]" />
                    ) : (
                      <ToggleLeft className="w-8 h-8 text-[#4B5563]" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Logs */}
      <div>
        <h3 className="text-[14px] font-semibold text-white mb-3">Recent sends</h3>
        <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-white/[0.06] text-[#4B5563] text-left">
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Funnel</th>
                  <th className="px-4 py-3 font-medium">Step</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Subject</th>
                </tr>
              </thead>
              <tbody>
                {(data?.logs ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-[#4B5563]">
                      No emails sent yet. Enable a funnel and run the queue.
                    </td>
                  </tr>
                ) : (
                  data!.logs.map((log) => (
                    <tr key={log.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5 text-[#6B7280] whitespace-nowrap">
                        {log.createdAt
                          ? new Date(log.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-[#D1D5DB]">{log.email}</td>
                      <td className="px-4 py-2.5 text-[#9CA3AF]">{log.funnelId}</td>
                      <td className="px-4 py-2.5 text-[#9CA3AF]">{log.step + 1}</td>
                      <td className="px-4 py-2.5">
                        <span className={log.status === 'sent' ? 'text-[#A3FF12]' : 'text-red-400'}>
                          {log.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[#9CA3AF] max-w-[200px] truncate">{log.subject}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-[#374151] leading-relaxed">
        Cron runs hourly on Vercel (<code className="text-[#6B7280]">/api/cron/email-funnels</code>).
        Set <code className="text-[#6B7280]">CRON_SECRET</code> in env. Deploy{' '}
        <code className="text-[#6B7280]">firestore.indexes.json</code> for email_enrollments queries.
      </p>
    </div>
  );
}
