'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useUser } from '@clerk/nextjs';
import {
  Users, Zap, AlertCircle, Search, ChevronDown,
  RefreshCw, X, Check, Loader2, Edit2, CreditCard, ShieldOff,
  ShieldCheck, MoreHorizontal, ArrowUpDown,
  Eye, Plus, Minus, TrendingUp, DollarSign, Activity,
  UserPlus, UserMinus, BarChart2, Package,
  Trash2, MapPin, Download, Copy, Globe,
} from 'lucide-react';

import type { RevenueData, LsSub } from '@/app/api/admin/revenue/route';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminUser {
  id:               string;
  email:            string;
  displayName:      string;
  firstName:        string;
  lastName:         string;
  plan:             string;
  planLabel:        string;
  licenseStatus:    string;
  credits:          number;
  creditsTotal:     number;
  renewalDate:      string | null;
  deviceLimit:      number;
  createdAt:        string | null;
  lastSignInAt:     string | null;
  country:          string | null;
  countryCode:      string | null;
  lsSubscriptionId?: string;
}

type SortKey = 'createdAt' | 'lastSignInAt' | 'email' | 'plan' | 'credits' | 'licenseStatus';
type Modal = { type: 'plan';    user: AdminUser }
           | { type: 'credits'; user: AdminUser }
           | { type: 'detail';  user: AdminUser }
           | { type: 'delete';  user: AdminUser }
           | null;

// ─── Constants ────────────────────────────────────────────────────────────────

const PLAN_COLORS: Record<string, string> = {
  unpaid:    'text-[#6B7280] bg-white/[0.03] border-white/[0.05]',
  starter:   'text-[#9CA3AF] bg-white/[0.06] border-white/[0.08]',
  pro:       'text-[#60A5FA] bg-blue-500/[0.08] border-blue-500/20',
  exclusive: 'text-[#F59E0B] bg-amber-500/[0.08] border-amber-500/20',
};

const PLAN_DOT: Record<string, string> = {
  unpaid:    'bg-[#374151]',
  starter:   'bg-[#6B7280]',
  pro:       'bg-[#60A5FA]',
  exclusive: 'bg-[#F59E0B]',
};

