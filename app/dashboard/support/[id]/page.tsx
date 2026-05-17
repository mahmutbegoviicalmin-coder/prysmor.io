"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Send, Image as ImageIcon } from "lucide-react";

interface Message {
  id: string;
  body: string;
  authorType: "user" | "admin";
  authorName: string;
  createdAt: string;
}

interface Ticket {
  id: string;
  issueType: string;
  description: string;
  adobeVersion: string;
  osVersion: string;
  pluginVersion: string;
  status: string;
  createdAt: string;
  email: string;
  screenshotUrl?: string;
}

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  open:        { label: "Open",        color: "#60A5FA", bg: "rgba(96,165,250,0.1)"  },
  in_progress: { label: "In Progress", color: "#FBBF24", bg: "rgba(251,191,36,0.1)"  },
  resolved:    { label: "Resolved",    color: "#39FF6A", bg: "rgba(57,255,106,0.1)"  },
  closed:      { label: "Closed",      color: "#6B7280", bg: "rgba(107,114,128,0.1)" },
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function TicketThreadPage({ params }: { params: { id: string } }) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  async function load() {
    const res = await fetch(`/api/support/tickets/${params.id}`);
    if (!res.ok) { setLoading(false); return; }
    const { ticket, messages } = await res.json();
    setTicket(ticket);
    setMessages(messages);
    setLoading(false);
  }

  useEffect(() => { load(); }, [params.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim() || sending) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/support/tickets/${params.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: reply }),
      });
      if (!res.ok) throw new Error();
      setReply("");
      await load();
    } catch {
      setError("Failed to send. Try again.");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}>
        <Loader2 style={{ width: "20px", height: "20px", color: "#39FF6A", animation: "spin 0.7s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div style={{ padding: "40px 24px" }}>
        <p style={{ color: "#6B7280", fontSize: "14px" }}>Ticket not found.</p>
        <Link href="/dashboard/support" style={{ color: "#39FF6A", fontSize: "13px" }}>← Back to Support</Link>
      </div>
    );
  }

  const statusStyle = STATUS_STYLES[ticket.status] ?? STATUS_STYLES.open;

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10" style={{ maxWidth: "720px" }}>
      {/* Back */}
      <Link href="/dashboard/support"
        style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#555", textDecoration: "none", marginBottom: "24px" }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#888"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#555"; }}
      >
        <ArrowLeft style={{ width: "13px", height: "13px" }} />
        Back to Support
      </Link>

      {/* Ticket header */}
      <div style={{ background: "#111113", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px", padding: "20px 24px", marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <span style={{
                display: "inline-block", padding: "3px 10px",
                background: statusStyle.bg, color: statusStyle.color,
                borderRadius: "100px", fontSize: "10px", fontWeight: 600,
              }}>{statusStyle.label}</span>
              <span style={{ fontSize: "11px", color: "#374151", fontFamily: "monospace" }}>
                #{ticket.id.slice(0, 6).toUpperCase()}
              </span>
            </div>
            <h1 style={{ fontSize: "18px", fontWeight: 600, color: "white", margin: "0 0 4px", letterSpacing: "-0.3px" }}>
              {ticket.issueType}
            </h1>
            <p style={{ fontSize: "11px", color: "#374151", margin: 0 }}>
              Opened {formatTime(ticket.createdAt)}
            </p>
          </div>
        </div>

        {/* Environment tags */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "14px" }}>
          {[ticket.adobeVersion, ticket.osVersion, ticket.pluginVersion].filter(Boolean).map(v => (
            <span key={v} style={{ fontSize: "11px", color: "#555", background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "6px", padding: "3px 8px" }}>
              {v}
            </span>
          ))}
        </div>
      </div>

      {/* Messages thread */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>

        {/* Original description as first message */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <div style={{
            maxWidth: "85%", background: "rgba(57,255,106,0.07)",
            border: "1px solid rgba(57,255,106,0.15)", borderRadius: "12px 12px 2px 12px",
            padding: "14px 16px",
          }}>
            <p style={{ fontSize: "13px", color: "#D1D5DB", margin: "0 0 8px", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
              {ticket.description}
            </p>
            {ticket.screenshotUrl && (
              <a href={ticket.screenshotUrl} target="_blank" rel="noopener noreferrer">
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#39FF6A" }}>
                  <ImageIcon style={{ width: "12px", height: "12px" }} />
                  View screenshot
                </div>
              </a>
            )}
          </div>
          <span style={{ fontSize: "10px", color: "#374151", marginTop: "4px" }}>
            You · {formatTime(ticket.createdAt)}
          </span>
        </div>

        {/* Thread messages */}
        {messages.map(msg => {
          const isAdmin = msg.authorType === "admin";
          return (
            <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: isAdmin ? "flex-start" : "flex-end" }}>
              <div style={{
                maxWidth: "85%",
                background: isAdmin ? "#151515" : "rgba(57,255,106,0.07)",
                border: isAdmin ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(57,255,106,0.15)",
                borderRadius: isAdmin ? "12px 12px 12px 2px" : "12px 12px 2px 12px",
                padding: "14px 16px",
              }}>
                {isAdmin && (
                  <p style={{ fontSize: "10px", fontWeight: 600, color: "#39FF6A", textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 6px" }}>
                    Prysmor Support
                  </p>
                )}
                <p style={{ fontSize: "13px", color: "#D1D5DB", margin: 0, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                  {msg.body}
                </p>
              </div>
              <span style={{ fontSize: "10px", color: "#374151", marginTop: "4px" }}>
                {isAdmin ? "Support" : "You"} · {formatTime(msg.createdAt)}
              </span>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      {/* Reply box */}
      {ticket.status !== "closed" ? (
        <form onSubmit={handleReply} style={{ background: "#111113", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px", padding: "16px" }}>
          <textarea
            value={reply}
            onChange={e => setReply(e.target.value)}
            placeholder="Write a reply..."
            style={{
              width: "100%", background: "transparent", border: "none", outline: "none",
              fontSize: "13px", color: "#D1D5DB", resize: "none", minHeight: "80px",
              fontFamily: "inherit", lineHeight: 1.7,
            }}
          />
          {error && <p style={{ fontSize: "12px", color: "#EF4444", margin: "0 0 8px" }}>{error}</p>}
          <div style={{ display: "flex", justifyContent: "flex-end", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "12px", marginTop: "8px" }}>
            <button
              type="submit"
              disabled={!reply.trim() || sending}
              style={{
                display: "inline-flex", alignItems: "center", gap: "6px",
                padding: "8px 18px",
                background: reply.trim() ? "#39FF6A" : "#1a1a1a",
                border: "none", borderRadius: "8px",
                fontSize: "13px", fontWeight: 600,
                color: reply.trim() ? "#000" : "#333",
                cursor: reply.trim() ? "pointer" : "not-allowed",
                transition: "background 150ms",
              }}
            >
              {sending ? <Loader2 style={{ width: "13px", height: "13px", animation: "spin 0.7s linear infinite" }} /> : <Send style={{ width: "13px", height: "13px" }} />}
              {sending ? "Sending..." : "Send reply"}
            </button>
          </div>
        </form>
      ) : (
        <div style={{ textAlign: "center", padding: "20px", background: "#111113", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px", fontSize: "13px", color: "#555" }}>
          This ticket is closed. Open a new ticket if you need further help.
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
