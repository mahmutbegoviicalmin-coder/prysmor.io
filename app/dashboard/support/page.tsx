"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  CheckCircle2, AlertCircle, Loader2, ImagePlus, X,
  ChevronRight, Clock, MessageCircle,
} from "lucide-react";

/* ─────────────────────────── constants ───────────────────────────── */
const ISSUE_TYPES = [
  "Plugin won't install", "Plugin crashes Premiere Pro", "Render failed or stuck",
  "Output quality issue", "Billing / payment problem", "License not activating",
  "Slow performance", "Other",
];
const ADOBE_VERSIONS = [
  "Premiere Pro 2025 (25.x)", "Premiere Pro 2024 (24.x)", "Premiere Pro 2023 (23.x)",
  "Premiere Pro 2022 (22.x)", "Premiere Pro 2021 (15.x)", "Other / Not sure",
];
const OS_VERSIONS = [
  "Windows 11", "Windows 10",
  "macOS 15 Sequoia", "macOS 14 Sonoma", "macOS 13 Ventura", "macOS 12 Monterey", "Other",
];
const PLUGIN_VERSIONS = ["Latest (auto-updated)", "1.x", "Not sure"];

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  open:        { label: "Open",        color: "#60A5FA", bg: "rgba(96,165,250,0.1)"  },
  in_progress: { label: "In Progress", color: "#FBBF24", bg: "rgba(251,191,36,0.1)"  },
  resolved:    { label: "Resolved",    color: "#39FF6A", bg: "rgba(57,255,106,0.1)"  },
  closed:      { label: "Closed",      color: "#6B7280", bg: "rgba(107,114,128,0.1)" },
};

/* ─────────────────────────── styles ──────────────────────────────── */
const inputStyle: React.CSSProperties = {
  width: "100%", background: "#0D0D0F",
  border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px",
  padding: "10px 14px", fontSize: "13px", color: "#D1D5DB",
  outline: "none", fontFamily: "inherit", transition: "border-color 150ms",
};
const selectStyle: React.CSSProperties = {
  ...inputStyle, cursor: "pointer",
  appearance: "none", WebkitAppearance: "none",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat", backgroundPosition: "right 14px center", paddingRight: "36px",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "10px", fontWeight: 600, color: "#374151",
  textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={labelStyle}>{label}</label>{children}</div>;
}

/* ─────────────────────────── ticket list ─────────────────────────── */
interface Ticket {
  id: string; issueType: string; status: string;
  createdAt: string; lastMessageAt?: string; email: string;
}