const PLANS = [
  { id: 'starter',   label: 'Starter',   credits: 360  },
  { id: 'pro',       label: 'Pro',        credits: 800  },
  { id: 'exclusive', label: 'Exclusive',  credits: 2000 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtRelative(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** Returns display label + Tailwind color class for a plan's renewal date. */
function expiryInfo(dateStr: string | null): { label: string; color: string } {
  if (!dateStr) return { label: '—', color: 'text-[#374151]' };
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { label: dateStr, color: 'text-[#9CA3AF]' };
  const daysLeft = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  if (daysLeft < 0)  return { label: `Expired`,                      color: 'text-red-400' };
  if (daysLeft === 0) return { label: `Today`,                       color: 'text-red-400' };
  if (daysLeft <= 7)  return { label: `${dateStr} (${daysLeft}d)`,   color: 'text-orange-400' };
  if (daysLeft <= 30) return { label: dateStr,                       color: 'text-amber-400' };
  return                      { label: dateStr,                       color: 'text-[#9CA3AF]' };
}

/** Renders a country code as a styled badge (avoids Windows emoji rendering issues) */
function CountryBadge({ code, name }: { code: string | null; name: string | null }) {
  if (!name) return <span className="text-[11px] text-[#2D2D35] italic">—</span>;
  // If code missing, derive 2-letter abbreviation from name
  const upper = (code ?? name.slice(0, 2)).toUpperCase().slice(0, 2);
  // Simple deterministic color from code letters
  const colors = [
    'bg-blue-500/20 text-blue-300',
    'bg-emerald-500/20 text-emerald-300',
    'bg-amber-500/20 text-amber-300',
    'bg-purple-500/20 text-purple-300',
    'bg-rose-500/20 text-rose-300',
    'bg-cyan-500/20 text-cyan-300',
    'bg-orange-500/20 text-orange-300',
  ];
  const color = colors[(upper.charCodeAt(0) + upper.charCodeAt(1)) % colors.length];
  return (
    <span className="flex items-center gap-2">
      <span className={`inline-flex items-center justify-center w-[26px] h-[18px] rounded-[4px] text-[10px] font-bold tracking-wide flex-shrink-0 ${color}`}>
        {upper}
      </span>
      <span className="text-[12px] text-[#9CA3AF] truncate max-w-[110px]">{name}</span>
    </span>
  );
}

function initials(name: string, email: string): string {
  if (name) {
    const parts = name.trim().split(' ');
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  return email[0]?.toUpperCase() ?? '?';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const active = status === 'active';
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border ${
      active
        ? 'text-[#A3FF12] bg-[#A3FF12]/[0.07] border-[#A3FF12]/20'
        : 'text-[#6B7280] bg-white/[0.03] border-white/[0.06]'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-[#A3FF12]' : 'bg-[#4B5563]'}`} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function PlanBadge({ plan, label }: { plan: string; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border ${PLAN_COLORS[plan] ?? PLAN_COLORS.starter}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${PLAN_DOT[plan] ?? 'bg-[#6B7280]'}`} />
      {label}
    </span>
  );
}

function CreditsMini({ credits, total }: { credits: number; total: number }) {
  const pct = total > 0 ? Math.min((credits / total) * 100, 100) : 0;
  const low = pct < 20;
  return (
    <div className="min-w-[80px]">
      <div className="flex items-center justify-between mb-1">
        <span className={`text-[11px] font-medium ${low ? 'text-orange-400' : 'text-[#D1D5DB]'}`}>
          {credits.toLocaleString()}
        </span>
        <span className="text-[10px] text-[#4B5563]">/{total.toLocaleString()}</span>
      </div>
      <div className="h-[3px] w-full rounded-full bg-white/[0.06]">
        <div
          className={`h-full rounded-full ${low ? 'bg-orange-400' : 'bg-[#A3FF12]'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Avatar({ user }: { user: AdminUser }) {
  const bg = user.licenseStatus === 'active' ? '#1a2e12' : '#1a1a2e';
  const fg = user.licenseStatus === 'active' ? '#A3FF12' : '#6B7280';
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
      style={{ background: bg, color: fg }}
    >
      {initials(user.displayName, user.email)}
    </div>
  );
}

// ─── Stats Card ───────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon, label, value, sub, color,
}: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-7 h-7 rounded-[7px] flex items-center justify-center ${color}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <span className="text-[11px] font-medium text-[#6B7280] uppercase tracking-[0.08em]">{label}</span>
      </div>
      <p className="text-[26px] font-semibold text-white leading-none">{value}</p>
      {sub && <p className="text-[11px] text-[#4B5563] mt-1.5">{sub}</p>}
    </div>
  );
}

// ─── Plan Modal ───────────────────────────────────────────────────────────────

function PlanModal({ user, onClose, onSave, isSelf }: {
  user: AdminUser;
  onClose: () => void;
  onSave: (u: AdminUser) => void;
  isSelf?: boolean;
}) {
  const [plan,         setPlan]         = useState(user.plan);
  const [status,       setStatus]       = useState(user.licenseStatus);
  const [resetCredits, setResetCredits] = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');

  async function save() {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_plan', plan, status, resetCredits }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const { data } = await res.json();
      onSave({ ...user, plan, planLabel: PLANS.find(p => p.id === plan)?.label ?? plan, licenseStatus: status,
        ...(resetCredits ? { credits: PLANS.find(p => p.id === plan)?.credits ?? user.credits, creditsTotal: PLANS.find(p => p.id === plan)?.credits ?? user.creditsTotal } : {}),
        ...data,
      });
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setLoading(false); }
  }

  return (
    <ModalShell title="Set Plan" onClose={onClose}>
      <div className="flex items-center gap-3 mb-5 p-3 rounded-[8px] bg-white/[0.03] border border-white/[0.06]">
        <Avatar user={user} />
        <div>
          <p className="text-[13px] font-medium text-white">{user.displayName || user.email}</p>
          <p className="text-[11px] text-[#6B7280]">{user.email}</p>
        </div>
      </div>

      <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6B7280] mb-2">Plan</label>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {PLANS.map(p => (
          <button
            key={p.id}
            onClick={() => setPlan(p.id)}
            className={`py-2.5 px-3 rounded-[8px] text-[12px] font-medium border transition-all ${
              plan === p.id
                ? 'border-[#A3FF12]/40 bg-[#A3FF12]/[0.08] text-[#A3FF12]'
                : 'border-white/[0.07] text-[#9CA3AF] hover:border-white/[0.14]'
            }`}
          >
            {p.label}
            <span className="block text-[10px] opacity-60 mt-0.5">{p.credits.toLocaleString()} cr</span>
          </button>
        ))}
      </div>

      <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6B7280] mb-2">Status</label>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {(['active', 'inactive'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`py-2.5 rounded-[8px] text-[12px] font-medium border transition-all ${
              status === s
                ? s === 'active'
                  ? 'border-[#A3FF12]/40 bg-[#A3FF12]/[0.08] text-[#A3FF12]'
                  : 'border-red-500/30 bg-red-500/[0.07] text-red-400'
                : 'border-white/[0.07] text-[#9CA3AF] hover:border-white/[0.14]'
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-2.5 cursor-pointer mb-5 p-3 rounded-[8px] border border-white/[0.06] hover:border-white/[0.10] transition-colors">
        <div
          onClick={() => setResetCredits(!resetCredits)}
          className={`w-4 h-4 rounded-[4px] border flex items-center justify-center transition-all ${
            resetCredits ? 'bg-[#A3FF12] border-[#A3FF12]' : 'border-white/[0.20] bg-white/[0.03]'
          }`}
        >
          {resetCredits && <Check className="w-2.5 h-2.5 text-black" strokeWidth={3} />}
        </div>
        <div>
          <p className="text-[12px] text-white">Reset credits to plan cap</p>
          <p className="text-[11px] text-[#4B5563]">Sets credits to {PLANS.find(p => p.id === plan)?.credits.toLocaleString()} ({plan})</p>
        </div>
      </label>

      {error && <p className="text-[12px] text-red-400 mb-3">{error}</p>}

      {isSelf && (
        <div className="mb-3 flex items-center gap-2 rounded-[8px] border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2.5">
          <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
          <p className="text-[11px] text-amber-400">You cannot change your own plan from the admin panel.</p>
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 rounded-[8px] border border-white/[0.08] text-[12px] text-[#6B7280] hover:text-white transition-colors">Cancel</button>
        <button
          onClick={save}
          disabled={loading || isSelf}
          className="flex-1 py-2 rounded-[8px] bg-[#A3FF12] text-[#050505] text-[12px] font-semibold hover:bg-[#B6FF3C] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {loading ? 'Saving…' : 'Save'}
        </button>
      </div>
    </ModalShell>
  );
}

// ─── Credits Modal ────────────────────────────────────────────────────────────

function CreditsModal({ user, onClose, onSave }: {
  user: AdminUser;
  onClose: () => void;
  onSave: (u: AdminUser) => void;
}) {
  const [mode,    setMode]    = useState<'set' | 'add' | 'sub'>('set');
  const [amount,  setAmount]  = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const numAmount = parseInt(amount) || 0;
  const preview = mode === 'set'
    ? numAmount
    : mode === 'add'
    ? user.credits + numAmount
    : Math.max(0, user.credits - numAmount);

  async function save() {
    if (!numAmount && mode !== 'set') return;
    setLoading(true); setError('');
    try {
      const body = mode === 'set'
        ? { action: 'set_credits', credits: numAmount }
        : { action: 'adjust_credits', delta: mode === 'add' ? numAmount : -numAmount };
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      onSave({ ...user, credits: preview });
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setLoading(false); }
  }

  return (
    <ModalShell title="Adjust Credits" onClose={onClose}>
      <div className="flex items-center gap-3 mb-5 p-3 rounded-[8px] bg-white/[0.03] border border-white/[0.06]">
        <Avatar user={user} />
        <div className="flex-1">
          <p className="text-[13px] font-medium text-white">{user.displayName || user.email}</p>
          <p className="text-[11px] text-[#6B7280]">Current: {user.credits.toLocaleString()} / {user.creditsTotal.toLocaleString()} credits</p>
        </div>
      </div>

      {/* Mode selector */}
      <div className="flex gap-1.5 mb-4 p-1 rounded-[9px] bg-white/[0.04] border border-white/[0.05]">
        {([['set', 'Set to'], ['add', 'Add'], ['sub', 'Subtract']] as const).map(([m, lbl]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-1.5 rounded-[7px] text-[11px] font-medium transition-all ${
              mode === m ? 'bg-white/[0.08] text-white' : 'text-[#6B7280] hover:text-white'
            }`}
          >
            {lbl}
          </button>
        ))}
      </div>

      <div className="relative mb-4">
        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
          {mode === 'add' ? <Plus className="w-3.5 h-3.5 text-[#A3FF12]" /> :
           mode === 'sub' ? <Minus className="w-3.5 h-3.5 text-red-400" /> :
           <Edit2 className="w-3.5 h-3.5 text-[#6B7280]" />}
        </div>
        <input
          ref={inputRef}
          type="number"
          min={0}
          value={amount}
          onChange={e => setAmount(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); }}
          placeholder="Enter amount…"
          className="w-full pl-9 pr-4 py-2.5 rounded-[8px] bg-[#0C0C14] border border-white/[0.10] text-[13px] text-white placeholder:text-[#374151] focus:outline-none focus:border-[#A3FF12]/40 transition-colors"
        />
      </div>

      {/* Preview */}
      <div className="mb-5 p-3 rounded-[8px] bg-[#0C0C14] border border-white/[0.06]">
        <p className="text-[11px] text-[#6B7280] mb-1">Preview</p>
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-[#9CA3AF]">{user.credits.toLocaleString()}</span>
          <span className="text-[10px] text-[#4B5563]">→</span>
          <span className={`text-[15px] font-semibold ${preview > user.credits ? 'text-[#A3FF12]' : preview < user.credits ? 'text-red-400' : 'text-white'}`}>
            {preview.toLocaleString()}
          </span>
          <span className="text-[10px] text-[#4B5563]">credits</span>
        </div>
      </div>

      {error && <p className="text-[12px] text-red-400 mb-3">{error}</p>}

      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 rounded-[8px] border border-white/[0.08] text-[12px] text-[#6B7280] hover:text-white transition-colors">Cancel</button>
        <button
          onClick={save}
          disabled={loading || !numAmount}
          className="flex-1 py-2 rounded-[8px] bg-[#A3FF12] text-[#050505] text-[12px] font-semibold hover:bg-[#B6FF3C] transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {loading ? 'Saving…' : 'Apply'}
        </button>
      </div>
    </ModalShell>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function DetailModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const rows = [
    ['User ID',       user.id],
    ['Email',         user.email || '—'],
    ['First name',    user.firstName || '—'],
    ['Last name',     user.lastName  || '—'],
    ['Country',       user.country ? `${user.countryCode ? `[${user.countryCode}] ` : ''}${user.country}` : '—'],
    ['Plan',          user.planLabel],
    ['Status',        user.licenseStatus],
    ['Credits',       `${user.credits.toLocaleString()} / ${user.creditsTotal.toLocaleString()}`],
    ['Renewal date',  user.renewalDate || '—'],
    ['Device limit',  String(user.deviceLimit)],
    ['LS Sub ID',     user.lsSubscriptionId || '—'],
    ['Joined',        fmtDate(user.createdAt)],
    ['Last sign-in',  fmtDate(user.lastSignInAt)],
  ];
  return (
    <ModalShell title="User Details" onClose={onClose}>
      <div className="flex items-center gap-3 mb-5">
        <Avatar user={user} />
        <div>
          <p className="text-[14px] font-semibold text-white">{user.displayName || user.email}</p>
          <p className="text-[12px] text-[#6B7280]">{user.email}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <PlanBadge plan={user.plan} label={user.planLabel} />
          <StatusBadge status={user.licenseStatus} />
        </div>
      </div>
      <div className="divide-y divide-white/[0.04]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between py-2.5">
            <span className="text-[11px] text-[#6B7280]">{label}</span>
            <span className="text-[12px] text-[#D1D5DB] font-mono max-w-[220px] truncate text-right">{value}</span>
          </div>
        ))}
      </div>
    </ModalShell>
  );
}

// ─── Delete Modal ─────────────────────────────────────────────────────────────

function DeleteModal({ user, onClose, onConfirm }: {
  user:      AdminUser;
  onClose:   () => void;
  onConfirm: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function confirm() {
    setLoading(true); setError('');
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete user');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell title="Delete User" onClose={onClose}>
      <div className="flex items-center gap-3 mb-4 p-3 rounded-[8px] bg-red-500/[0.06] border border-red-500/20">
        <Avatar user={user} />
        <div>
          <p className="text-[13px] font-medium text-white">{user.displayName || user.email}</p>
          <p className="text-[11px] text-[#6B7280]">{user.email}</p>
        </div>
      </div>

      <p className="text-[13px] text-[#9CA3AF] leading-relaxed mb-1">
        Ovo će trajno obrisati korisnika iz{' '}
        <span className="text-white font-medium">Clerk-a</span> i{' '}
        <span className="text-white font-medium">Firestore-a</span>, uključujući sve njihove jobove.
      </p>
      <p className="text-[12px] text-red-400 font-medium mb-5">Ova akcija se ne može poništiti.</p>

      {error && <p className="text-[12px] text-red-400 mb-3">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 py-2 rounded-[8px] border border-white/[0.08] text-[12px] text-[#6B7280] hover:text-white transition-colors"
        >
          Odustani
        </button>
        <button
          onClick={confirm}
          disabled={loading}
          className="flex-1 py-2 rounded-[8px] bg-red-600 text-white text-[12px] font-semibold hover:bg-red-500 transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          {loading ? 'Brišem…' : 'Obriši zauvijek'}
        </button>
      </div>
    </ModalShell>
  );
}

// ─── Modal Shell ──────────────────────────────────────────────────────────────

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', fn);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', fn); document.body.style.overflow = ''; };
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="relative w-full max-w-[440px] rounded-[16px] border border-white/[0.09] bg-[#0C0C14] shadow-[0_40px_100px_rgba(0,0,0,0.9)] pointer-events-auto"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
            <h3 className="text-[14px] font-semibold text-white">{title}</h3>
            <button onClick={onClose} className="w-6 h-6 rounded-full flex items-center justify-center text-[#6B7280] hover:text-white hover:bg-white/[0.07] transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="p-6">{children}</div>
        </div>
      </div>
    </>
  );
}

// ─── Action Menu ──────────────────────────────────────────────────────────────

function ActionMenu({ user, onPlan, onCredits, onDetail, onToggleStatus, onDelete, onRefreshLocation, onRevokeDevices, loading }: {
  user: AdminUser;
  onPlan:              () => void;
  onCredits:           () => void;
  onDetail:            () => void;
  onToggleStatus:      () => void;
  onDelete:            () => void;
  onRefreshLocation:   () => void;
  onRevokeDevices:     () => void;
  loading:             boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const fn = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [open]);

  const items: { icon: React.ElementType; label: string; action: () => void; danger?: boolean; divider?: boolean }[] = [
    { icon: Eye,         label: 'View details',       action: () => { onDetail();            setOpen(false); } },
    { icon: Edit2,       label: 'Set plan',            action: () => { onPlan();              setOpen(false); } },
    { icon: CreditCard,  label: 'Adjust credits',      action: () => { onCredits();           setOpen(false); } },
    { icon: MapPin,      label: 'Refresh location',    action: () => { onRefreshLocation();   setOpen(false); } },
    {
      icon:    Activity,
      label:   'Revoke devices (0/1)',
      action:  () => { onRevokeDevices(); setOpen(false); },
      divider: true,
    },
    {
      icon: user.licenseStatus === 'active' ? ShieldOff : ShieldCheck,
      label: user.licenseStatus === 'active' ? 'Suspend user' : 'Activate user',
      action: () => { onToggleStatus(); setOpen(false); },
      danger: user.licenseStatus === 'active',
    },
    {
      icon:   Trash2,
      label:  'Delete user',
      action: () => { onDelete(); setOpen(false); },
      danger:  true,
      divider: true,
    },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="w-7 h-7 rounded-[6px] border border-white/[0.07] flex items-center justify-center text-[#6B7280] hover:text-white hover:border-white/[0.14] hover:bg-white/[0.04] transition-all disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MoreHorizontal className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-20 w-48 rounded-[10px] border border-white/[0.09] bg-[#111117] shadow-[0_12px_40px_rgba(0,0,0,0.8)] overflow-hidden">
          {items.map((item, i) => (
            <div key={item.label}>
              {item.divider && <div className="my-1 border-t border-white/[0.05]" />}
              <button
                onClick={item.action}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-[12px] hover:bg-white/[0.04] transition-colors text-left ${
                  item.danger ? 'text-red-400 hover:text-red-300' : 'text-[#D1D5DB]'
                }`}
              >
                <item.icon className="w-3.5 h-3.5 flex-shrink-0" />
                {item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── User Card (mobile) ───────────────────────────────────────────────────────

function UserCard({
  user, onPlan, onCredits, onDetail, onToggleStatus,
  onDelete, onRefreshLocation, onRevokeDevices, loading,
}: {
  user: AdminUser;
  onPlan: () => void; onCredits: () => void; onDetail: () => void;
  onToggleStatus: () => void; onDelete: () => void;
  onRefreshLocation: () => void; onRevokeDevices: () => void;
  loading: boolean;
}) {
  const expiry = expiryInfo(user.renewalDate);
  return (
    <div className="bg-[#111113] border border-white/[0.07] rounded-[14px] p-4 space-y-3">
      {/* Header: Avatar + Name/Email + overflow menu */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar user={user} />
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-white truncate leading-tight">
              {user.displayName || <span className="text-[#6B7280] italic">No name</span>}
            </p>
            <p className="text-[11px] text-[#4B5563] truncate">{user.email}</p>
          </div>
        </div>
        <ActionMenu
          user={user} loading={loading}
          onPlan={onPlan} onCredits={onCredits} onDetail={onDetail}
          onToggleStatus={onToggleStatus} onDelete={onDelete}
          onRefreshLocation={onRefreshLocation} onRevokeDevices={onRevokeDevices}
        />
      </div>

      {/* Badges */}
      <div className="flex flex-wrap items-center gap-1.5">
        <PlanBadge plan={user.plan} label={user.planLabel} />
        <StatusBadge status={user.licenseStatus} />
        {user.country && <CountryBadge code={user.countryCode} name={user.country} />}
      </div>

      {/* Credits bar */}
      <CreditsMini credits={user.credits} total={user.creditsTotal} />

      {/* Info grid: renewal + last sign-in */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-[8px] bg-white/[0.03] border border-white/[0.05] px-2.5 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-[#374151] mb-0.5">Plan expires</p>
          <p className={`text-[11px] font-medium leading-snug ${expiry.color}`}>{expiry.label}</p>
        </div>
        <div className="rounded-[8px] bg-white/[0.03] border border-white/[0.05] px-2.5 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-[#374151] mb-0.5">Last sign-in</p>
          <p className="text-[11px] text-[#9CA3AF] leading-snug">{fmtRelative(user.lastSignInAt)}</p>
          {user.lastSignInAt && (
            <p className="text-[10px] text-[#374151]">{fmtDate(user.lastSignInAt)}</p>
          )}
        </div>
      </div>

      {/* Quick action buttons */}
      <div className="flex gap-2 pt-0.5">
        <button
          onClick={onPlan}
          className="flex-1 py-1.5 rounded-[7px] text-[11px] font-medium bg-white/[0.04] border border-white/[0.07] text-[#9CA3AF] hover:text-white hover:border-white/[0.14] transition-colors"
        >
          Set Plan
        </button>
        <button
          onClick={onCredits}
          className="flex-1 py-1.5 rounded-[7px] text-[11px] font-medium bg-white/[0.04] border border-white/[0.07] text-[#9CA3AF] hover:text-white hover:border-white/[0.14] transition-colors"
        >
          Credits
        </button>
        <button
          onClick={onDetail}
          className="px-3 py-1.5 rounded-[7px] text-[11px] font-medium bg-white/[0.04] border border-white/[0.07] text-[#9CA3AF] hover:text-white hover:border-white/[0.14] transition-colors"
          title="View details"
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Revenue Section ─────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active:    'text-[#A3FF12] bg-[#A3FF12]/[0.07] border-[#A3FF12]/20',
  trialing:  'text-[#60A5FA] bg-blue-500/[0.07] border-blue-500/20',
  cancelled: 'text-red-400 bg-red-500/[0.07] border-red-500/20',
  expired:   'text-[#4B5563] bg-white/[0.03] border-white/[0.06]',
  paused:    'text-[#F59E0B] bg-amber-500/[0.07] border-amber-500/20',
  past_due:  'text-orange-400 bg-orange-500/[0.07] border-orange-500/20',
};

function SubStatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? STATUS_COLORS.expired;
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

// ─── Analytics Section ────────────────────────────────────────────────────────

interface AnalyticsEvent {
  id:         string;
  sessionId:  string | null;
  userId:     string | null;
  event:      string;
  properties: Record<string, unknown>;
  page:       string;
  referrer:   string;
  userAgent:  string;
  timestamp:  string | null;
}

interface AnalyticsSummary {
  totalToday:     number;
  pageViewsToday: number;
  uniqueSessions: number;
  newSignupsToday: number;
}

type AnalyticsFilter = 'all' | 'page_view' | 'cta_click' | 'pricing_click' | 'pricing_toggle';

function fmtEventDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function fmtProps(properties: Record<string, unknown>): string {
  if (!properties || Object.keys(properties).length === 0) return '—';
  return Object.entries(properties)
    .map(([k, v]) => {
      if (k === 'price') return `$${v}`;
      return `${k}: ${v}`;
    })
    .join(' · ');
}

function parseDevice(ua: string): string {
  if (!ua) return '—';
  const mobile = /mobile|android|iphone|ipad|ipod/i.test(ua);
  const prefix = mobile ? 'Mobile' : 'Desktop';
  if (/edg\//i.test(ua))    return `${prefix} Edge`;
  if (/opr\//i.test(ua))    return `${prefix} Opera`;
  if (/chrome/i.test(ua))   return `${prefix} Chrome`;
  if (/firefox/i.test(ua))  return `${prefix} Firefox`;
  if (/safari/i.test(ua))   return `${prefix} Safari`;
  return prefix;
}

function shortenReferrer(ref: string): string {
  if (!ref || ref === 'direct') return 'direct';
  try {
    const url = new URL(ref.startsWith('http') ? ref : `https://${ref}`);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return ref.slice(0, 30);
  }
}

function ReferrerBadge({ referrer }: { referrer: string }) {
  const short = shortenReferrer(referrer);
  let cls = 'text-[#4B5563]';
  if (short === 'direct') cls = 'text-[#374151]';
  else if (/instagram/i.test(short)) cls = 'text-purple-400';
  else if (/google/i.test(short))    cls = 'text-blue-400';
  return <span className={cls}>{short}</span>;
}

function AnalyticsSection() {
  const [events,  setEvents]  = useState<AnalyticsEvent[]>([]);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [filter,  setFilter]  = useState<AnalyticsFilter>('all');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/analytics');
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setEvents(json.events ?? []);
      setSummary(json.summary ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, []);

  const filtered = filter === 'all' ? events : events.filter(e => e.event === filter);

  // Funnel — from already-filtered events (no dashboard, no admin)
  const pageViews     = events.filter(e => e.event === 'page_view').length;
  const ctaClicks     = events.filter(e => e.event === 'cta_click').length;
  const pricingClicks = events.filter(e => e.event === 'pricing_click').length;
  const signUps       = events.filter(e => e.event === 'sign_up').length;

  const FILTERS: { id: AnalyticsFilter; label: string }[] = [
    { id: 'all',            label: 'All' },
    { id: 'page_view',      label: 'Page Views' },
    { id: 'cta_click',      label: 'CTA Clicks' },
    { id: 'pricing_click',  label: 'Pricing Clicks' },
    { id: 'pricing_toggle', label: 'Pricing Toggles' },
  ];

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[#6B7280] text-[13px] py-10">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading analytics…
      </div>
    );
  }

  if (error) {
    return <div className="text-red-400 text-[13px] py-10">Error: {error}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Events Today',    value: summary?.totalToday      ?? 0 },
          { label: 'Unique Sessions Today', value: summary?.uniqueSessions  ?? 0 },
          { label: 'Page Views Today',      value: summary?.pageViewsToday  ?? 0 },
          { label: 'New Signups Today',     value: summary?.newSignupsToday ?? 0 },
        ].map(card => (
          <div key={card.label} className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-4">
            <p className="text-[10px] uppercase tracking-widest text-[#4B5563] mb-2">{card.label}</p>
            <p className="text-[22px] font-semibold text-white leading-none">{card.value}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[#374151] -mt-3">Excluding internal dashboard traffic and admin account.</p>

      {/* Funnel */}
      <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-5">
        <p className="text-[10px] uppercase tracking-widest text-[#4B5563] mb-4">Conversion Funnel (last 500 events)</p>
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          {[
            { label: 'Page Views',     count: pageViews },
            { label: 'CTA Clicks',     count: ctaClicks,     prev: pageViews },
            { label: 'Pricing Clicks', count: pricingClicks, prev: ctaClicks },
            { label: 'Sign Ups',       count: signUps,        prev: pricingClicks },
          ].map((step, i) => {
            const pct = i > 0 && step.prev && step.prev > 0
              ? Math.round((step.count / step.prev) * 100)
              : null;
            return (
              <span key={step.label} className="flex items-center gap-2">
                {i > 0 && <span className="text-[#374151]">→</span>}
                <span className="text-white font-semibold">{step.count}</span>
                <span className="text-[#6B7280]">{step.label}</span>
                {pct !== null && (
                  <span className="text-[11px] text-[#39FF6A] bg-[#39FF6A]/10 px-1.5 py-0.5 rounded-full">
                    {pct}%
                  </span>
                )}
              </span>
            );
          })}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-1 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-[7px] text-[12px] font-medium transition-colors ${
              filter === f.id
                ? 'bg-white/[0.10] text-white'
                : 'text-[#6B7280] hover:text-[#9CA3AF] hover:bg-white/[0.04]'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-[#374151]">
          {filtered.length} events · auto-refreshes every 60s
        </span>
      </div>

      {/* Events table */}
      <div className="rounded-[12px] border border-white/[0.06] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                {['Time', 'Event', 'Details', 'Page', 'Referrer', 'Device'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-[#374151] uppercase tracking-[0.08em]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[#4B5563]">No events found</td>
                </tr>
              ) : (
                filtered.map(ev => (
                  <tr key={ev.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-2.5 text-[#4B5563] whitespace-nowrap">{fmtEventDate(ev.timestamp)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        ev.event === 'page_view'      ? 'bg-white/[0.06] text-[#6B7280]' :
                        ev.event === 'cta_click'      ? 'bg-blue-500/10 text-blue-400' :
                        ev.event === 'pricing_click'  ? 'bg-[#39FF6A]/10 text-[#39FF6A]' :
                        ev.event === 'pricing_toggle' ? 'bg-orange-500/10 text-orange-400' :
                        'bg-white/[0.04] text-[#4B5563]'
                      }`}>
                        {ev.event}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 max-w-[200px] truncate">
                      <span className="font-semibold text-[#9CA3AF]">{fmtProps(ev.properties)}</span>
                    </td>
                    <td className="px-4 py-2.5 text-[#6B7280] font-mono">{ev.page}</td>
                    <td className="px-4 py-2.5"><ReferrerBadge referrer={ev.referrer} /></td>
                    <td className="px-4 py-2.5 text-[#4B5563]">{parseDevice(ev.userAgent)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={load}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] border border-white/[0.08] text-[11px] text-[#6B7280] hover:text-white hover:border-white/[0.14] transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh now
        </button>
      </div>
    </div>
  );
}

function RevenueSection() {
  const [data,    setData]    = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const res  = await fetch('/api/admin/revenue');
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      setData(await res.json());
    } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-[#4B5563]" />
    </div>
  );

  if (error) return (
    <div className="rounded-[10px] border border-red-500/20 bg-red-500/[0.05] px-4 py-3">
      <p className="text-[12px] text-red-400">{error}</p>
    </div>
  );

  if (!data) return null;

  const maxMrr = Math.max(...data.planBreakdown.map(p => p.mrr), 1);

  return (
    <div className="space-y-6">
      {/* MRR / ARR top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-[12px] border border-[#A3FF12]/[0.15] bg-[#A3FF12]/[0.03] p-5">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="w-3.5 h-3.5 text-[#A3FF12]" />
            <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-[0.08em]">MRR</span>
          </div>
          <p className="text-[28px] font-semibold text-white">${data.mrr.toLocaleString()}</p>
          <p className="text-[11px] text-[#4B5563] mt-1">Monthly recurring</p>
        </div>
        <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-3.5 h-3.5 text-[#60A5FA]" />
            <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-[0.08em]">ARR</span>
          </div>
          <p className="text-[28px] font-semibold text-white">${data.arr.toLocaleString()}</p>
          <p className="text-[11px] text-[#4B5563] mt-1">Annual run rate</p>
        </div>
        <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] p-5">
          <div className="flex items-center gap-2 mb-3">
            <UserPlus className="w-3.5 h-3.5 text-[#A3FF12]" />
            <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-[0.08em]">New this month</span>
          </div>
          <p className="text-[28px] font-semibold text-white">{data.newThisMonth}</p>
          <p className="text-[11px] text-[#4B5563] mt-1">New subscriptions</p>
        </div>
        <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] p-5">
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-3.5 h-3.5 text-[#F59E0B]" />
            <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-[0.08em]">Credit packs</span>
          </div>
          <p className="text-[28px] font-semibold text-white">${data.orderRevenue.toFixed(0)}</p>
          <p className="text-[11px] text-[#4B5563] mt-1">{data.orderCount} one-time sales</p>
        </div>
      </div>

      {/* Status breakdown + Plan breakdown */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Subscription statuses */}
        <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] p-5">
          <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-[0.08em] mb-4">Subscription Status</p>
          <div className="space-y-3">
            {[
              { label: 'Active',     count: data.activeCount,    color: '#A3FF12' },
              { label: 'Cancelled',  count: data.cancelledCount, color: '#F87171' },
              { label: 'Paused',     count: data.pausedCount,    color: '#F59E0B' },
              { label: 'Trialing',   count: data.trialingCount,  color: '#60A5FA' },
            ].map(row => {
              const total = data.activeCount + data.cancelledCount + data.pausedCount + data.trialingCount;
              const pct   = total > 0 ? (row.count / total) * 100 : 0;
              return (
                <div key={row.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] text-[#9CA3AF]">{row.label}</span>
                    <span className="text-[12px] font-semibold text-white">{row.count}</span>
                  </div>
                  <div className="h-[4px] w-full rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: row.color }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-white/[0.05] flex items-center justify-between">
            <span className="text-[11px] text-[#4B5563]">Churned this month</span>
            <span className="text-[12px] font-semibold text-red-400">{data.churnedThisMonth}</span>
          </div>
        </div>

        {/* Plan MRR breakdown */}
        <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] p-5">
          <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-[0.08em] mb-4">Plan Breakdown</p>
          {data.planBreakdown.length === 0 ? (
            <p className="text-[12px] text-[#4B5563] py-4 text-center">No active subscriptions</p>
          ) : (
            <div className="space-y-4">
              {data.planBreakdown.map(plan => (
                <div key={plan.plan}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: plan.color }} />
                      <span className="text-[12px] font-medium text-white">{plan.label}</span>
                      <span className="text-[11px] text-[#4B5563]">{plan.count} users</span>
                    </div>
                    <span className="text-[12px] font-semibold text-white">${plan.mrr}/mo</span>
                  </div>
                  <div className="h-[4px] w-full rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full transition-all" style={{ width: `${(plan.mrr / maxMrr) * 100}%`, background: plan.color }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 pt-4 border-t border-white/[0.05] flex items-center justify-between">
            <span className="text-[11px] text-[#4B5563]">Total MRR</span>
            <span className="text-[13px] font-bold text-[#A3FF12]">${data.mrr}/mo</span>
          </div>
        </div>
      </div>

      {/* Recent subscriptions */}
      <div>
        <p className="text-[10px] font-semibold text-[#374151] uppercase tracking-[0.08em] mb-3">Recent Subscriptions</p>
        <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-white/[0.05]">
                {['Subscriber', 'Plan', 'Status', 'MRR', 'Renews', 'Started'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-[#374151] uppercase tracking-[0.07em]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {data.recentSubs.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-[#4B5563]">No subscriptions found</td></tr>
              )}
              {data.recentSubs.map((sub: LsSub) => (
                <tr key={sub.id} className="hover:bg-white/[0.015] transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-white font-medium truncate max-w-[160px]">{sub.name || sub.email}</p>
                    <p className="text-[10px] text-[#4B5563] truncate max-w-[160px]">{sub.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <PlanBadge plan={sub.plan} label={sub.planLabel} />
                  </td>
                  <td className="px-4 py-3">
                    <SubStatusBadge status={sub.status} />
                  </td>
                  <td className="px-4 py-3 text-[#A3FF12] font-semibold">
                    {sub.mrr > 0 ? `$${sub.mrr}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-[#9CA3AF]">
                    {sub.renewsAt ? fmtDate(sub.renewsAt) : '—'}
                  </td>
                  <td className="px-4 py-3 text-[#6B7280]">
                    {fmtRelative(sub.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={load}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] border border-white/[0.08] text-[11px] text-[#6B7280] hover:text-white hover:border-white/[0.14] transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh revenue data
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AdminPanel() {
  const { user: clerkUser } = useUser();
  const currentUserId = clerkUser?.id ?? '';

  const [users,         setUsers]         = useState<AdminUser[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState('');
  const [planFilter,    setPlanFilter]    = useState('all');
  const [statFilter,    setStatFilter]    = useState('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [sortKey,       setSortKey]       = useState<SortKey>('createdAt');
  const [sortDir,       setSortDir]       = useState<'asc' | 'desc'>('desc');
  const [modal,         setModal]         = useState<Modal>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [lastRefresh,   setLastRefresh]   = useState(Date.now());

  async function load() {
    setLoading(true);
    try {
      const res  = await fetch('/api/admin/users');
      const json = await res.json();
      if (json.users) setUsers(json.users);
    } finally {
      setLoading(false);
      setLastRefresh(Date.now());
    }
  }

  useEffect(() => { load(); }, []);

  function updateUser(updated: AdminUser) {
    setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
  }

  function removeUser(id: string) {
    setUsers(prev => prev.filter(u => u.id !== id));
  }

  async function toggleStatus(user: AdminUser) {
    setActionLoading(user.id);
    const newStatus = user.licenseStatus === 'active' ? 'inactive' : 'active';
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_status', status: newStatus }),
      });
      if (res.ok) updateUser({ ...user, licenseStatus: newStatus });
    } finally { setActionLoading(null); }
  }

  async function deleteUser(user: AdminUser) {
    const res = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error ?? 'Failed to delete user');
    }
    removeUser(user.id);
  }

  async function refreshLocation(user: AdminUser) {
    setActionLoading(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh_location' }),
      });
      if (res.ok) {
        const { data } = await res.json();
        if (data?.country) {
          updateUser({ ...user, country: data.country, countryCode: data.countryCode ?? user.countryCode });
        }
      }
    } finally { setActionLoading(null); }
  }

  async function revokeDevices(user: AdminUser) {
    setActionLoading(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_device_limit', deviceLimit: 1, clearDevices: true }),
      });
      if (res.ok) updateUser({ ...user, deviceLimit: 1 });
    } finally { setActionLoading(null); }
  }

  const [purging, setPurging] = useState(false);

  async function purgeOrphans() {
    if (!confirm('Delete all Firestore users with no Clerk account? This cannot be undone.')) return;
    setPurging(true);
    try {
      const res  = await fetch('/api/admin/users', { method: 'DELETE' });
      const json = await res.json();
      alert(json.message ?? 'Done.');
      await load();
    } catch {
      alert('Purge failed.');
    } finally {
      setPurging(false);
    }
  }

  function exportCsv() {
    const headers = ['ID', 'Name', 'Email', 'Plan', 'Status', 'Credits', 'Credits Total', 'Country', 'Renewal Date', 'Joined', 'Last Sign-in'];
    const rows = filtered.map(u => [
      u.id, u.displayName, u.email, u.planLabel, u.licenseStatus,
      u.credits, u.creditsTotal, u.country ?? '',
      u.renewalDate ?? '', u.createdAt ?? '', u.lastSignInAt ?? '',
    ]);
    const csv = [headers, ...rows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `prysmor-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  // ── Filtered & sorted list ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = users.filter(u => {
      const q = search.toLowerCase();
      if (q && !u.email.toLowerCase().includes(q) && !u.displayName.toLowerCase().includes(q)) return false;
      if (planFilter    !== 'all' && u.plan             !== planFilter)    return false;
      if (statFilter    !== 'all' && u.licenseStatus    !== statFilter)    return false;
      if (countryFilter !== 'all' && (u.countryCode ?? 'XX') !== countryFilter) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      let va: string | number, vb: string | number;
      switch (sortKey) {
        case 'createdAt':     va = a.createdAt     ?? ''; vb = b.createdAt     ?? ''; break;
        case 'lastSignInAt':  va = a.lastSignInAt  ?? ''; vb = b.lastSignInAt  ?? ''; break;
        case 'email':         va = a.email; vb = b.email; break;
        case 'plan':          va = a.plan;  vb = b.plan;  break;
        case 'credits':       va = a.credits; vb = b.credits; break;
        case 'licenseStatus': va = a.licenseStatus; vb = b.licenseStatus; break;
        default: va = ''; vb = '';
      }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [users, search, planFilter, statFilter, countryFilter, sortKey, sortDir]);

  // ── Unique countries for filter ──────────────────────────────────────────────
  const countries = useMemo(() => {
    const seen = new Map<string, string>();
    users.forEach(u => {
      if (u.country && u.countryCode) seen.set(u.countryCode, u.country);
    });
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [users]);

  // ── Stats ───────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:    users.length,
    active:   users.filter(u => u.licenseStatus === 'active').length,
    inactive: users.filter(u => u.licenseStatus !== 'active').length,
    credits:  users.reduce((s, u) => s + u.credits, 0),
  }), [users]);

  // ── SortHeader ──────────────────────────────────────────────────────────────
  function SortHeader({ label, col, className = '' }: { label: string; col: SortKey; className?: string }) {
    const active = sortKey === col;
    return (
      <th
        className={`px-4 py-3 text-left text-[10px] font-semibold text-[#374151] uppercase tracking-[0.08em] cursor-pointer select-none hover:text-[#6B7280] transition-colors ${className}`}
        onClick={() => toggleSort(col)}
      >
        <span className="flex items-center gap-1">
          {label}
          <ArrowUpDown className={`w-3 h-3 ${active ? 'text-[#A3FF12]' : 'text-[#374151]'}`} />
        </span>
      </th>
    );
  }

  const tabs = [
    { id: 'users',     label: 'Users',     icon: Users },
    { id: 'revenue',   label: 'Revenue',   icon: BarChart2 },
    { id: 'analytics', label: 'Analytics', icon: Activity },
  ] as const;
  type TabId = typeof tabs[number]['id'];
  const [activeTab, setActiveTab] = useState<TabId>('users');

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-[1400px]">
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[28px] font-semibold text-white tracking-tight mb-1">Admin Panel</h1>
          <p className="text-[13px] text-[#6B7280]">Users, revenue, and platform overview.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={purgeOrphans}
            disabled={purging || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] border border-red-500/20 text-[11px] text-red-400/70 hover:text-red-400 hover:border-red-500/40 transition-colors disabled:opacity-50"
            title="Delete Firestore users with no Clerk account"
          >
            {purging ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            Purge orphans
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] border border-white/[0.08] text-[11px] text-[#6B7280] hover:text-white hover:border-white/[0.14] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            {new Date(lastRefresh).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 mb-6 p-1 w-fit rounded-[10px] bg-white/[0.04] border border-white/[0.06]">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-[8px] text-[13px] font-medium transition-all ${
                isActive
                  ? 'bg-white/[0.08] text-white shadow-sm'
                  : 'text-[#6B7280] hover:text-[#9CA3AF]'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#A3FF12]' : 'text-[#4B5563]'}`} />
              {tab.label}
              {tab.id === 'users' && users.length > 0 && (
                <span className="ml-0.5 text-[10px] bg-white/[0.08] text-[#6B7280] px-1.5 py-0.5 rounded-full">
                  {users.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Revenue Tab ── */}
      {activeTab === 'revenue' && <RevenueSection />}

      {/* ── Analytics Tab ── */}
      {activeTab === 'analytics' && <AnalyticsSection />}

      {/* ── Users Tab ── */}
      {activeTab === 'users' && <div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <StatCard icon={Users}       label="Total users"    value={stats.total}    sub={`${stats.active} active`}                                                    color="bg-white/[0.05] text-[#9CA3AF]" />
          <StatCard icon={ShieldCheck} label="Active plans"   value={stats.active}   sub={`${((stats.active / Math.max(stats.total, 1)) * 100).toFixed(0)}% of users`} color="bg-[#A3FF12]/[0.08] text-[#A3FF12]" />
          <StatCard icon={AlertCircle} label="Inactive"       value={stats.inactive} sub="No active plan"                                                              color="bg-red-500/[0.07] text-red-400" />
          <StatCard icon={Zap}         label="Credits in use" value={stats.credits.toLocaleString()} sub="Across all users"                                            color="bg-blue-500/[0.07] text-[#60A5FA]" />
        </div>

        {/* ── Toolbar ── */}
        <div className="space-y-2 mb-4">
          {/* Search row */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#4B5563]" />
              <input
                type="text"
                placeholder="Search by name or email…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-[8px] bg-[#111113] border border-white/[0.07] text-[13px] text-white placeholder:text-[#374151] focus:outline-none focus:border-white/[0.15] transition-colors"
              />
            </div>
            <button
              onClick={exportCsv}
              disabled={filtered.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-[8px] border border-white/[0.07] text-[11px] text-[#6B7280] hover:text-white hover:border-white/[0.14] transition-colors disabled:opacity-40 shrink-0"
            >
              <Download className="w-3 h-3" />
              <span className="hidden sm:inline">CSV</span>
            </button>
          </div>

          {/* Filters row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Plan filter */}
            <div className="relative">
              <select value={planFilter} onChange={e => setPlanFilter(e.target.value)}
                className="appearance-none pl-3 pr-7 py-1.5 rounded-[7px] bg-[#111113] border border-white/[0.07] text-[11px] text-[#9CA3AF] focus:outline-none cursor-pointer hover:border-white/[0.14] transition-colors">
                <option value="all">All plans</option>
                {PLANS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#4B5563] pointer-events-none" />
            </div>

            {/* Status filter */}
            <div className="relative">
              <select value={statFilter} onChange={e => setStatFilter(e.target.value)}
                className="appearance-none pl-3 pr-7 py-1.5 rounded-[7px] bg-[#111113] border border-white/[0.07] text-[11px] text-[#9CA3AF] focus:outline-none cursor-pointer hover:border-white/[0.14] transition-colors">
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#4B5563] pointer-events-none" />
            </div>

            {/* Country filter */}
            {countries.length > 0 && (
              <div className="relative">
                <Globe className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#4B5563] pointer-events-none" />
                <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)}
                  className="appearance-none pl-6 pr-7 py-1.5 rounded-[7px] bg-[#111113] border border-white/[0.07] text-[11px] text-[#9CA3AF] focus:outline-none cursor-pointer hover:border-white/[0.14] transition-colors">
                  <option value="all">All countries</option>
                  {countries.map(([code, name]) => (
                    <option key={code} value={code}>[{code}] {name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#4B5563] pointer-events-none" />
              </div>
            )}

            <span className="text-[11px] text-[#374151] ml-auto">
              {filtered.length} / {users.length}
            </span>
          </div>
        </div>

        {/* ── Mobile: card grid ── */}
        <div className="lg:hidden">
          {loading && (
            <div className="flex items-center justify-center py-16 text-[#4B5563]">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="text-center py-16 text-[13px] text-[#4B5563]">No users found</div>
          )}
          {!loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filtered.map(user => (
                <UserCard
                  key={user.id}
                  user={user}
                  loading={actionLoading === user.id}
                  onDetail={()          => setModal({ type: 'detail',  user })}
                  onPlan={()            => setModal({ type: 'plan',    user })}
                  onCredits={()         => setModal({ type: 'credits', user })}
                  onDelete={()          => setModal({ type: 'delete',  user })}
                  onToggleStatus={()    => toggleStatus(user)}
                  onRefreshLocation={() => refreshLocation(user)}
                  onRevokeDevices={()   => revokeDevices(user)}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Desktop: table ── */}
        <div className="hidden lg:block rounded-[12px] border border-white/[0.07] bg-[#111113] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-white/[0.05]">
                  <SortHeader label="User"        col="email"         className="pl-4 min-w-[200px]" />
                  <SortHeader label="Plan"         col="plan"          className="min-w-[90px]" />
                  <SortHeader label="Status"       col="licenseStatus" className="min-w-[80px]" />
                  <th className="px-3 py-3 text-left text-[10px] font-semibold text-[#374151] uppercase tracking-[0.08em] min-w-[110px]">Country</th>
                  <SortHeader label="Credits"      col="credits"       className="min-w-[110px]" />
                  <th className="px-3 py-3 text-left text-[10px] font-semibold text-[#374151] uppercase tracking-[0.08em] min-w-[120px]">Expires</th>
                  <SortHeader label="Last sign-in" col="lastSignInAt"  className="min-w-[110px]" />
                  <SortHeader label="Joined"       col="createdAt"     className="min-w-[90px]" />
                  <th className="px-3 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {loading && (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-[13px] text-[#4B5563]">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                      Loading users…
                    </td>
                  </tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-[13px] text-[#4B5563]">
                      No users found
                    </td>
                  </tr>
                )}
                {!loading && filtered.map((user) => {
                  const expiry = expiryInfo(user.renewalDate);
                  return (
                    <tr key={user.id} className="hover:bg-white/[0.015] transition-colors group">
                      {/* User */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar user={user} />
                          <div className="min-w-0">
                            <p className="text-[12px] font-medium text-white truncate max-w-[150px]">
                              {user.displayName || <span className="text-[#6B7280] italic">No name</span>}
                            </p>
                            <p className="text-[11px] text-[#4B5563] truncate max-w-[150px]">{user.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Plan */}
                      <td className="px-3 py-3">
                        <PlanBadge plan={user.plan} label={user.planLabel} />
                      </td>

                      {/* Status */}
                      <td className="px-3 py-3">
                        <StatusBadge status={user.licenseStatus} />
                      </td>

                      {/* Country */}
                      <td className="px-3 py-3">
                        <CountryBadge code={user.countryCode} name={user.country} />
                      </td>

                      {/* Credits */}
                      <td className="px-3 py-3">
                        <CreditsMini credits={user.credits} total={user.creditsTotal} />
                      </td>

                      {/* Expires — color-coded */}
                      <td className="px-3 py-3">
                        <span className={`text-[11px] ${expiry.color}`}>{expiry.label}</span>
                      </td>

                      {/* Last sign-in */}
                      <td className="px-3 py-3">
                        <p className="text-[11px] text-[#9CA3AF]">{fmtRelative(user.lastSignInAt)}</p>
                        {user.lastSignInAt && (
                          <p className="text-[10px] text-[#374151]">{fmtDate(user.lastSignInAt)}</p>
                        )}
                      </td>

                      {/* Joined */}
                      <td className="px-3 py-3">
                        <p className="text-[11px] text-[#6B7280]">{fmtRelative(user.createdAt)}</p>
                        {user.createdAt && (
                          <p className="text-[10px] text-[#374151]">{fmtDate(user.createdAt)}</p>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-3">
                        <ActionMenu
                          user={user}
                          loading={actionLoading === user.id}
                          onDetail={()          => setModal({ type: 'detail',  user })}
                          onPlan={()            => setModal({ type: 'plan',    user })}
                          onCredits={()         => setModal({ type: 'credits', user })}
                          onDelete={()          => setModal({ type: 'delete',  user })}
                          onToggleStatus={()    => toggleStatus(user)}
                          onRefreshLocation={() => refreshLocation(user)}
                          onRevokeDevices={()   => revokeDevices(user)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Footer ── */}
        <p className="text-[11px] text-[#1F2937] text-center mt-6">
          Admin · mahmutbegoviic.almin@gmail.com
        </p>
      </div>}

      {/* ── Modals ── */}
      {modal?.type === 'plan' && (
        <PlanModal
          user={modal.user}
          onClose={() => setModal(null)}
          onSave={(u) => { updateUser(u); setModal(null); }}
          isSelf={modal.user.id === currentUserId}
        />
      )}
      {modal?.type === 'credits' && (
        <CreditsModal
          user={modal.user}
          onClose={() => setModal(null)}
          onSave={(u) => { updateUser(u); setModal(null); }}
        />
      )}
      {modal?.type === 'detail' && (
        <DetailModal user={modal.user} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'delete' && (
        <DeleteModal
          user={modal.user}
          onClose={() => setModal(null)}
          onConfirm={() => deleteUser(modal.user)}
        />
      )}
    </div>
  );
}

