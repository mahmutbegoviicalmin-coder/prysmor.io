'use client';

import { useEffect } from 'react';
import {
  Loader2, RefreshCw, Play, Users, Send, AlertCircle,
  BarChart3, Eye, MousePointerClick, Megaphone,
} from 'lucide-react';
import { useEmailAdmin } from '@/app/admin/useEmailAdmin';

interface EmailSectionProps {
  onOpenCampaigns?: () => void;
}

export function EmailSection({ onOpenCampaigns }: EmailSectionProps) {
  const {
    data, loading, running, runResult,     error, setError, errorHint,
    load, patch, postAction, saving, setSaving, setRunResult,
  } = useEmailAdmin();

  useEffect(() => { load(); }, [load]);

  async function updateDailyCap(cap: number) {
    setSaving('cap');
    try {
      await patch({ dailyMarketingCap: cap });
      setRunResult(`Daily cap set to ${cap}/day.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(null);
    }
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20 text-[#6B7280]">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading…
      </div>
    );
  }

  const cap = data?.settings.dailyMarketingCap ?? 40;
  const sent = data?.dailySent ?? 0;
  const capPct = cap > 0 ? Math.min((sent / cap) * 100, 100) : 0;
  const analytics = data?.analytics ?? { sent: 0, opened: 0, clicked: 0, openRate: 0 };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[#A3FF12]/15 bg-[#A3FF12]/[0.04] px-4 py-3">
        <p className="text-[13px] text-[#9CA3AF]">
          Edit sequences, upsell copy & start campaigns in the <strong className="text-white">Campaigns</strong> tab.
        </p>
        {onOpenCampaigns && (
          <button
            type="button"
            onClick={onOpenCampaigns}
            className="flex items-center gap-2 px-4 py-2 rounded-[9px] bg-[#A3FF12] text-black text-[12px] font-semibold hover:opacity-90"
          >
            <Megaphone className="w-4 h-4" />
            Open Campaigns
          </button>
        )}
      </div>

      {(error || runResult) && (
        <div className={`px-4 py-3 rounded-[10px] border text-[13px] ${
          error ? 'border-red-500/20 bg-red-500/[0.06] text-red-400' : 'border-[#A3FF12]/20 bg-[#A3FF12]/[0.06] text-[#A3FF12]'
        }`}>
          {error ? (
            <>
              <div className="flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</div>
              {errorHint && <p className="mt-1 text-[12px] pl-6 text-[#9CA3AF]">{errorHint}</p>}
            </>
          ) : runResult}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { icon: Users, label: 'Unpaid', value: data?.unpaidUsers ?? 0, sub: `${data?.unpaidInCampaign ?? 0} in campaign` },
          { icon: Send, label: 'Sent today', value: `${sent}/${cap}`, sub: 'Marketing cap' },
          { icon: BarChart3, label: 'Total sent', value: analytics.sent, sub: 'Logged' },
          { icon: Eye, label: 'Opened', value: analytics.opened, sub: `${analytics.openRate}% rate` },
          { icon: MousePointerClick, label: 'Clicked', value: analytics.clicked, sub: 'Webhook' },
        ].map((c) => (
          <div key={c.label} className="rounded-[12px] border border-white/[0.07] bg-[#111113] p-4">
            <c.icon className="w-3.5 h-3.5 text-[#A3FF12] mb-2" />
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4B5563]">{c.label}</p>
            <p className="text-[22px] font-bold text-white mt-1">{c.value}</p>
            <p className="text-[10px] text-[#374151] mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] p-5">
        <h3 className="text-[14px] font-semibold text-white mb-2">Daily send limit</h3>
        <p className="text-[12px] text-[#6B7280] mb-4">Max marketing emails per calendar day (UTC).</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {[30, 40, 60, 80].map((n) => (
            <button
              key={n}
              disabled={saving === 'cap'}
              onClick={() => updateDailyCap(n)}
              className={`px-4 py-2 rounded-[9px] text-[13px] font-medium border transition-all ${
                cap === n ? 'bg-[#A3FF12]/10 border-[#A3FF12]/30 text-[#A3FF12]' : 'border-white/[0.08] text-[#6B7280] hover:text-white'
              }`}
            >
              {n}/day
            </button>
          ))}
        </div>
        <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
          <div className={`h-full rounded-full ${capPct >= 100 ? 'bg-orange-400' : 'bg-[#A3FF12]'}`} style={{ width: `${capPct}%` }} />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => postAction('process-queue', 'unpaid-starter')}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2.5 rounded-[9px] bg-[#A3FF12] text-black text-[13px] font-semibold disabled:opacity-50"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Run queue ({Math.max(0, cap - sent)} left today)
        </button>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2.5 rounded-[9px] border border-white/[0.08] text-[13px] text-[#9CA3AF]">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div>
        <h3 className="text-[14px] font-semibold text-white mb-3">Recent sends</h3>
        <div className="rounded-[12px] border border-white/[0.07] overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-[#0d0d0f] text-[#4B5563] text-left">
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Campaign</th>
                <th className="px-4 py-3">Opened</th>
                <th className="px-4 py-3">Subject</th>
              </tr>
            </thead>
            <tbody>
              {(data?.logs ?? []).length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-[#4B5563]">No sends yet.</td></tr>
              ) : (
                data!.logs.map((log) => (
                  <tr key={log.id} className="border-t border-white/[0.04]">
                    <td className="px-4 py-2.5 text-[#6B7280]">
                      {log.createdAt ? new Date(log.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-[#D1D5DB]">{log.email}</td>
                    <td className="px-4 py-2.5 text-[#9CA3AF]">{log.funnelId}</td>
                    <td className="px-4 py-2.5">{log.openedAt ? <span className="text-[#A3FF12]">Yes</span> : '-'}</td>
                    <td className="px-4 py-2.5 text-[#9CA3AF] truncate max-w-[200px]">{log.subject}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
