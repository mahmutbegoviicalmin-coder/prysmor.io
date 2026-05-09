"use client";

import { useEffect, useState, useCallback } from "react";
import { useUser } from "@clerk/nextjs";
import {
  Copy, Check, Users, DollarSign, TrendingUp, Clock,
  Plus, Trash2, Edit2, RefreshCw, Loader2, X, CheckCircle,
} from "lucide-react";

const GREEN        = "#39FF6A";
const ADMIN_EMAIL  = "mahmutbegoviic.almin@gmail.com";
const CARD_STYLE   = {
  background:   "#0c0c0c",
  border:       "1px solid #161616",
  borderRadius: "12px",
  padding:      "24px",
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Referral {
  id: string;
  referredEmail: string;
  plan: string;
  commission: number;
  status: "pending" | "paid";
  createdAt: string | null;
}

interface AffiliateWithStats {
  id: string;
  email: string;
  userId: string;
  code: string;
  commissionPerSale: number;
  totalEarnings: number;
  paidEarnings: number;
  pendingEarnings: number;
  status: "active" | "inactive";
  createdAt: string | null;
  referralCount: number;
  activeCount: number;
  paidCount: number;
  referrals: Referral[];
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon: Icon, accent,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; accent?: string;
}) {
  return (
    <div style={CARD_STYLE}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <p style={{ fontSize: "11px", color: "#444", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "10px" }}>
            {label}
          </p>
          <p style={{ fontSize: "28px", fontWeight: 800, color: accent ?? "white", letterSpacing: "-1px", margin: 0 }}>
            {value}
          </p>
          {sub && <p style={{ fontSize: "12px", color: "#444", marginTop: "4px" }}>{sub}</p>}
        </div>
        <div style={{
          width: "36px", height: "36px", borderRadius: "8px",
          background: `rgba(57,255,106,0.08)`, border: "1px solid rgba(57,255,106,0.12)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Icon style={{ width: "16px", height: "16px", color: GREEN }} />
        </div>
      </div>
    </div>
  );
}

// ─── Copy button ──────────────────────────────────────────────────────────────

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
    }}>
      {copied ? <Check style={{ width: "12px", height: "12px" }} /> : <Copy style={{ width: "12px", height: "12px" }} />}
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}

// ─── Referral table ───────────────────────────────────────────────────────────

