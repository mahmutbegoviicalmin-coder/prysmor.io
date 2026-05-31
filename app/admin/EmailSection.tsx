'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Mail, Loader2, RefreshCw, Play, ToggleLeft, ToggleRight,
  Users, Send, AlertCircle, Rocket, ListOrdered,
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
  unpaidEligible?: number;
  unpaidInCampaign?: number;
  unpaidPending?: number;
  enrollmentCounts: Record<string, number>;
  logs: EmailLog[];
}

export function EmailSection() {
  const [data, setData]               = useState<EmailStats | null>(null);
  const [loading, setLoading]         = useState(true);
  const [running, setRunning]         = useState(false);
  const [starting, setStarting]       = useState<FunnelId | null>(null);
  const [saving, setSaving]           = useState<string | null>(null);
  const [runResult, setRunResult]     = useState<string | null>(null);
  const [error, setError]             = useState('');
  const [errorHint, setErrorHint]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setErrorHint('');
    try {
      const res = await fetch('/api/admin/email');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load');
      setData(json);
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

  async function postAction(action: 'process-queue' | 'start-campaign', funnelId?: FunnelId) {
    if (action === 'start-campaign' && funnelId) setStarting(funnelId);
    else setRunning(true);
    setRunResult(null);
    setError('');
    setErrorHint('');
    try {
      const res = await fetch('/api/admin/email', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action, funnelId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorHint(json.hint ?? '');
        throw new Error(json.error ?? 'Request failed');
      }

      if (action === 'start-campaign' && json.enroll) {
        const e = json.enroll;
        const q = json.queue;
        setRunResult(
          `Campaign started: enrolled ${e.enrolled} unpaid (${e.skipped} already in funnel). ` +
          `Queue: sent ${q.sent}, skipped ${q.skipped}${q.dailyCapHit ? ' — daily cap hit, rest sends tomorrow' : ''}.`,
        );
      } else {
        setRunResult(
          `Sent ${json.sent}, skipped ${json.skipped}, processed ${json.processed}` +
          `${json.dailyCapHit ? ' (daily cap reached)' : ''}`,
        );
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setRunning(false);
      setStarting(null);
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
  const unpaidTotal = data?.unpaidUsers ?? 0;
  const unpaidEligible = data?.unpaidEligible ?? unpaidTotal;
  const unpaidPending = data?.unpaidPending ?? unpaidEligible;
  const daysToReachAll = unpaidPending > 0 ? Math.ceil(unpaidPending / cap) : 0;

  return (
    <div className="space-y-6">
      {error && (
        <div className="px-4 py-3 rounded-[10px] border border-red-500/20 bg-red-500/[0.06] text-[13px] text-red-400">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
          {errorHint && (
            <p className="mt-2 text-[12px] text-[#9CA3AF] pl-6">{errorHint}</p>
          )}
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
          {
            icon: Users,
            label: 'Unpaid users',
            value: unpaidTotal,
            sub: 'Same as Users tab (no active license)',
          },
          {
            icon: Mail,
            label: 'Ready for email',
            value: unpaidEligible,
            sub: unpaidPending > 0
              ? `${unpaidPending} not in campaign yet`
              : 'All eligible users enrolled',
          },
          {
            icon: ListOrdered,
            label: 'In campaign queue',
            value: data?.unpaidInCampaign ?? data?.enrollmentCounts['unpaid-starter'] ?? 0,
            sub: 'Active unpaid-starter enrollments',
          },
          {
            icon: Send,
            label: 'Sent today',
            value: `${sent} / ${cap}`,
            sub: 'Resend free: stay under 100/day total',
          },
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
              Unpaid campaign sends up to {cap} welcome emails per day, then continues on following days.
              {daysToReachAll > 1 && (
                <span className="text-[#9CA3AF]"> ~{daysToReachAll} days to reach all {unpaidPending} pending.</span>
              )}
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

      {/* Manual queue only */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => postAction('process-queue')}
          disabled={running || !!starting}
          className="flex items-center gap-2 px-4 py-2.5 rounded-[9px] border border-white/[0.08] text-[13px] text-[#9CA3AF] hover:text-white disabled:opacity-50"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Run queue only
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

      {/* Campaigns */}
      <div>
        <h3 className="text-[14px] font-semibold text-white mb-1">Campaigns</h3>
        <p className="text-[12px] text-[#6B7280] mb-3">
          Each campaign is an automated email sequence. Select one and start it for all unpaid users (oldest signups first).
        </p>
        <div className="space-y-3">
          {(Object.keys(FUNNEL_DEFINITIONS) as FunnelId[]).map((id) => {
            const def = FUNNEL_DEFINITIONS[id];
            const enabled = data?.settings.funnels[id]?.enabled ?? false;
            const active = data?.enrollmentCounts[id] ?? 0;
            const isUnpaidCampaign = id === 'unpaid-starter';
            const canStart = isUnpaidCampaign && enabled && unpaidPending > 0;

            return (
              <div
                key={id}
                className={`rounded-[12px] border p-5 ${
                  isUnpaidCampaign
                    ? 'border-[#A3FF12]/20 bg-[#A3FF12]/[0.03]'
                    : 'border-white/[0.07] bg-[#111113]'
                }`}
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
                      {isUnpaidCampaign && (
                        <span className="text-[10px] text-[#6B7280]">
                          → {unpaidTotal} unpaid
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-[#6B7280] mb-3">{def.description}</p>
                    <p className="text-[11px] text-[#4B5563]">
                      {active} in queue · {def.steps.length} emails in sequence
                    </p>
                    <ol className="mt-3 space-y-1.5">
                      {def.steps.map((step, i) => (
                        <li key={i} className="text-[11px] text-[#9CA3AF] flex gap-2">
                          <span className="text-[#4B5563] w-16 flex-shrink-0">
                            {step.delayDays === 0 ? 'Day 0' : `Day +${step.delayDays}`}
                          </span>
                          <span>{step.subject}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div className="flex flex-col items-end gap-3">
                    <button
                      disabled={saving === id}
                      onClick={() => toggleFunnel(id, !enabled)}
                      className="flex items-center gap-2 text-[12px] text-[#9CA3AF] hover:text-white transition-colors"
                      title={enabled ? 'Disable campaign' : 'Enable campaign'}
                    >
                      {saving === id ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : enabled ? (
                        <ToggleRight className="w-8 h-8 text-[#A3FF12]" />
                      ) : (
                        <ToggleLeft className="w-8 h-8 text-[#4B5563]" />
                      )}
                    </button>

                    {isUnpaidCampaign && (
                      <button
                        disabled={!enabled || starting === id || unpaidPending === 0}
                        onClick={() => postAction('start-campaign', id)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-[9px] bg-[#A3FF12] text-black text-[13px] font-semibold hover:opacity-90 disabled:opacity-40 whitespace-nowrap"
                      >
                        {starting === id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Rocket className="w-4 h-4" />
                        )}
                        {unpaidPending > 0
                          ? `Start for ${unpaidPending} unpaid`
                          : 'All enrolled'}
                      </button>
                    )}
                  </div>
                </div>

                {isUnpaidCampaign && enabled && unpaidPending > 0 && (
                  <p className="mt-4 text-[11px] text-[#6B7280] border-t border-white/[0.06] pt-3">
                    Order: oldest signup first · {cap} emails/day · follow-ups at +2d and +5d from each user&apos;s start day.
                    Stops if they subscribe or unsubscribe.
                  </p>
                )}
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
                  <th className="px-4 py-3 font-medium">Campaign</th>
                  <th className="px-4 py-3 font-medium">Step</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Subject</th>
                </tr>
              </thead>
              <tbody>
                {(data?.logs ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-[#4B5563]">
                      No emails sent yet. Start the unpaid campaign above.
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
        Hourly cron: <code className="text-[#6B7280]">/api/cron/email-funnels</code>.
        If queue fails with an index error, deploy{' '}
        <code className="text-[#6B7280]">firestore.indexes.json</code> in Firebase Console.
      </p>
    </div>
  );
}
