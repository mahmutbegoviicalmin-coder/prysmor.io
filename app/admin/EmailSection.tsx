'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Loader2, RefreshCw, Play, ToggleLeft, ToggleRight,
  Users, Send, AlertCircle, Rocket, BarChart3, Eye, MousePointerClick,
  ChevronDown, ChevronUp, Save, Pencil,
} from 'lucide-react';
import type { FunnelId } from '@/lib/email/constants';
import type { FunnelDefinition } from '@/lib/email/funnels';

interface EmailLog {
  id: string;
  userId: string;
  email: string;
  funnelId: string;
  step: number;
  status: string;
  subject: string;
  error?: string;
  openedAt?: string | null;
  clickedAt?: string | null;
  openCount?: number;
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
  starterEligible?: number;
  starterInCampaign?: number;
  enrollmentCounts: Record<string, number>;
  campaigns: FunnelDefinition[];
  analytics?: {
    sent: number;
    opened: number;
    clicked: number;
    openRate: number;
  };
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
  const [expanded, setExpanded]       = useState<FunnelId | null>('unpaid-starter');
  const [editing, setEditing]         = useState<Record<string, FunnelDefinition>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setErrorHint('');
    try {
      const res = await fetch('/api/admin/email');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load');
      setData(json);
      const editMap: Record<string, FunnelDefinition> = {};
      for (const c of json.campaigns ?? []) editMap[c.id] = c;
      setEditing(editMap);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleFunnel(id: FunnelId, enabled: boolean) {
    setSaving(`toggle-${id}`);
    try {
      const res = await fetch('/api/admin/email', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ funnels: { [id]: { enabled } } }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(null);
    }
  }

  async function updateDailyCap(cap: number) {
    setSaving('cap');
    setData((prev) =>
      prev ? { ...prev, settings: { ...prev.settings, dailyMarketingCap: cap } } : prev,
    );
    try {
      const res = await fetch('/api/admin/email', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ dailyMarketingCap: cap }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      setData(json);
      setRunResult(`Daily cap saved: ${cap}/day (applies to next queue runs; already-scheduled sends keep their day slot).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
      await load();
    } finally {
      setSaving(null);
    }
  }

  async function saveCampaign(id: FunnelId) {
    const camp = editing[id];
    if (!camp) return;
    setSaving(`save-${id}`);
    try {
      const res = await fetch('/api/admin/email', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          campaign: {
            id,
            override: {
              name:        camp.name,
              description: camp.description,
              steps: camp.steps.map((s) => ({
                delayDays: s.delayDays,
                subject:   s.subject,
                html:      s.html,
              })),
            },
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      setData(json);
      setRunResult(`Campaign "${camp.name}" saved.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(null);
    }
  }

  async function postAction(action: 'process-queue' | 'start-campaign', funnelId: FunnelId) {
    if (action === 'start-campaign') setStarting(funnelId);
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
          `Started "${funnelId}": enrolled ${e.enrolled} (${e.skipped} already in funnel). ` +
          `Queue: sent ${q.sent}, skipped ${q.skipped}, cap ${data?.settings.dailyMarketingCap ?? '?'}/day` +
          `${q.dailyCapHit ? ' — daily cap reached' : ''}.`,
        );
      } else {
        setRunResult(
          `Queue: sent ${json.sent}, skipped ${json.skipped}` +
          `${json.dailyCapHit ? ' (daily cap reached)' : ''}.`,
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

  function updateEditStep(campaignId: FunnelId, stepIdx: number, field: 'subject' | 'html' | 'delayDays', value: string | number) {
    setEditing((prev) => {
      const camp = prev[campaignId];
      if (!camp) return prev;
      const steps = [...camp.steps];
      steps[stepIdx] = { ...steps[stepIdx], [field]: value };
      return { ...prev, [campaignId]: { ...camp, steps } };
    });
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
  const capPct = cap > 0 ? Math.min((sent / cap) * 100, 100) : 0;
  const campaigns = data?.campaigns ?? [];
  const analytics = data?.analytics ?? { sent: 0, opened: 0, clicked: 0, openRate: 0 };

  return (
    <div className="space-y-6">
      {error && (
        <div className="px-4 py-3 rounded-[10px] border border-red-500/20 bg-red-500/[0.06] text-[13px] text-red-400">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
          {errorHint && <p className="mt-2 text-[12px] text-[#9CA3AF] pl-6">{errorHint}</p>}
        </div>
      )}

      {runResult && (
        <div className="px-4 py-3 rounded-[10px] border border-[#A3FF12]/20 bg-[#A3FF12]/[0.06] text-[13px] text-[#A3FF12]">
          {runResult}
        </div>
      )}

      {/* Analytics */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { icon: Users, label: 'Unpaid users', value: data?.unpaidUsers ?? 0, sub: 'No active license' },
          { icon: Send, label: 'Sent today', value: `${sent} / ${cap}`, sub: 'Saved cap applies to queue' },
          { icon: BarChart3, label: 'Total sent', value: analytics.sent, sub: 'Last 200 log entries' },
          { icon: Eye, label: 'Opened', value: analytics.opened, sub: `${analytics.openRate}% open rate` },
          { icon: MousePointerClick, label: 'Clicked', value: analytics.clicked, sub: 'Resend webhook required' },
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
              Max sends per day when you run the queue. Changing cap does not reschedule users already enrolled.
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

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => postAction('process-queue', 'unpaid-starter')}
          disabled={running || !!starting}
          className="flex items-center gap-2 px-4 py-2.5 rounded-[9px] border border-white/[0.08] text-[13px] text-[#9CA3AF] hover:text-white disabled:opacity-50"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Run queue (up to {cap} left today)
        </button>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2.5 rounded-[9px] border border-white/[0.08] text-[13px] text-[#9CA3AF] hover:text-white">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* All campaigns */}
      <div>
        <h3 className="text-[14px] font-semibold text-white mb-1">All campaigns</h3>
        <p className="text-[12px] text-[#6B7280] mb-3">
          Upsell sequences stored in your project. Edit subjects and body HTML, then Save. Opens/clicks need Resend webhook → /api/webhooks/resend
        </p>
        <div className="space-y-3">
          {campaigns.map((def) => {
            const id = def.id as FunnelId;
            const enabled = data?.settings.funnels[id]?.enabled ?? false;
            const active = data?.enrollmentCounts[id] ?? 0;
            const isOpen = expanded === id;
            const camp = editing[id] ?? def;
            const isUnpaid = id === 'unpaid-starter';
            const pending = isUnpaid
              ? (data?.unpaidPending ?? 0)
              : Math.max(0, (data?.starterEligible ?? 0) - (data?.starterInCampaign ?? 0));

            return (
              <div
                key={id}
                className={`rounded-[12px] border p-5 ${
                  isUnpaid ? 'border-[#A3FF12]/20 bg-[#A3FF12]/[0.03]' : 'border-white/[0.07] bg-[#111113]'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex-1 min-w-[200px]">
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : id)}
                      className="flex items-center gap-2 mb-1 text-left"
                    >
                      {isOpen ? <ChevronUp className="w-4 h-4 text-[#6B7280]" /> : <ChevronDown className="w-4 h-4 text-[#6B7280]" />}
                      <h4 className="text-[15px] font-semibold text-white">{camp.name}</h4>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                        enabled ? 'text-[#A3FF12] border-[#A3FF12]/25 bg-[#A3FF12]/[0.08]' : 'text-[#6B7280] border-white/[0.06]'
                      }`}>
                        {enabled ? 'ON' : 'OFF'}
                      </span>
                      <span className="text-[10px] text-[#4B5563]">{id}</span>
                    </button>
                    <p className="text-[12px] text-[#6B7280] mb-2 ml-6">{camp.description}</p>
                    <p className="text-[11px] text-[#4B5563] ml-6">
                      {active} in queue · {camp.steps.length} emails
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <button
                      disabled={saving === `toggle-${id}`}
                      onClick={() => toggleFunnel(id, !enabled)}
                      className="flex items-center gap-2 text-[12px] text-[#9CA3AF] hover:text-white"
                    >
                      {saving === `toggle-${id}` ? <Loader2 className="w-5 h-5 animate-spin" /> : enabled ? (
                        <ToggleRight className="w-8 h-8 text-[#A3FF12]" />
                      ) : (
                        <ToggleLeft className="w-8 h-8 text-[#4B5563]" />
                      )}
                    </button>
                    {enabled && pending > 0 && (
                      <button
                        disabled={starting === id}
                        onClick={() => postAction('start-campaign', id)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-[9px] bg-[#A3FF12] text-black text-[13px] font-semibold hover:opacity-90 disabled:opacity-40"
                      >
                        {starting === id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                        Start for {pending}
                      </button>
                    )}
                    {enabled && pending === 0 && (
                      <span className="text-[11px] text-[#4B5563]">All enrolled</span>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-4 pt-4 border-t border-white/[0.06] space-y-4">
                    {camp.steps.map((step, i) => (
                      <div key={i} className="rounded-[10px] border border-white/[0.06] bg-black/20 p-4 space-y-2">
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] text-[#A3FF12] font-medium w-20">
                            {step.delayDays === 0 ? 'Day 0' : `Day +${step.delayDays}`}
                          </span>
                          <input
                            type="number"
                            min={0}
                            value={step.delayDays}
                            onChange={(e) => updateEditStep(id, i, 'delayDays', Number(e.target.value))}
                            className="w-16 px-2 py-1 rounded bg-[#0a0a0a] border border-white/[0.08] text-[12px] text-white"
                            title="Days after enrollment"
                          />
                          <span className="text-[10px] text-[#4B5563]">days after start</span>
                        </div>
                        <input
                          value={step.subject}
                          onChange={(e) => updateEditStep(id, i, 'subject', e.target.value)}
                          className="w-full px-3 py-2 rounded bg-[#0a0a0a] border border-white/[0.08] text-[13px] text-white"
                          placeholder="Subject"
                        />
                        <textarea
                          value={step.html.trim()}
                          onChange={(e) => updateEditStep(id, i, 'html', e.target.value)}
                          rows={5}
                          className="w-full px-3 py-2 rounded bg-[#0a0a0a] border border-white/[0.08] text-[12px] text-[#9CA3AF] font-mono"
                          placeholder="HTML body (use {{firstName}})"
                        />
                      </div>
                    ))}
                    <button
                      disabled={saving === `save-${id}`}
                      onClick={() => saveCampaign(id)}
                      className="flex items-center gap-2 px-4 py-2 rounded-[8px] border border-[#A3FF12]/30 text-[#A3FF12] text-[12px] font-medium hover:bg-[#A3FF12]/10"
                    >
                      {saving === `save-${id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Save campaign
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent sends */}
      <div>
        <h3 className="text-[14px] font-semibold text-white mb-3">Recent sends & opens</h3>
        <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-white/[0.06] text-[#4B5563] text-left">
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Campaign</th>
                  <th className="px-4 py-3 font-medium">Step</th>
                  <th className="px-4 py-3 font-medium">Opened</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Subject</th>
                </tr>
              </thead>
              <tbody>
                {(data?.logs ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[#4B5563]">
                      No sends yet.
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
                        {log.openedAt ? (
                          <span className="text-[#A3FF12] flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            Yes{(log.openCount ?? 0) > 1 ? ` (${log.openCount})` : ''}
                          </span>
                        ) : (
                          <span className="text-[#4B5563]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={log.status === 'sent' ? 'text-[#A3FF12]' : 'text-red-400'}>{log.status}</span>
                      </td>
                      <td className="px-4 py-2.5 text-[#9CA3AF] max-w-[180px] truncate">{log.subject}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-[#374151] leading-relaxed">
        <Pencil className="w-3 h-3 inline mr-1" />
        Resend → Webhooks → URL <code className="text-[#6B7280]">https://prysmor.io/api/webhooks/resend</code> — events: delivered, opened, clicked.
        Set <code className="text-[#6B7280]">RESEND_WEBHOOK_SECRET</code> on Vercel.
      </p>
    </div>
  );
}