function TicketList() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/support/tickets")
      .then(r => r.json())
      .then(d => { setTickets(d.tickets ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
        <Loader2 style={{ width: "20px", height: "20px", color: "#39FF6A", animation: "spin 0.7s linear infinite" }} />
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div style={{
        textAlign: "center", padding: "60px 24px",
        background: "#111113", border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: "12px",
      }}>
        <MessageCircle style={{ width: "32px", height: "32px", color: "#2a2a2a", margin: "0 auto 12px" }} />
        <p style={{ fontSize: "14px", color: "#555", margin: 0 }}>No tickets yet</p>
        <p style={{ fontSize: "12px", color: "#333", margin: "6px 0 0" }}>Your support tickets will appear here.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {tickets.map(t => {
        const s = STATUS_STYLES[t.status] ?? STATUS_STYLES.open;
        const date = new Date(t.lastMessageAt ?? t.createdAt).toLocaleDateString("en-US", {
          month: "short", day: "numeric", year: "numeric",
        });
        return (
          <Link
            key={t.id}
            href={`/dashboard/support/${t.id}`}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: "16px", padding: "16px 18px",
              background: "#111113", border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: "10px", textDecoration: "none",
              transition: "border-color 150ms, background 150ms",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.12)";
              (e.currentTarget as HTMLElement).style.background = "#161618";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.07)";
              (e.currentTarget as HTMLElement).style.background = "#111113";
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <span style={{
                  display: "inline-block", padding: "2px 8px",
                  background: s.bg, color: s.color,
                  borderRadius: "100px", fontSize: "10px", fontWeight: 600,
                  whiteSpace: "nowrap",
                }}>{s.label}</span>
                <span style={{ fontSize: "10px", color: "#374151", fontFamily: "monospace" }}>
                  #{t.id.slice(0, 6).toUpperCase()}
                </span>
              </div>
              <p style={{ fontSize: "13px", color: "#D1D5DB", fontWeight: 500, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.issueType}
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <Clock style={{ width: "10px", height: "10px", color: "#374151" }} />
                <span style={{ fontSize: "11px", color: "#374151" }}>{date}</span>
              </div>
              <ChevronRight style={{ width: "14px", height: "14px", color: "#374151" }} />
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/* ─────────────────────────── new ticket form ─────────────────────── */
function NewTicketForm({ onSuccess }: { onSuccess: () => void }) {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.userId) return;
        setUser({ id: d.userId, email: d.email || "" });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    issueType: "", adobeVersion: "", osVersion: "",
    pluginVersion: "", description: "", email: "",
  });
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<"idle"|"uploading"|"done"|"error">("idle");
  const [status, setStatus] = useState<"idle"|"loading"|"error">("idle");

  if (user && !form.email) {
    setForm(f => ({ ...f, email: user?.email ?? "" }));
  }

  const set = (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }));

  async function compressImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const MAX = 1024;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
          else { width = Math.round((width * MAX) / height); height = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("no canvas ctx")); return; }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.onerror = reject;
      img.src = objectUrl;
    });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadStatus("uploading");
    try {
      const imageBase64 = await compressImage(file);
      setScreenshotPreview(imageBase64);
      const res = await fetch("/api/support/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64 }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || errData.error || "Upload failed");
      }
      const { url } = await res.json();
      setScreenshotUrl(url);
      setUploadStatus("done");
    } catch (err) {
      console.error("[upload] error:", err);
      setUploadStatus("error");
    }
  }

  function removeScreenshot() {
    setScreenshotUrl(null); setScreenshotPreview(null); setUploadStatus("idle");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const canSubmit = form.issueType && form.adobeVersion && form.osVersion &&
    form.description.trim().length >= 20 && form.email && uploadStatus !== "uploading";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, screenshotUrl }),
      });
      if (!res.ok) throw new Error();
      onSuccess();
    } catch {
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <p style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.10em", color: "#374151", marginBottom: "12px" }}>
        Issue details
      </p>
      <div style={{ background: "#111113", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px", padding: "20px", marginBottom: "20px" }}>
        <div style={{ display: "grid", gap: "16px" }}>
          <Field label="Issue type *">
            <select style={selectStyle} value={form.issueType} onChange={set("issueType")} required>
              <option value="" disabled>Select issue type...</option>
              {ISSUE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Description * (min. 20 characters)">
            <textarea
              style={{ ...inputStyle, minHeight: "110px", resize: "vertical" }}
              placeholder="Describe what happened, what you expected, and any error messages you saw..."
              value={form.description} onChange={set("description")} required minLength={20}
            />
          </Field>
          <Field label="Screenshot (optional)">
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: "none" }} onChange={handleFileChange} />
            {!screenshotPreview ? (
              <button type="button" onClick={() => fileInputRef.current?.click()}
                style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", padding: "14px", background: "#0D0D0F", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: "8px", color: "#555", fontSize: "13px", cursor: "pointer" }}>
                <ImagePlus style={{ width: "16px", height: "16px", flexShrink: 0 }} />
                Click to upload a screenshot (max 8 MB)
              </button>
            ) : (
              <div style={{ position: "relative" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={screenshotPreview} alt="Preview" style={{ width: "100%", maxHeight: "220px", objectFit: "cover", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.07)", display: "block" }} />
                {uploadStatus === "uploading" && (
                  <div style={{ position: "absolute", inset: 0, borderRadius: "8px", background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontSize: "12px", color: "white" }}>
                    <Loader2 style={{ width: "16px", height: "16px", animation: "spin 0.7s linear infinite" }} /> Uploading...
                  </div>
                )}
                {uploadStatus === "done" && (
                  <div style={{ position: "absolute", top: "8px", left: "8px", display: "flex", alignItems: "center", gap: "5px", background: "rgba(57,255,106,0.15)", border: "1px solid rgba(57,255,106,0.3)", borderRadius: "6px", padding: "4px 8px", fontSize: "11px", color: "#39FF6A", fontWeight: 600 }}>
                    <CheckCircle2 style={{ width: "11px", height: "11px" }} /> Uploaded
                  </div>
                )}
                {uploadStatus === "error" && (
                  <div style={{ position: "absolute", top: "8px", left: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "4px", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "6px", padding: "4px 8px", fontSize: "11px", color: "#EF4444", fontWeight: 600 }}>
                      Upload failed
                    </span>
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      style={{ background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", padding: "4px 8px", fontSize: "11px", color: "white", cursor: "pointer" }}>
                      Retry
                    </button>
                  </div>
                )}
                <button type="button" onClick={removeScreenshot}
                  style={{ position: "absolute", top: "8px", right: "8px", width: "28px", height: "28px", borderRadius: "50%", background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,255,255,0.15)", color: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <X style={{ width: "13px", height: "13px" }} />
                </button>
              </div>
            )}
          </Field>
        </div>
      </div>

      <p style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.10em", color: "#374151", marginBottom: "12px" }}>Your environment</p>
      <div style={{ background: "#111113", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px", padding: "20px", marginBottom: "20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <Field label="Adobe Premiere Pro version *">
            <select style={selectStyle} value={form.adobeVersion} onChange={set("adobeVersion")} required>
              <option value="" disabled>Select version...</option>
              {ADOBE_VERSIONS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Operating system *">
            <select style={selectStyle} value={form.osVersion} onChange={set("osVersion")} required>
              <option value="" disabled>Select OS...</option>
              {OS_VERSIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Prysmor plugin version">
            <select style={selectStyle} value={form.pluginVersion} onChange={set("pluginVersion")}>
              <option value="">Not sure</option>
              {PLUGIN_VERSIONS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>
        </div>
      </div>

      <p style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.10em", color: "#374151", marginBottom: "12px" }}>Contact</p>
      <div style={{ background: "#111113", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px", padding: "20px", marginBottom: "28px" }}>
        <Field label="Reply-to email *">
          <input type="email" style={inputStyle} value={form.email} onChange={set("email")} required placeholder="your@email.com" />
        </Field>
        <p style={{ fontSize: "11px", color: "#374151", marginTop: "8px" }}>Pre-filled from your account.</p>
      </div>

      {status === "error" && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 14px", borderRadius: "8px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", marginBottom: "16px" }}>
          <AlertCircle style={{ width: "14px", height: "14px", color: "#EF4444", flexShrink: 0 }} />
          <span style={{ fontSize: "13px", color: "#FCA5A5" }}>Something went wrong. Please try again.</span>
        </div>
      )}

      <button type="submit" disabled={!canSubmit || status === "loading"}
        style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "11px 28px", background: canSubmit ? "#39FF6A" : "#1a1a1a", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 600, color: canSubmit ? "#000" : "#333", cursor: canSubmit ? "pointer" : "not-allowed", transition: "background 150ms" }}>
        {status === "loading" && <Loader2 style={{ width: "14px", height: "14px", animation: "spin 0.7s linear infinite" }} />}
        {status === "loading" ? "Submitting..." : "Submit ticket"}
      </button>
    </form>
  );
}

/* ─────────────────────────── page ───────────────────────────────── */
export default function SupportPage() {
  const [tab, setTab] = useState<"new"|"tickets">("new");
  const [showSuccess, setShowSuccess] = useState(false);
  const [ticketsKey, setTicketsKey] = useState(0);

  function handleSuccess() {
    setShowSuccess(true);
    setTab("tickets");
    setTicketsKey(k => k + 1);
    setTimeout(() => setShowSuccess(false), 5000);
  }

  const tabBtn = (id: "new"|"tickets", label: string) => (
    <button
      onClick={() => setTab(id)}
      style={{
        padding: "8px 18px", borderRadius: "8px", fontSize: "13px", fontWeight: 500,
        background: tab === id ? "#1a1a1a" : "transparent",
        color: tab === id ? "white" : "#555",
        border: tab === id ? "1px solid rgba(255,255,255,0.08)" : "1px solid transparent",
        cursor: "pointer", transition: "all 150ms",
      }}
    >{label}</button>
  );

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-[680px]">
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "28px", fontWeight: 600, color: "white", letterSpacing: "-0.5px", marginBottom: "6px" }}>Support</h1>
        <p style={{ fontSize: "14px", color: "#6B7280" }}>Report bugs, track your tickets, and get replies here.</p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "24px", background: "#0d0d0d", padding: "4px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.06)", width: "fit-content" }}>
        {tabBtn("new", "New Ticket")}
        {tabBtn("tickets", "My Tickets")}
      </div>

      {/* Success banner */}
      {showSuccess && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px", background: "rgba(57,255,106,0.06)", border: "1px solid rgba(57,255,106,0.2)", borderRadius: "10px", marginBottom: "20px" }}>
          <CheckCircle2 style={{ width: "15px", height: "15px", color: "#39FF6A", flexShrink: 0 }} />
          <span style={{ fontSize: "13px", color: "#39FF6A" }}>Ticket submitted! We&apos;ll respond within 24 hours.</span>
        </div>
      )}

      {tab === "new" && <NewTicketForm onSuccess={handleSuccess} />}
      {tab === "tickets" && <TicketList key={ticketsKey} />}

      <style>{`
        select option { background: #111113; color: #D1D5DB; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
