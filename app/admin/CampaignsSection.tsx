'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Loader2, RefreshCw, Save, Rocket, ToggleLeft, ToggleRight,
  Megaphone, Zap, Clock, Mail, UserPlus, PlayCircle, Ban,
  ChevronRight, Sparkles, AlertCircle, Eye,
} from 'lucide-react';
import type { FunnelId } from '@/lib/email/constants';
import type { FunnelDefinition } from '@/lib/email/funnels';
import { useEmailAdmin } from '@/app/admin/useEmailAdmin';

const CAMPAIGN_STYLE: Record<FunnelId, { gradient: string; accent: string; badge: string }> = {
  'unpaid-starter': {
    gradient: 'from-[#A3FF12]/20 via-[#A3FF12]/5 to-transparent',
    accent:   '#A3FF12',
    badge:    'Upsell · Acquisition',
  },
  'starter-pro': {
    gradient: 'from-violet-500/20 via-violet-500/5 to-transparent',
    accent:   '#A78BFA',
    badge:    'Upsell · Expansion',
  },
};

const AUTOMATION_STEPS = [
  { icon: UserPlus, title: 'Enroll', desc: 'User enters campaign (signup, Start button, or paid → upsell).' },
  { icon: Clock, title: 'Schedule', desc: 'Each email fires on Day 0, +2d, +5d… from their personal start date.' },
  { icon: PlayCircle, title: 'Send', desc: 'Hourly cron + manual queue. Respects daily cap (e.g. 60/day).' },
  { icon: Ban, title: 'Stop', desc: 'Unsubscribe, purchase, or wrong plan → removed from sequence.' },
];

