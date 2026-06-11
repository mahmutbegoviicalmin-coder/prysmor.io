"use client";

import { useEffect, useState, useCallback } from "react";
import { useUser } from "@clerk/nextjs";
import {
  Copy, Check, Users, DollarSign, Clock,
  Plus, Trash2, Edit2, RefreshCw, Loader2, X,
  CheckCircle, UserMinus, TrendingUp,
} from "lucide-react";
import { AffiliateEarningsChart } from "@/components/dashboard/AffiliateEarningsChart";
import type { AffiliateChart } from "@/lib/affiliateChart";
import { DEFAULT_AFFILIATE_CHART } from "@/lib/affiliateChart";

const GREEN        = "#39FF6A";
const ADMIN_EMAIL  = "mahmutbegoviic.almin@gmail.com";
const CARD: React.CSSProperties = {
  background:   "#0c0c0c",
  border:       "1px solid #161616",
  borderRadius: "12px",
  padding:      "24px",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface AffiliateProfile {
  id: string;
  email: string;
  userId: string;
  code: string;
  commissionPercent: number;
  manualTotalEarnings: number;
  manualPendingEarnings: number;
  manualPaidEarnings: number;
  manualActiveMembers: number;
  manualInactiveMembers: number;
  manualChart: AffiliateChart;
  note: string;
  status: "active" | "inactive";
  createdAt: string | null;
}

interface Stats {
  totalEarnings:   number;
  pendingEarnings: number;
  paidEarnings:    number;
  activeMembers:   number;
  inactiveMembers: number;
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; accent?: string;
}) {
  return (
    <div style={CARD}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <p style={{ fontSize: "11px", color: "#444", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "10px" }}>{label}</p>
          <p style={{ fontSize: "28px", fontWeight: 800, color: accent ?? "white", letterSpacing: "-1px", margin: 0 }}>{value}</p>
          {sub && <p style={{ fontSize: "12px", color: "#444", marginTop: "4px" }}>{sub}</p>}
        </div>
        <div style={{
          width: "36px", height: "36px", borderRadius: "8px",
          background: "rgba(57,255,106,0.08)", border: "1px solid rgba(57,255,106,0.12)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Icon style={{ width: "16px", height: "16px", color: GREEN }} />
        </div>
      </div>
    </div>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button onClick={copy} style={{
      display: "flex", alignItems: "center", gap: "6px",
      padding: "6px 12px", borderRadius: "6px", cursor: "pointer",
      background: "rgba(255,255,255,0.04)", border: "1px solid #1e1e1e",
      fontSize: "12px", color: copied ? GREEN : "#666", transition: "all 150ms",
      whiteSpace: "nowrap",
    }}>
      {copied ? <Check style={{ width: "12px", height: "12px" }} /> : <Copy style={{ width: "12px", height: "12px" }} />}
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}

// ─── Payout request ───────────────────────────────────────────────────────────

type PayoutMethod = 'paypal' | 'bank';

interface PayoutRequestRow {
  id: string;
  amount: number;
  method: PayoutMethod;
  status: 'pending' | 'paid' | 'rejected';
  createdAt: string | null;
}

function PayoutRequestSection({ availableAmount }: { availableAmount: number }) {
  const [method, setMethod] = useState<PayoutMethod>('paypal');
  const [paypalMeLink, setPaypalMeLink] = useState('');
  const [bank, setBank] = useState({
    firstName: '',
    lastName: '',
    address: '',
    city: '',
    phone: '',
    accountNumber: '',
  });
  const [requests, setRequests] = useState<PayoutRequestRow[]>([]);
  const [openRequest, setOpenRequest] = useState<PayoutRequestRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/affiliate/payout-requests')
      .then((r) => r.json())
      .then((d) => {
        setRequests(d.requests ?? []);
        setOpenRequest(d.openRequest ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const inputStyle: React.CSSProperties = {
    padding: '10px 12px',
    borderRadius: '8px',
    background: '#111',
    border: '1px solid #1e1e1e',
    color: 'white',
    fontSize: '13px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  };

  const submit = async () => {
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/affiliate/payout-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          method === 'paypal'
            ? { method: 'paypal', paypalMeLink }
            : { method: 'bank', bank },
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Request failed');
        return;
      }
      setSuccess('Payout request submitted. You will be notified when it is processed.');
      setPaypalMeLink('');
      setBank({
        firstName: '',
        lastName: '',
        address: '',
        city: '',
        phone: '',
        accountNumber: '',
      });
      load();
    } finally {
      setSubmitting(false);
    }
  };

  const canRequest = availableAmount > 0 && !openRequest;

  return (
    <div style={{ ...CARD, marginBottom: '24px' }}>
      <p style={{ fontSize: '11px', color: '#444', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '8px' }}>
        Request Payout
      </p>
      <p style={{ fontSize: '13px', color: '#666', margin: '0 0 16px', lineHeight: 1.6 }}>
        Available balance:{' '}
        <span style={{ color: GREEN, fontWeight: 700 }}>${availableAmount.toFixed(2)}</span>
      </p>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
          <Loader2 style={{ width: '18px', height: '18px', color: '#333', animation: 'spin 1s linear infinite' }} />
        </div>
      ) : openRequest ? (
        <div style={{
          padding: '14px 16px', borderRadius: '8px',
          background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)',
          fontSize: '13px', color: '#aaa', lineHeight: 1.6,
        }}>
          You have a pending payout request for{' '}
          <span style={{ color: '#F59E0B', fontWeight: 600 }}>${openRequest.amount.toFixed(2)}</span>.
          Wait for admin approval before submitting another request.
        </div>
      ) : availableAmount <= 0 ? (
        <p style={{ fontSize: '13px', color: '#444', margin: 0 }}>No balance available for payout yet.</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            {(['paypal', 'bank'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: method === m ? `1px solid ${GREEN}` : '1px solid #1e1e1e',
                  background: method === m ? 'rgba(57,255,106,0.08)' : '#111',
                  color: method === m ? GREEN : '#666',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {m === 'paypal' ? 'PayPal' : 'Bank transfer'}
              </button>
            ))}
          </div>

          {method === 'paypal' ? (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '11px', color: '#555', marginBottom: '6px' }}>
                PayPal.me link
              </label>
              <input
                type="url"
                value={paypalMeLink}
                onChange={(e) => setPaypalMeLink(e.target.value)}
                placeholder="https://paypal.me/yourname"
                style={inputStyle}
              />
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
              {[
                ['firstName', 'First name'],
                ['lastName', 'Last name'],
                ['address', 'Address'],
                ['city', 'City'],
                ['phone', 'Phone number'],
                ['accountNumber', 'Account number'],
              ].map(([key, label]) => (
                <div key={key} style={{ gridColumn: key === 'address' ? '1 / -1' : undefined }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#555', marginBottom: '6px' }}>
                    {label}
                  </label>
                  <input
                    value={bank[key as keyof typeof bank]}
                    onChange={(e) => setBank((prev) => ({ ...prev, [key]: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
              ))}
            </div>
          )}

          {error && <p style={{ fontSize: '12px', color: '#F87171', marginBottom: '12px' }}>{error}</p>}
          {success && <p style={{ fontSize: '12px', color: GREEN, marginBottom: '12px' }}>{success}</p>}

          <button
            type="button"
            onClick={submit}
            disabled={!canRequest || submitting}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              border: 'none',
              background: submitting ? '#1a1a1a' : GREEN,
              color: submitting ? '#555' : '#000',
              fontSize: '13px',
              fontWeight: 700,
              cursor: submitting || !canRequest ? 'default' : 'pointer',
            }}
          >
            {submitting ? 'Submitting...' : `Request $${availableAmount.toFixed(2)}`}
          </button>
        </>
      )}

      {requests.length > 0 && (
        <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #161616' }}>
          <p style={{ fontSize: '11px', color: '#444', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '10px' }}>
            Payout history
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {requests.slice(0, 5).map((req) => (
              <div
                key={req.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '12px',
                  fontSize: '12px',
                  color: '#666',
                }}
              >
                <span>${req.amount.toFixed(2)} · {req.method === 'paypal' ? 'PayPal' : 'Bank'}</span>
                <span style={{
                  textTransform: 'uppercase',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: req.status === 'paid' ? GREEN : req.status === 'rejected' ? '#F87171' : '#F59E0B',
                }}>
                  {req.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Partner earnings chart ───────────────────────────────────────────────────

function ChartEditor({
  title,
  points,
  onTitleChange,
  onPointsChange,
}: {
  title: string;
  points: { label: string; value: string }[];
  onTitleChange: (value: string) => void;
  onPointsChange: (points: { label: string; value: string }[]) => void;
}) {
  const previewChart: AffiliateChart = {
    title: title.trim() || DEFAULT_AFFILIATE_CHART.title,
    points: points.map((p) => ({
      label: p.label.trim() || '—',
      value: Math.max(0, Number(p.value) || 0),
    })),
  };

  const inputStyle: React.CSSProperties = {
    padding: '7px 10px',
    borderRadius: '6px',
    background: '#111',
    border: '1px solid #1e1e1e',
    color: 'white',
    fontSize: '13px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #161616' }}>
      <p style={{ fontSize: '10px', color: '#333', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '12px' }}>
        Dashboard chart
      </p>
      <label style={{ display: 'block', fontSize: '10px', color: '#444', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>
        Chart title
      </label>
      <input
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="Earnings overview"
        style={{ ...inputStyle, marginBottom: '14px' }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
        {points.map((point, index) => (
          <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 36px', gap: '8px', alignItems: 'center' }}>
            <input
              value={point.label}
              onChange={(e) => {
                const next = [...points];
                next[index] = { ...next[index], label: e.target.value };
                onPointsChange(next);
              }}
              placeholder="Jan"
              style={inputStyle}
            />
            <input
              value={point.value}
              onChange={(e) => {
                const next = [...points];
                next[index] = { ...next[index], value: e.target.value };
                onPointsChange(next);
              }}
              placeholder="0"
              style={inputStyle}
            />
            <button
              type="button"
              onClick={() => onPointsChange(points.filter((_, i) => i !== index))}
              style={{
                height: '34px',
                borderRadius: '6px',
                border: '1px solid rgba(239,68,68,0.2)',
                background: 'transparent',
                color: 'rgba(239,68,68,0.6)',
                cursor: 'pointer',
              }}
            >
              <X style={{ width: '14px', height: '14px', margin: '0 auto' }} />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onPointsChange([...points, { label: '', value: '0' }])}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '7px 12px',
          borderRadius: '6px',
          border: '1px solid #1e1e1e',
          background: 'transparent',
          color: '#666',
          fontSize: '12px',
          cursor: 'pointer',
          marginBottom: '16px',
        }}
      >
        <Plus style={{ width: '12px', height: '12px' }} />
        Add bar
      </button>

      <div style={{ ...CARD, padding: '18px', background: '#0a0a0a' }}>
        <p style={{ fontSize: '11px', color: '#444', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '12px' }}>
          Preview
        </p>
        <AffiliateEarningsChart chart={previewChart} />
      </div>
    </div>
  );
}

// ─── Affiliate View ───────────────────────────────────────────────────────────

function AffiliateView() {
  const [data, setData] = useState<{
    affiliate: AffiliateProfile;
    stats: Stats;
    chart: AffiliateChart;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    fetch("/api/affiliate/stats")
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d); })
      .catch(() => setError("Failed to load data"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", padding: "80px" }}>
      <Loader2 style={{ width: "20px", height: "20px", color: "#333", animation: "spin 1s linear infinite" }} />
      
    </div>
  );

  if (error === "No affiliate profile found") return (
    <div style={{ padding: "60px 28px", color: "#555", fontSize: "14px" }}>
      <p style={{ margin: 0 }}>Your affiliate profile has not been set up yet.</p>
      <p style={{ fontSize: "12px", color: "#333", marginTop: "8px" }}>Contact the admin to activate your referral link.</p>
    </div>
  );

  if (error || !data) return <div style={{ padding: "40px", color: "#F87171", fontSize: "13px" }}>{error || "No data"}</div>;

  const { affiliate, stats, chart } = data;
  const refLink = `https://prysmor.io/?ref=${affiliate.code}`;

  return (
    <div style={{ padding: "32px 28px", maxWidth: "920px" }}>
      <div style={{ marginBottom: "24px" }}>
        <p style={{ fontSize: "10px", color: "#333", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "6px" }}>
          Partner dashboard
        </p>
        <h1 style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-0.8px", color: "white", margin: 0 }}>
          Your earnings
        </h1>
        <p style={{ fontSize: "14px", color: "#555", marginTop: "6px" }}>
          Balance and payout overview
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px", marginBottom: "16px" }}>
        {[
          { label: "Total earned", value: `$${stats.totalEarnings}`, accent: GREEN },
          { label: "Available", value: `$${stats.pendingEarnings}`, accent: "#F59E0B" },
          { label: "Paid out", value: `$${stats.paidEarnings}`, accent: "white" },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              ...CARD,
              padding: "18px 20px",
              background: "linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0) 100%)",
            }}
          >
            <p style={{ fontSize: "10px", color: "#444", textTransform: "uppercase", letterSpacing: "1.5px", margin: "0 0 8px" }}>
              {item.label}
            </p>
            <p style={{ fontSize: "28px", fontWeight: 800, color: item.accent, letterSpacing: "-1px", margin: 0 }}>
              {item.value}
            </p>
          </div>
        ))}
      </div>

      <div style={{ ...CARD, marginBottom: "16px", padding: "22px 22px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "8px" }}>
          <div>
            <p style={{ fontSize: "11px", color: "#444", textTransform: "uppercase", letterSpacing: "1.5px", margin: "0 0 4px" }}>
              Performance
            </p>
            <h2 style={{ fontSize: "18px", fontWeight: 600, color: "white", margin: 0 }}>{chart.title}</h2>
          </div>
          <TrendingUp style={{ width: "18px", height: "18px", color: GREEN, opacity: 0.7 }} />
        </div>
        <AffiliateEarningsChart chart={chart} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px", marginBottom: "16px" }}>
        <div style={{ ...CARD, padding: "18px 20px" }}>
          <p style={{ fontSize: "10px", color: "#444", textTransform: "uppercase", letterSpacing: "1.5px", margin: "0 0 8px" }}>Active members</p>
          <p style={{ fontSize: "24px", fontWeight: 700, color: "white", margin: 0 }}>{stats.activeMembers}</p>
        </div>
        <div style={{ ...CARD, padding: "18px 20px" }}>
          <p style={{ fontSize: "10px", color: "#444", textTransform: "uppercase", letterSpacing: "1.5px", margin: "0 0 8px" }}>Inactive</p>
          <p style={{ fontSize: "24px", fontWeight: 700, color: "white", margin: 0 }}>{stats.inactiveMembers}</p>
        </div>
      </div>

      <PayoutRequestSection availableAmount={stats.pendingEarnings} />

      <div style={{ ...CARD, marginBottom: "16px", padding: "18px 20px" }}>
        <p style={{ fontSize: "11px", color: "#444", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "10px" }}>
          Referral link
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <code style={{
            flex: 1, minWidth: 0, padding: "10px 14px", borderRadius: "8px",
            background: "#111", border: "1px solid #1e1e1e",
            fontSize: "12px", color: "#777", fontFamily: "monospace",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{refLink}</code>
          <CopyBtn text={refLink} />
        </div>
        <p style={{ fontSize: "11px", color: "#333", marginTop: "10px", marginBottom: 0 }}>
          Code <span style={{ color: GREEN, fontWeight: 600, fontFamily: "monospace" }}>{affiliate.code}</span>
          {" · "}
          {affiliate.commissionPercent}% commission
        </p>
      </div>

      {affiliate.note && (
        <div style={{ ...CARD, borderColor: "rgba(57,255,106,0.1)", padding: "18px 20px" }}>
          <p style={{ fontSize: "11px", color: "#444", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "8px" }}>Note</p>
          <p style={{ fontSize: "13px", color: "#888", margin: 0, lineHeight: 1.6 }}>{affiliate.note}</p>
        </div>
      )}
    </div>
  );
}

// ─── Admin View ───────────────────────────────────────────────────────────────

type EditState = {
  commissionPercent:     string;
  status:                "active" | "inactive";
  manualTotalEarnings:   string;
  manualPendingEarnings: string;
  manualPaidEarnings:    string;
  manualActiveMembers:   string;
  manualInactiveMembers: string;
  chartTitle:            string;
  chartPoints:           { label: string; value: string }[];
  note:                  string;
};

function AdminAffiliateView() {
  const [affiliates, setAffiliates] = useState<AffiliateProfile[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editId, setEditId]         = useState<string | null>(null);
  const [editState, setEditState]   = useState<EditState | null>(null);
  const [showAdd, setShowAdd]       = useState(false);
  const [newEmail, setNewEmail]     = useState("");
  const [newUserId, setNewUserId]   = useState("");
  const [newCode, setNewCode]       = useState("");
  const [newCommission, setNewCommission] = useState("15");

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/affiliates")
      .then(r => r.json())
      .then(d => setAffiliates(d.affiliates ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const addAffiliate = async () => {
    if (!newEmail || !newUserId) return;
    setSaving(true);
    await fetch("/api/admin/affiliates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newEmail, userId: newUserId, code: newCode || undefined, commissionPercent: Number(newCommission) }),
    });
    setSaving(false);
    setShowAdd(false);
    setNewEmail(""); setNewUserId(""); setNewCode(""); setNewCommission("15");
    load();
  };

  const openEdit = (aff: AffiliateProfile) => {
    setEditId(aff.id);
    setEditState({
      commissionPercent:     String(aff.commissionPercent),
      status:                aff.status,
      manualTotalEarnings:   String(aff.manualTotalEarnings),
      manualPendingEarnings: String(aff.manualPendingEarnings),
      manualPaidEarnings:    String(aff.manualPaidEarnings),
      manualActiveMembers:   String(aff.manualActiveMembers),
      manualInactiveMembers: String(aff.manualInactiveMembers),
      chartTitle:            aff.manualChart?.title ?? DEFAULT_AFFILIATE_CHART.title,
      chartPoints:           (aff.manualChart?.points ?? DEFAULT_AFFILIATE_CHART.points).map((p) => ({
        label: p.label,
        value: String(p.value),
      })),
      note:                  aff.note,
    });
  };

  const saveEdit = async (id: string) => {
    if (!editState) return;
    setSaving(true);
    await fetch(`/api/admin/affiliates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commissionPercent:     Number(editState.commissionPercent),
        status:                editState.status,
        manualTotalEarnings:   Number(editState.manualTotalEarnings),
        manualPendingEarnings: Number(editState.manualPendingEarnings),
        manualPaidEarnings:    Number(editState.manualPaidEarnings),
        manualActiveMembers:   Number(editState.manualActiveMembers),
        manualInactiveMembers: Number(editState.manualInactiveMembers),
        manualChart: {
          title: editState.chartTitle.trim() || DEFAULT_AFFILIATE_CHART.title,
          points: editState.chartPoints
            .map((p) => ({
              label: p.label.trim(),
              value: Math.max(0, Number(p.value) || 0),
            }))
            .filter((p) => p.label),
        },
        note:                  editState.note,
      }),
    });
    setSaving(false);
    setEditId(null);
    load();
  };

  const deleteAffiliate = async (id: string) => {
    if (!confirm("Delete this affiliate profile?")) return;
    setDeletingId(id);
    await fetch(`/api/admin/affiliates/${id}`, { method: "DELETE" });
    setDeletingId(null);
    load();
  };

  const set = (key: keyof EditState, val: string) =>
    setEditState(prev => prev ? { ...prev, [key]: val } : prev);

  const inputStyle: React.CSSProperties = {
    padding: "7px 10px", borderRadius: "6px", background: "#111",
    border: "1px solid #1e1e1e", color: "white", fontSize: "13px",
    outline: "none", width: "100%", boxSizing: "border-box",
  };

  return (
    <div style={{ padding: "32px 28px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "28px" }}>
        <div>
          <p style={{ fontSize: "10px", color: "#333", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "6px" }}>// AFFILIATE MANAGEMENT</p>
          <h1 style={{ fontSize: "26px", fontWeight: 700, letterSpacing: "-0.8px", color: "white", margin: 0 }}>Affiliates</h1>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={load} disabled={loading} style={{
            display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px",
            borderRadius: "7px", border: "1px solid #1e1e1e", background: "transparent",
            fontSize: "12px", color: "#555", cursor: "pointer",
          }}>
            <RefreshCw style={{ width: "12px", height: "12px", animation: loading ? "spin 1s linear infinite" : "none" }} />
            Refresh
          </button>
          <button onClick={() => setShowAdd(true)} style={{
            display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px",
            borderRadius: "7px", border: "none", background: GREEN,
            fontSize: "12px", fontWeight: 600, color: "#000", cursor: "pointer",
          }}>
            <Plus style={{ width: "12px", height: "12px" }} />
            Add Affiliate
          </button>
        </div>
      </div>

      {/* Add modal */}
      {showAdd && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
        }}>
          <div style={{ ...CARD, width: "420px", maxWidth: "calc(100vw - 32px)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 600, color: "white", margin: 0 }}>Add Affiliate</h2>
              <button onClick={() => setShowAdd(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#444" }}>
                <X style={{ width: "16px", height: "16px" }} />
              </button>
            </div>
            {[
              { label: "Affiliate Email", value: newEmail, set: setNewEmail, placeholder: "email@example.com" },
              { label: "Clerk User ID", value: newUserId, set: setNewUserId, placeholder: "user_2abc..." },
              { label: "Custom Code (optional)", value: newCode, set: setNewCode, placeholder: "Auto-generated" },
              { label: "Commission %", value: newCommission, set: setNewCommission, placeholder: "15" },
            ].map(f => (
              <div key={f.label} style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "11px", color: "#444", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px" }}>{f.label}</label>
                <input value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} style={inputStyle} />
              </div>
            ))}
            <button onClick={addAffiliate} disabled={saving || !newEmail || !newUserId} style={{
              width: "100%", padding: "11px", borderRadius: "8px", border: "none",
              background: saving ? "#1a1a1a" : GREEN, color: saving ? "#555" : "#000",
              fontSize: "13px", fontWeight: 700, cursor: saving ? "default" : "pointer", marginTop: "4px",
            }}>
              {saving ? "Saving..." : "Create Affiliate"}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "60px" }}>
          <Loader2 style={{ width: "20px", height: "20px", color: "#333", animation: "spin 1s linear infinite" }} />
        </div>
      ) : affiliates.length === 0 ? (
        <div style={{ ...CARD, textAlign: "center", padding: "60px", color: "#444", fontSize: "13px" }}>
          No affiliates yet. Add one to get started.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {affiliates.map(aff => (
            <div key={aff.id} style={CARD}>
              {/* Top row */}
              <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span style={{ fontSize: "14px", fontWeight: 600, color: "white" }}>{aff.email}</span>
                    <span style={{
                      fontSize: "10px", padding: "2px 7px", borderRadius: "4px",
                      background: aff.status === "active" ? "rgba(57,255,106,0.08)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${aff.status === "active" ? "rgba(57,255,106,0.2)" : "#1e1e1e"}`,
                      color: aff.status === "active" ? GREEN : "#444",
                    }}>{aff.status}</span>
                  </div>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <code style={{ fontSize: "11px", color: GREEN, fontFamily: "monospace" }}>CODE: {aff.code}</code>
                    <span style={{ fontSize: "11px", color: "#444" }}>·</span>
                    <span style={{ fontSize: "11px", color: "#444" }}>{aff.commissionPercent}% commission</span>
                  </div>
                </div>

                {/* Quick stats */}
                <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
                  {[
                    { label: "Total", value: `$${aff.manualTotalEarnings}` },
                    { label: "Pending", value: `$${aff.manualPendingEarnings}` },
                    { label: "Active", value: String(aff.manualActiveMembers) },
                    { label: "Inactive", value: String(aff.manualInactiveMembers) },
                  ].map(s => (
                    <div key={s.label} style={{ textAlign: "center" }}>
                      <p style={{ fontSize: "16px", fontWeight: 700, color: "white", margin: 0 }}>{s.value}</p>
                      <p style={{ fontSize: "10px", color: "#333", textTransform: "uppercase", letterSpacing: "1px", margin: 0 }}>{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                  <button onClick={() => openEdit(aff)} style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    padding: "6px 12px", borderRadius: "6px", border: "1px solid #1e1e1e",
                    background: "transparent", fontSize: "12px", color: "#555", cursor: "pointer",
                  }}>
                    <Edit2 style={{ width: "12px", height: "12px" }} />
                    Edit
                  </button>
                  <button onClick={() => deleteAffiliate(aff.id)} disabled={deletingId === aff.id} style={{
                    padding: "6px 10px", borderRadius: "6px", border: "1px solid rgba(239,68,68,0.2)",
                    background: "transparent", cursor: "pointer", color: "rgba(239,68,68,0.6)",
                  }}>
                    {deletingId === aff.id
                      ? <Loader2 style={{ width: "12px", height: "12px", animation: "spin 1s linear infinite" }} />
                      : <Trash2 style={{ width: "12px", height: "12px" }} />}
                  </button>
                </div>
              </div>

              {aff.note && (
                <p style={{ margin: "12px 0 0", fontSize: "12px", color: "#444", paddingTop: "12px", borderTop: "1px solid #161616" }}>
                  Note: {aff.note}
                </p>
              )}

              {/* Edit panel */}
              {editId === aff.id && editState && (
                <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #161616" }}>
                  <p style={{ fontSize: "10px", color: "#333", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "16px" }}>
                    Edit, changes are visible to the affiliate immediately
                  </p>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px", marginBottom: "12px" }}>
                    {([
                      { key: "commissionPercent",     label: "Commission %" },
                      { key: "manualTotalEarnings",   label: "Total Earnings ($)" },
                      { key: "manualPendingEarnings", label: "Pending ($)" },
                      { key: "manualPaidEarnings",    label: "Paid ($)" },
                      { key: "manualActiveMembers",   label: "Active Members" },
                      { key: "manualInactiveMembers", label: "Inactive Members" },
                    ] as { key: keyof EditState; label: string }[]).map(f => (
                      <div key={f.key}>
                        <label style={{ display: "block", fontSize: "10px", color: "#444", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px" }}>
                          {f.label}
                        </label>
                        <input
                          type="number"
                          value={editState[f.key]}
                          onChange={e => set(f.key, e.target.value)}
                          style={inputStyle}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Status */}
                  <div style={{ marginBottom: "12px" }}>
                    <label style={{ display: "block", fontSize: "10px", color: "#444", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px" }}>Status</label>
                    <select
                      value={editState.status}
                      onChange={e => set("status", e.target.value)}
                      style={{ ...inputStyle, width: "auto" }}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>

                  {/* Note */}
                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", fontSize: "10px", color: "#444", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px" }}>
                      Note (visible to affiliate)
                    </label>
                    <textarea
                      value={editState.note}
                      onChange={e => set("note", e.target.value)}
                      rows={2}
                      placeholder="Optional message visible to the affiliate..."
                      style={{ ...inputStyle, resize: "vertical" }}
                    />
                  </div>

                  <ChartEditor
                    title={editState.chartTitle}
                    points={editState.chartPoints}
                    onTitleChange={(value) => set("chartTitle", value)}
                    onPointsChange={(points) => setEditState((prev) => prev ? { ...prev, chartPoints: points } : prev)}
                  />

                  <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
                    <button onClick={() => saveEdit(aff.id)} disabled={saving} style={{
                      padding: "8px 20px", borderRadius: "7px", border: "none",
                      background: saving ? "#1a1a1a" : GREEN, color: saving ? "#555" : "#000",
                      fontWeight: 600, fontSize: "12px", cursor: saving ? "default" : "pointer",
                    }}>
                      {saving ? "Saving..." : "Save Changes"}
                    </button>
                    <button onClick={() => setEditId(null)} style={{
                      padding: "8px 14px", borderRadius: "7px", border: "1px solid #1e1e1e",
                      background: "transparent", color: "#555", fontSize: "12px", cursor: "pointer",
                    }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AffiliateDashboard() {
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  if (!email) return null;
  return email === ADMIN_EMAIL ? <AdminAffiliateView /> : <AffiliateView />;
}
