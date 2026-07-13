"use client";

import { useEffect, useState, useRef } from "react";
import { Loader2, ArrowLeft, Send } from "lucide-react";
import Link from "next/link";

const ADMIN_EMAIL = "mahmutbegoviic.almin@gmail.com";

interface Ticket {
  id: string; issueType: string; status: string;
  email: string; adobeVersion: string; osVersion: string;
  description: string; screenshotUrl?: string; createdAt: string;
}

interface Message {
  id: string; body: string; authorType: "user"|"admin";
  authorName: string; createdAt: string;
}

const STATUS_OPTS = [
  { value: "open",        label: "Open",        color: "#60A5FA" },
  { value: "in_progress", label: "In Progress", color: "#FBBF24" },
  { value: "resolved",    label: "Resolved",    color: "#39FF6A" },
  { value: "closed",      label: "Closed",      color: "#6B7280" },
];

function statusStyle(s: string) {
  return STATUS_OPTS.find(o => o.value === s) ?? STATUS_OPTS[0];
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function AdminSupportPage() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        if (d?.userId) setUser({ id: d.userId, email: d.email || "" });
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoaded(true); });
    return () => { cancelled = true; };
  }, []);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Ticket|null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [reply, setReply] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isAdmin = isLoaded && user?.email === ADMIN_EMAIL;

  async function loadTickets() {
    const res = await fetch("/api/admin/support");
    if (res.ok) { const d = await res.json(); setTickets(d.tickets ?? []); }
    setLoading(false);
  }

  async function loadThread(ticket: Ticket) {
    setSelected(ticket);
    setNewStatus(ticket.status);
    setLoadingThread(true);
    const res = await fetch(`/api/admin/support/${ticket.id}`);
    if (res.ok) { const d = await res.json(); setMessages(d.messages ?? []); }
    setLoadingThread(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  useEffect(() => { loadTickets(); }, []);

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim() || !selected) return;
    setSending(true);
    await fetch(`/api/admin/support/${selected.id}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: reply, status: newStatus }),
    });
    setReply("");
    await loadThread({ ...selected, status: newStatus });
    await loadTickets();
    setSending(false);
  }

  async function handleStatusChange(ticketId: string, status: string) {
    await fetch(`/api/admin/support/${ticketId}/reply`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setNewStatus(status);
    if (selected?.id === ticketId) setSelected(s => s ? { ...s, status } : s);
    await loadTickets();
  }

  if (!isLoaded) return null;
  if (!isAdmin) {
    return (
      <div style={{ padding: "40px 24px" }}>
        <p style={{ color: "#EF4444", fontSize: "14px" }}>Access denied.</p>
        <Link href="/dashboard" style={{ color: "#39FF6A", fontSize: "13px" }}>← Back to Dashboard</Link>
      </div>
    );
  }

  const filtered = filter === "all" ? tickets : tickets.filter(t => t.status === filter);

  return (
    <div style={{ display: "flex", height: "calc(100vh - 58px)", overflow: "hidden" }}>
      {/* Ticket list panel */}
      <div style={{
        width: "340px", flexShrink: 0, borderRight: "1px solid #111",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "18px 16px 12px", borderBottom: "1px solid #111" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <h2 style={{ fontSize: "15px", fontWeight: 600, color: "white", margin: 0 }}>Support Tickets</h2>
            <Link href="/dashboard/admin" style={{ fontSize: "12px", color: "#555", textDecoration: "none", display: "flex", alignItems: "center", gap: "4px" }}>
              <ArrowLeft style={{ width: "11px", height: "11px" }} /> Admin
            </Link>
          </div>
          {/* Filter tabs */}
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
            {["all", "open", "in_progress", "resolved", "closed"].map(f => {
              const count = f === "all" ? tickets.length : tickets.filter(t => t.status === f).length;
              return (
                <button key={f} onClick={() => setFilter(f)}
                  style={{
                    padding: "3px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 500,
                    background: filter === f ? "#1a1a1a" : "transparent",
                    color: filter === f ? "white" : "#555",
                    border: filter === f ? "1px solid rgba(255,255,255,0.08)" : "1px solid transparent",
                    cursor: "pointer",
                  }}>
                  {f === "all" ? "All" : f.replace("_", " ")} {count > 0 && <span style={{ opacity: 0.5 }}>({count})</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
              <Loader2 style={{ width: "18px", height: "18px", color: "#39FF6A", animation: "spin 0.7s linear infinite" }} />
            </div>
          ) : filtered.length === 0 ? (
            <p style={{ textAlign: "center", color: "#374151", fontSize: "13px", padding: "40px 16px" }}>No tickets</p>
          ) : filtered.map(t => {
            const s = statusStyle(t.status);
            const isActive = selected?.id === t.id;
            return (
              <button key={t.id} onClick={() => loadThread(t)}
                style={{
                  width: "100%", textAlign: "left", padding: "14px 16px",
                  background: isActive ? "#111" : "transparent",
                  border: "none", borderBottom: "1px solid #0f0f0f",
                  cursor: "pointer", transition: "background 100ms",
                  borderLeft: isActive ? "2px solid #39FF6A" : "2px solid transparent",
                }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                  <span style={{ fontSize: "11px", color: "#555", fontFamily: "monospace" }}>#{t.id.slice(0, 6).toUpperCase()}</span>
                  <span style={{ fontSize: "10px", color: s.color, marginLeft: "auto" }}>{s.label}</span>
                </div>
                <p style={{ fontSize: "13px", color: "white", margin: "0 0 3px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.issueType}</p>
                <p style={{ fontSize: "11px", color: "#555", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.email}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Thread panel */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {!selected ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#2a2a2a", fontSize: "14px" }}>
            Select a ticket to view the conversation
          </div>
        ) : (
          <>
            {/* Ticket meta header */}
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #111", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <span style={{ fontSize: "11px", color: "#555", fontFamily: "monospace" }}>#{selected.id.slice(0, 6).toUpperCase()}</span>
                  <span style={{ fontSize: "12px", color: "white", fontWeight: 500 }}>{selected.issueType}</span>
                </div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {[selected.email, selected.adobeVersion, selected.osVersion].map(v => v && (
                    <span key={v} style={{ fontSize: "11px", color: "#555", background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "5px", padding: "2px 7px" }}>{v}</span>
                  ))}
                </div>
              </div>
              {/* Status selector */}
              <select
                value={newStatus}
                onChange={e => handleStatusChange(selected.id, e.target.value)}
                style={{
                  background: "#111", border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "8px", color: statusStyle(newStatus).color,
                  fontSize: "12px", fontWeight: 600, padding: "6px 10px", cursor: "pointer", outline: "none",
                }}
              >
                {STATUS_OPTS.map(o => <option key={o.value} value={o.value} style={{ color: "white" }}>{o.label}</option>)}
              </select>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: "12px" }}>
              {loadingThread ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
                  <Loader2 style={{ width: "18px", height: "18px", color: "#39FF6A", animation: "spin 0.7s linear infinite" }} />
                </div>
              ) : (
                <>
                  {/* Original description */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                    <div style={{ maxWidth: "80%", background: "#151515", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px 12px 12px 2px", padding: "14px 16px" }}>
                      <p style={{ fontSize: "11px", fontWeight: 600, color: "#60A5FA", textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 6px" }}>
                        {selected.email}
                      </p>
                      <p style={{ fontSize: "13px", color: "#D1D5DB", margin: 0, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{selected.description}</p>
                      {selected.screenshotUrl && (
                        <div style={{ marginTop: "10px" }}>
                          <a href={selected.screenshotUrl} target="_blank" rel="noopener noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={selected.screenshotUrl}
                              alt="Screenshot"
                              style={{
                                maxWidth: "100%", maxHeight: "300px",
                                objectFit: "contain", borderRadius: "8px",
                                border: "1px solid rgba(255,255,255,0.08)",
                                display: "block", cursor: "zoom-in",
                              }}
                            />
                          </a>
                          <p style={{ fontSize: "10px", color: "#374151", marginTop: "4px" }}>Click to open full size</p>
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: "10px", color: "#374151", marginTop: "4px" }}>User · {formatTime(selected.createdAt)}</span>
                  </div>

                  {messages.map(msg => {
                    const isAdm = msg.authorType === "admin";
                    return (
                      <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: isAdm ? "flex-end" : "flex-start" }}>
                        <div style={{
                          maxWidth: "80%",
                          background: isAdm ? "rgba(57,255,106,0.07)" : "#151515",
                          border: isAdm ? "1px solid rgba(57,255,106,0.15)" : "1px solid rgba(255,255,255,0.07)",
                          borderRadius: isAdm ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                          padding: "14px 16px",
                        }}>
                          <p style={{ fontSize: "13px", color: "#D1D5DB", margin: 0, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{msg.body}</p>
                        </div>
                        <span style={{ fontSize: "10px", color: "#374151", marginTop: "4px" }}>
                          {isAdm ? "You (Support)" : msg.authorName} · {formatTime(msg.createdAt)}
                        </span>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </>
              )}
            </div>

            {/* Reply */}
            <form onSubmit={handleReply} style={{ borderTop: "1px solid #111", padding: "14px 24px", background: "#080808" }}>
              <textarea
                value={reply}
                onChange={e => setReply(e.target.value)}
                placeholder="Write a reply to the user..."
                style={{
                  width: "100%", background: "#111", border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: "8px", padding: "10px 14px", fontSize: "13px", color: "#D1D5DB",
                  resize: "none", minHeight: "80px", fontFamily: "inherit",
                  outline: "none", lineHeight: 1.7, marginBottom: "10px",
                }}
              />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "11px", color: "#374151" }}>
                  Reply will be sent via email to {selected.email}
                </span>
                <button type="submit" disabled={!reply.trim() || sending}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "6px",
                    padding: "8px 18px", background: reply.trim() ? "#39FF6A" : "#1a1a1a",
                    border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 600,
                    color: reply.trim() ? "#000" : "#333",
                    cursor: reply.trim() ? "pointer" : "not-allowed",
                  }}>
                  {sending ? <Loader2 style={{ width: "13px", height: "13px", animation: "spin 0.7s linear infinite" }} /> : <Send style={{ width: "13px", height: "13px" }} />}
                  {sending ? "Sending..." : "Send reply"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