function ReferralTable({ referrals }: { referrals: Referral[] }) {
  if (referrals.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px", color: "#333", fontSize: "13px" }}>
        No referrals yet. Share your link to start earning.
      </div>
    );
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr>
            {["Email", "Plan", "Commission", "Status", "Date"].map(h => (
              <th key={h} style={{
                textAlign: "left", padding: "10px 12px",
                color: "#333", fontSize: "10px", textTransform: "uppercase",
                letterSpacing: "1.5px", borderBottom: "1px solid #161616",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {referrals.map((r) => (
            <tr key={r.id} style={{ borderBottom: "1px solid #0f0f0f" }}>
              <td style={{ padding: "12px", color: "#888" }}>{r.referredEmail || "—"}</td>
              <td style={{ padding: "12px" }}>
                <span style={{
                  fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px",
                  padding: "2px 8px", borderRadius: "4px",
                  background: "rgba(57,255,106,0.08)", border: "1px solid rgba(57,255,106,0.15)", color: GREEN,
                }}>{r.plan}</span>
              </td>
              <td style={{ padding: "12px", color: "white", fontWeight: 600 }}>${r.commission}</td>
              <td style={{ padding: "12px" }}>
                <span style={{
                  fontSize: "11px", padding: "2px 8px", borderRadius: "4px",
                  background: r.status === "paid" ? "rgba(57,255,106,0.08)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${r.status === "paid" ? "rgba(57,255,106,0.2)" : "#1e1e1e"}`,
                  color: r.status === "paid" ? GREEN : "#555",
                }}>{r.status === "paid" ? "Paid" : "Pending"}</span>
              </td>
              <td style={{ padding: "12px", color: "#444" }}>
                {r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Affiliate View (brzotrcipuska7) ─────────────────────────────────────────

function AffiliateView() {
  const [data, setData]     = useState<{ affiliate: AffiliateWithStats; stats: { totalEarnings: number; pendingEarnings: number; paidEarnings: number; totalReferrals: number; activeReferrals: number }; referrals: Referral[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState("");

  useEffect(() => {
    fetch("/api/affiliate/stats")
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("Failed to load data"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", padding: "80px" }}>
      <Loader2 style={{ width: "20px", height: "20px", color: "#333", animation: "spin 1s linear infinite" }} />
    </div>
  );

  if (error === "No affiliate profile found") return (
    <div style={{ textAlign: "center", padding: "80px", color: "#555", fontSize: "14px" }}>
      <p>Your affiliate profile has not been set up yet.</p>
      <p style={{ fontSize: "12px", color: "#333", marginTop: "8px" }}>Contact the admin to get your referral link activated.</p>
    </div>
  );

  if (error) return <div style={{ padding: "40px", color: "#F87171", fontSize: "13px" }}>{error}</div>;
  if (!data) return null;

  const { affiliate, stats, referrals } = data;
  const refLink = `https://prysmor.io/?ref=${affiliate.code}`;

  return (
    <div style={{ padding: "32px 28px", maxWidth: "900px" }}>
      {/* Header */}
      <div style={{ marginBottom: "28px" }}>
        <p style={{ fontSize: "10px", color: "#333", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "6px" }}>
          // AFFILIATE
        </p>
        <h1 style={{ fontSize: "26px", fontWeight: 700, letterSpacing: "-0.8px", color: "white", margin: 0 }}>
          Your Referral Stats
        </h1>
        <p style={{ fontSize: "14px", color: "#555", marginTop: "6px" }}>
          Earn ${affiliate.commissionPerSale} for every subscription you refer.
        </p>
      </div>

      {/* Referral Link */}
      <div style={{ ...CARD_STYLE, marginBottom: "24px" }}>
        <p style={{ fontSize: "11px", color: "#444", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "12px" }}>
          Your Referral Link
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <code style={{
            flex: 1, minWidth: 0, padding: "10px 14px", borderRadius: "8px",
            background: "#111", border: "1px solid #1e1e1e",
            fontSize: "13px", color: "#888", fontFamily: "monospace",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {refLink}
          </code>
          <CopyBtn text={refLink} />
        </div>
        <p style={{ fontSize: "11px", color: "#333", marginTop: "10px" }}>
          Code: <span style={{ color: GREEN, fontWeight: 600 }}>{affiliate.code}</span>
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px", marginBottom: "28px" }}>
        <StatCard label="Total Earnings" value={`$${stats.totalEarnings}`} icon={DollarSign} accent={GREEN} />
        <StatCard label="Pending Payout" value={`$${stats.pendingEarnings}`} sub="Not yet paid" icon={Clock} />
        <StatCard label="Paid Out" value={`$${stats.paidEarnings}`} icon={CheckCircle} />
        <StatCard label="Total Referrals" value={String(stats.totalReferrals)} sub={`${stats.activeReferrals} active`} icon={Users} />
      </div>

      {/* Referrals table */}
      <div style={CARD_STYLE}>
        <p style={{ fontSize: "10px", color: "#333", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "16px" }}>
          Referral History
        </p>
        <ReferralTable referrals={referrals} />
      </div>
    </div>
  );
}

// ─── Admin View ───────────────────────────────────────────────────────────────

function AdminAffiliateView() {
  const [affiliates, setAffiliates] = useState<AffiliateWithStats[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [markingId, setMarkingId]   = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editId, setEditId]         = useState<string | null>(null);
  const [editCommission, setEditCommission] = useState("");
  const [editStatus, setEditStatus] = useState<"active" | "inactive">("active");
  const [showAdd, setShowAdd]       = useState(false);
  const [newEmail, setNewEmail]     = useState("");
  const [newUserId, setNewUserId]   = useState("");
  const [newCode, setNewCode]       = useState("");
  const [newCommission, setNewCommission] = useState("15");
  const [expanded, setExpanded]     = useState<string | null>(null);

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
      body: JSON.stringify({ email: newEmail, userId: newUserId, code: newCode || undefined, commissionPerSale: Number(newCommission) }),
    });
    setSaving(false);
    setShowAdd(false);
    setNewEmail(""); setNewUserId(""); setNewCode(""); setNewCommission("15");
    load();
  };

  const saveEdit = async (id: string) => {
    setSaving(true);
    await fetch(`/api/admin/affiliates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionPerSale: Number(editCommission), status: editStatus }),
    });
    setSaving(false);
    setEditId(null);
    load();
  };

  const markPaid = async (id: string) => {
    if (!confirm("Mark all pending referrals as paid?")) return;
    setMarkingId(id);
    const res = await fetch(`/api/admin/affiliates/${id}`, { method: "POST" });
    const json = await res.json();
    alert(json.message ?? `Marked ${json.marked} referrals as paid ($${json.amount})`);
    setMarkingId(null);
    load();
  };

  const deleteAffiliate = async (id: string) => {
    if (!confirm("Delete this affiliate profile? Their referral records remain.")) return;
    setDeletingId(id);
    await fetch(`/api/admin/affiliates/${id}`, { method: "DELETE" });
    setDeletingId(null);
    load();
  };

  return (
    <div style={{ padding: "32px 28px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "28px" }}>
        <div>
          <p style={{ fontSize: "10px", color: "#333", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "6px" }}>
            // AFFILIATE MANAGEMENT
          </p>
          <h1 style={{ fontSize: "26px", fontWeight: 700, letterSpacing: "-0.8px", color: "white", margin: 0 }}>
            Affiliates
          </h1>
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

      {/* Add affiliate modal */}
      {showAdd && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
        }}>
          <div style={{ ...CARD_STYLE, width: "420px", maxWidth: "calc(100vw - 32px)" }}>
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
              { label: "Commission per Sale ($)", value: newCommission, set: setNewCommission, placeholder: "15" },
            ].map(f => (
              <div key={f.label} style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "11px", color: "#444", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px" }}>
                  {f.label}
                </label>
                <input
                  value={f.value}
                  onChange={e => f.set(e.target.value)}
                  placeholder={f.placeholder}
                  style={{
                    width: "100%", padding: "9px 12px", borderRadius: "7px",
                    background: "#111", border: "1px solid #1e1e1e",
                    color: "white", fontSize: "13px", outline: "none", boxSizing: "border-box",
                  }}
                />
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

      {/* Affiliate list */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "60px" }}>
          <Loader2 style={{ width: "20px", height: "20px", color: "#333", animation: "spin 1s linear infinite" }} />
        </div>
      ) : affiliates.length === 0 ? (
        <div style={{ ...CARD_STYLE, textAlign: "center", padding: "60px", color: "#444", fontSize: "13px" }}>
          No affiliates yet. Add one to get started.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {affiliates.map(aff => (
            <div key={aff.id} style={CARD_STYLE}>
              {/* Main row */}
              <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                {/* Identity */}
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
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <code style={{ fontSize: "11px", color: GREEN, fontFamily: "monospace" }}>CODE: {aff.code}</code>
                    <span style={{ fontSize: "11px", color: "#333" }}>·</span>
                    <span style={{ fontSize: "11px", color: "#444" }}>${aff.commissionPerSale}/sale</span>
                  </div>
                </div>

                {/* Stats */}
                <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
                  {[
                    { label: "Total", value: `$${aff.totalEarnings}` },
                    { label: "Pending", value: `$${aff.pendingEarnings}` },
                    { label: "Referrals", value: String(aff.referralCount) },
                  ].map(s => (
                    <div key={s.label} style={{ textAlign: "center" }}>
                      <p style={{ fontSize: "16px", fontWeight: 700, color: "white", margin: 0 }}>{s.value}</p>
                      <p style={{ fontSize: "10px", color: "#333", textTransform: "uppercase", letterSpacing: "1px", margin: 0 }}>{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                  <button onClick={() => setExpanded(expanded === aff.id ? null : aff.id)} style={{
                    padding: "6px 12px", borderRadius: "6px", border: "1px solid #1e1e1e",
                    background: "transparent", fontSize: "11px", color: "#555", cursor: "pointer",
                  }}>
                    {expanded === aff.id ? "Hide" : "View Referrals"}
                  </button>
                  <button onClick={() => { setEditId(aff.id); setEditCommission(String(aff.commissionPerSale)); setEditStatus(aff.status); }} style={{
                    padding: "6px 10px", borderRadius: "6px", border: "1px solid #1e1e1e",
                    background: "transparent", cursor: "pointer", color: "#555",
                  }}>
                    <Edit2 style={{ width: "12px", height: "12px" }} />
                  </button>
                  <button onClick={() => markPaid(aff.id)} disabled={markingId === aff.id || aff.pendingEarnings === 0} style={{
                    padding: "6px 12px", borderRadius: "6px", border: "none",
                    background: aff.pendingEarnings > 0 ? GREEN : "#111",
                    fontSize: "11px", fontWeight: 600, color: aff.pendingEarnings > 0 ? "#000" : "#333",
                    cursor: aff.pendingEarnings > 0 ? "pointer" : "default", whiteSpace: "nowrap",
                  }}>
                    {markingId === aff.id ? "..." : "Mark Paid"}
                  </button>
                  <button onClick={() => deleteAffiliate(aff.id)} disabled={deletingId === aff.id} style={{
                    padding: "6px 10px", borderRadius: "6px", border: "1px solid rgba(239,68,68,0.2)",
                    background: "transparent", cursor: "pointer", color: "rgba(239,68,68,0.6)",
                  }}>
                    {deletingId === aff.id ? <Loader2 style={{ width: "12px", height: "12px", animation: "spin 1s linear infinite" }} /> : <Trash2 style={{ width: "12px", height: "12px" }} />}
                  </button>
                </div>
              </div>

              {/* Edit inline */}
              {editId === aff.id && (
                <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #161616", display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "10px", color: "#444", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px" }}>Commission ($)</label>
                    <input
                      type="number" value={editCommission} onChange={e => setEditCommission(e.target.value)}
                      style={{ padding: "7px 10px", borderRadius: "6px", background: "#111", border: "1px solid #1e1e1e", color: "white", fontSize: "13px", width: "100px", outline: "none" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "10px", color: "#444", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px" }}>Status</label>
                    <select
                      value={editStatus} onChange={e => setEditStatus(e.target.value as "active" | "inactive")}
                      style={{ padding: "7px 10px", borderRadius: "6px", background: "#111", border: "1px solid #1e1e1e", color: "white", fontSize: "13px", outline: "none" }}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                  <button onClick={() => saveEdit(aff.id)} disabled={saving} style={{
                    padding: "7px 16px", borderRadius: "6px", border: "none",
                    background: GREEN, color: "#000", fontWeight: 600, fontSize: "12px", cursor: "pointer",
                  }}>
                    {saving ? "Saving..." : "Save"}
                  </button>
                  <button onClick={() => setEditId(null)} style={{ padding: "7px 12px", borderRadius: "6px", border: "1px solid #1e1e1e", background: "transparent", color: "#555", fontSize: "12px", cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              )}

              {/* Expanded referrals */}
              {expanded === aff.id && (
                <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #161616" }}>
                  <p style={{ fontSize: "10px", color: "#333", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "12px" }}>
                    Referral History
                  </p>
                  <ReferralTable referrals={aff.referrals} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function AffiliateDashboard() {
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const isAdmin = email === ADMIN_EMAIL;

  if (!email) return null;
  return isAdmin ? <AdminAffiliateView /> : <AffiliateView />;
}
