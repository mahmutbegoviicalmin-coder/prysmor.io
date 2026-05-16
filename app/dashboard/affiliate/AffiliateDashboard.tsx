"use client";

import { useEffect, useState, useCallback } from "react";
import { useUser } from "@clerk/nextjs";
import {
  Copy, Check, Users, DollarSign, Clock,
  Plus, Trash2, Edit2, RefreshCw, Loader2, X,
  CheckCircle, UserMinus,
} from "lucide-react";

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

// ─── Affiliate View (what brzotrcipuska7 sees) ────────────────────────────────

function AffiliateView() {
  const [data, setData]       = useState<{ affiliate: AffiliateProfile; stats: Stats } | null>(null);
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

  const { affiliate, stats } = data;
  const refLink = `https://prysmor.io/?ref=${affiliate.code}`;

  return (
    <div style={{ padding: "32px 28px", maxWidth: "860px" }}>
      <div style={{ marginBottom: "28px" }}>
        <p style={{ fontSize: "10px", color: "#333", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "6px" }}>// AFFILIATE</p>
        <h1 style={{ fontSize: "26px", fontWeight: 700, letterSpacing: "-0.8px", color: "white", margin: 0 }}>Your Referral Stats</h1>
        <p style={{ fontSize: "14px", color: "#555", marginTop: "6px" }}>
          You earn <span style={{ color: GREEN, fontWeight: 600 }}>{affiliate.commissionPercent}%</span> commission on each referred sale.
        </p>
      </div>

      {/* Referral link card */}
      <div style={{ ...CARD, marginBottom: "24px" }}>
        <p style={{ fontSize: "11px", color: "#444", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "12px" }}>Your Referral Link</p>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <code style={{
            flex: 1, minWidth: 0, padding: "10px 14px", borderRadius: "8px",
            background: "#111", border: "1px solid #1e1e1e",
            fontSize: "13px", color: "#888", fontFamily: "monospace",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{refLink}</code>
          <CopyBtn text={refLink} />
        </div>
        <p style={{ fontSize: "11px", color: "#333", marginTop: "10px" }}>
          Code: <span style={{ color: GREEN, fontWeight: 600, fontFamily: "monospace" }}>{affiliate.code}</span>
        </p>
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "14px", marginBottom: "24px" }}>
        <StatCard label="Total Earned"    value={`$${stats.totalEarnings}`}   icon={DollarSign} accent={GREEN} />
        <StatCard label="Pending Payout"  value={`$${stats.pendingEarnings}`} sub="Awaiting payment" icon={Clock} />
        <StatCard label="Paid Out"        value={`$${stats.paidEarnings}`}    icon={CheckCircle} />
        <StatCard label="Active Members"  value={String(stats.activeMembers)} icon={Users} />
        <StatCard label="Inactive"        value={String(stats.inactiveMembers)} icon={UserMinus} />
      </div>

      {/* Note from admin */}
      {affiliate.note && (
        <div style={{ ...CARD, borderColor: "rgba(57,255,106,0.1)" }}>
          <p style={{ fontSize: "11px", color: "#444", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "8px" }}>Note from Admin</p>
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
                    Edit — changes are visible to the affiliate immediately
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

                  <div style={{ display: "flex", gap: "8px" }}>
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