export function CampaignsSection() {
  const {
    data, loading, saving, setSaving, starting, runResult, setRunResult,
    error, setError, errorHint, load, patch, postAction,
  } = useEmailAdmin();

  const [selected, setSelected]   = useState<FunnelId>('unpaid-starter');
  const [stepIdx, setStepIdx]     = useState(0);
  const [editing, setEditing]     = useState<Record<string, FunnelDefinition>>({});

  useEffect(() => { load().then((d) => {
    if (d?.campaigns?.length) {
      const map: Record<string, FunnelDefinition> = {};
      for (const c of d.campaigns) map[c.id] = c;
      setEditing(map);
    }
  }); }, [load]);

  const campaigns = data?.campaigns ?? [];
  const camp = editing[selected] ?? campaigns.find((c) => c.id === selected);
  const style = CAMPAIGN_STYLE[selected];
  const enabled = data?.settings.funnels[selected]?.enabled ?? false;
  const inQueue = data?.enrollmentCounts[selected] ?? 0;
  const isUnpaid = selected === 'unpaid-starter';
  const pending = isUnpaid
    ? (data?.unpaidPending ?? 0)
    : Math.max(0, (data?.starterEligible ?? 0) - (data?.starterInCampaign ?? 0));
  const cap = data?.settings.dailyMarketingCap ?? 40;

  function updateCamp(field: 'name' | 'description', value: string) {
    setEditing((prev) => {
      const c = prev[selected];
      if (!c) return prev;
      return { ...prev, [selected]: { ...c, [field]: value } };
    });
  }

  function updateStep(field: 'subject' | 'html' | 'delayDays', value: string | number) {
    setEditing((prev) => {
      const c = prev[selected];
      if (!c) return prev;
      const steps = [...c.steps];
      steps[stepIdx] = { ...steps[stepIdx], [field]: value };
      return { ...prev, [selected]: { ...c, steps } };
    });
  }

  const saveCampaign = useCallback(async () => {
    const c = editing[selected];
    if (!c) return;
    setSaving(`save-${selected}`);
    setRunResult(null);
    try {
      await patch({
        campaign: {
          id: selected,
          override: {
            name:        c.name,
            description: c.description,
            steps: c.steps.map((s) => ({
              delayDays: s.delayDays,
              subject:   s.subject,
              html:      s.html,
            })),
          },
        },
      });
      setRunResult(`Campaign "${c.name}" saved.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(null);
    }
  }, [editing, selected, patch, setSaving, setRunResult, setError]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24 text-[#6B7280]">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading campaigns…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Hero + automation */}
      <div className="relative overflow-hidden rounded-[16px] border border-white/[0.08] bg-[#0d0d0f] p-6 sm:p-8">
        <div className="absolute inset-0 bg-gradient-to-br from-[#A3FF12]/[0.07] via-transparent to-violet-600/[0.05] pointer-events-none" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#A3FF12]/10 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <Megaphone className="w-5 h-5 text-[#A3FF12]" />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#A3FF12]">Email automation</span>
          </div>
          <h2 className="text-[22px] sm:text-[26px] font-bold text-white tracking-tight mb-2">
            Campaigns & upsell sequences
          </h2>
          <p className="text-[14px] text-[#9CA3AF] max-w-2xl leading-relaxed mb-8">
            Automated multi-step emails via Resend. Edit copy here, start a campaign for eligible users,
            and the system sends on schedule until they subscribe or unsubscribe.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {AUTOMATION_STEPS.map((s, i) => (
              <div key={s.title} className="relative rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-4 backdrop-blur-sm">
                {i < AUTOMATION_STEPS.length - 1 && (
                  <ChevronRight className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#374151] z-10" />
                )}
                <div className="w-9 h-9 rounded-[10px] bg-[#A3FF12]/10 border border-[#A3FF12]/20 flex items-center justify-center mb-3">
                  <s.icon className="w-4 h-4 text-[#A3FF12]" />
                </div>
                <p className="text-[13px] font-semibold text-white mb-1">{s.title}</p>
                <p className="text-[11px] text-[#6B7280] leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {(error || runResult) && (
        <div className={`px-4 py-3 rounded-[12px] border text-[13px] ${
          error
            ? 'border-red-500/20 bg-red-500/[0.06] text-red-400'
            : 'border-[#A3FF12]/20 bg-[#A3FF12]/[0.06] text-[#A3FF12]'
        }`}>
          {error && (
            <>
              <div className="flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</div>
              {errorHint && <p className="mt-1 text-[12px] text-[#9CA3AF] pl-6">{errorHint}</p>}
            </>
          )}
          {runResult && !error && runResult}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-[#6B7280]">
          Daily cap: <span className="text-white font-medium">{cap}/day</span> · configure in Email tab
        </p>
        <button
          onClick={() => load()}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-[9px] border border-white/[0.08] text-[12px] text-[#9CA3AF] hover:text-white"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Main editor layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,300px)_1fr] gap-5 min-h-[520px]">
        {/* Sidebar — all campaigns */}
        <div className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#4B5563] px-1">All campaigns</p>
          {campaigns.map((def) => {
            const id = def.id as FunnelId;
            const st = CAMPAIGN_STYLE[id];
            const isSel = selected === id;
            const on = data?.settings.funnels[id]?.enabled;
            const queue = data?.enrollmentCounts[id] ?? 0;
            return (
              <button
                key={id}
                type="button"
                onClick={() => { setSelected(id); setStepIdx(0); }}
                className={`w-full text-left rounded-[14px] border p-4 transition-all duration-200 ${
                  isSel
                    ? 'border-[#A3FF12]/40 bg-gradient-to-br shadow-[0_0_32px_-8px_rgba(163,255,18,0.35)]'
                    : 'border-white/[0.07] bg-[#111113] hover:border-white/[0.12] hover:bg-[#141416]'
                } ${isSel ? st.gradient : ''}`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <Sparkles className="w-4 h-4 flex-shrink-0" style={{ color: st.accent }} />
                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-medium ${
                    on ? 'bg-[#A3FF12]/15 text-[#A3FF12]' : 'bg-white/5 text-[#6B7280]'
                  }`}>
                    {on ? 'LIVE' : 'OFF'}
                  </span>
                </div>
                <p className="text-[14px] font-semibold text-white mb-0.5">{def.name}</p>
                <p className="text-[10px] text-[#6B7280] mb-2">{st.badge}</p>
                <p className="text-[11px] text-[#4B5563]">{queue} in queue · {def.steps.length} emails</p>
              </button>
            );
          })}
        </div>

        {/* Editor panel */}
        {camp && (
          <div className="rounded-[16px] border border-white/[0.08] bg-[#111113] overflow-hidden flex flex-col">
            <div className={`px-6 py-5 border-b border-white/[0.06] bg-gradient-to-r ${style.gradient}`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex-1 min-w-[200px] space-y-3">
                  <input
                    value={camp.name}
                    onChange={(e) => updateCamp('name', e.target.value)}
                    className="w-full text-[20px] font-bold text-white bg-transparent border-b border-transparent hover:border-white/10 focus:border-[#A3FF12]/40 focus:outline-none pb-1 transition-colors"
                  />
                  <textarea
                    value={camp.description}
                    onChange={(e) => updateCamp('description', e.target.value)}
                    rows={2}
                    className="w-full text-[13px] text-[#9CA3AF] bg-black/20 rounded-[10px] border border-white/[0.06] px-3 py-2 focus:border-[#A3FF12]/30 focus:outline-none resize-none"
                  />
                  <p className="text-[11px] text-[#4B5563] font-mono">{selected}</p>
                </div>
                <div className="flex flex-col items-end gap-3">
                  <button
                    type="button"
                    disabled={saving === `toggle-${selected}`}
                    onClick={async () => {
                      setSaving(`toggle-${selected}`);
                      try {
                        await patch({ funnels: { [selected]: { enabled: !enabled } } });
                      } finally { setSaving(null); }
                    }}
                    className="flex items-center gap-2"
                  >
                    {enabled ? (
                      <ToggleRight className="w-10 h-10" style={{ color: style.accent }} />
                    ) : (
                      <ToggleLeft className="w-10 h-10 text-[#4B5563]" />
                    )}
                  </button>
                  {enabled && pending > 0 ? (
                    <button
                      disabled={!!starting}
                      onClick={() => postAction('start-campaign', selected)}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-[#A3FF12] text-black text-[13px] font-bold hover:opacity-90 shadow-[0_0_24px_-4px_rgba(163,255,18,0.5)]"
                    >
                      {starting === selected ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                      Start {pending} users
                    </button>
                  ) : (
                    <span className="text-[11px] text-[#4B5563]">{inQueue} enrolled</span>
                  )}
                </div>
              </div>
            </div>

            {/* Step tabs */}
            <div className="flex gap-1 px-4 pt-4 overflow-x-auto">
              {camp.steps.map((step, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setStepIdx(i)}
                  className={`flex-shrink-0 px-4 py-2 rounded-[10px] text-[12px] font-medium transition-all ${
                    stepIdx === i
                      ? 'bg-white/[0.1] text-white border border-white/[0.1]'
                      : 'text-[#6B7280] hover:text-[#9CA3AF] border border-transparent'
                  }`}
                >
                  <Mail className="w-3 h-3 inline mr-1.5 opacity-60" />
                  {step.delayDays === 0 ? 'Day 0' : `+${step.delayDays}d`}
                </button>
              ))}
            </div>

            {/* Step editor */}
            <div className="flex-1 p-6 space-y-4">
              {camp.steps[stepIdx] && (
                <>
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="text-[11px] text-[#6B7280] uppercase tracking-wider">Send after</label>
                    <input
                      type="number"
                      min={0}
                      value={camp.steps[stepIdx].delayDays}
                      onChange={(e) => updateStep('delayDays', Number(e.target.value))}
                      className="w-20 px-3 py-2 rounded-[10px] bg-[#0a0a0a] border border-white/[0.1] text-white text-[14px] font-semibold focus:border-[#A3FF12]/40 focus:outline-none"
                    />
                    <span className="text-[12px] text-[#4B5563]">days from user&apos;s campaign start</span>
                  </div>

                  <div>
                    <label className="block text-[11px] text-[#6B7280] uppercase tracking-wider mb-2">Subject line</label>
                    <input
                      value={camp.steps[stepIdx].subject}
                      onChange={(e) => updateStep('subject', e.target.value)}
                      className="w-full px-4 py-3 rounded-[12px] bg-[#0a0a0a] border border-white/[0.08] text-[15px] text-white focus:border-[#A3FF12]/35 focus:outline-none focus:ring-1 focus:ring-[#A3FF12]/20"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-[#6B7280] uppercase tracking-wider mb-2">
                      Email body (HTML) — use <code className="text-[#A3FF12]">{'{{firstName}}'}</code>
                    </label>
                    <textarea
                      value={camp.steps[stepIdx].html.trim()}
                      onChange={(e) => updateStep('html', e.target.value)}
                      rows={12}
                      className="w-full px-4 py-3 rounded-[12px] bg-[#0a0a0a] border border-white/[0.08] text-[13px] text-[#C4C9D4] font-mono leading-relaxed focus:border-[#A3FF12]/35 focus:outline-none focus:ring-1 focus:ring-[#A3FF12]/20"
                    />
                  </div>

                  <div className="rounded-[12px] border border-dashed border-white/[0.08] bg-black/30 p-4">
                    <p className="text-[10px] uppercase tracking-wider text-[#4B5563] mb-2 flex items-center gap-1">
                      <Eye className="w-3 h-3" /> Preview snippet
                    </p>
                    <p className="text-[14px] text-white font-medium mb-1">{camp.steps[stepIdx].subject}</p>
                    <p className="text-[12px] text-[#6B7280] line-clamp-2">
                      Hi {'{{firstName}}'}, … (full HTML sent with Prysmor wrapper + unsubscribe link)
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="sticky bottom-0 px-6 py-4 border-t border-white/[0.06] bg-[#0d0d0f]/95 backdrop-blur-md flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11px] text-[#4B5563]">
                <Zap className="w-3 h-3 inline text-[#A3FF12] mr-1" />
                Saves to Firestore · new enrollments use updated copy
              </p>
              <button
                disabled={saving === `save-${selected}`}
                onClick={saveCampaign}
                className="flex items-center gap-2 px-6 py-2.5 rounded-[10px] bg-white text-black text-[13px] font-bold hover:bg-[#f0f0f0] disabled:opacity-50"
              >
                {saving === `save-${selected}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save campaign
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
