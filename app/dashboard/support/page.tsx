"use client";

import { useUser } from "@clerk/nextjs";
import { useState } from "react";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

const ISSUE_TYPES = [
  "Plugin won't install",
  "Plugin crashes Premiere Pro",
  "Render failed or stuck",
  "Output quality issue",
  "Billing / payment problem",
  "License not activating",
  "Slow performance",
  "Other",
];

const ADOBE_VERSIONS = [
  "Premiere Pro 2025 (25.x)",
  "Premiere Pro 2024 (24.x)",
  "Premiere Pro 2023 (23.x)",
  "Premiere Pro 2022 (22.x)",
  "Premiere Pro 2021 (15.x)",
  "Other / Not sure",
];

const OS_VERSIONS = [
  "Windows 11",
  "Windows 10",
  "macOS 15 Sequoia",
  "macOS 14 Sonoma",
  "macOS 13 Ventura",
  "macOS 12 Monterey",
  "Other",
];

const PLUGIN_VERSIONS = [
  "Latest (auto-updated)",
  "1.x",
  "Not sure",
];

type Status = "idle" | "loading" | "success" | "error";

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#0D0D0F",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: "8px",
  padding: "10px 14px",
  fontSize: "13px",
  color: "#D1D5DB",
  outline: "none",
  fontFamily: "inherit",
  transition: "border-color 150ms",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
  appearance: "none",
  WebkitAppearance: "none",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 14px center",
  paddingRight: "36px",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "10px",
  fontWeight: 600,
  color: "#374151",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: "6px",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

export default function SupportPage() {
  const { user } = useUser();

  const [form, setForm] = useState({
    issueType: "",
    adobeVersion: "",
    osVersion: "",
    pluginVersion: "",
    description: "",
    email: user?.primaryEmailAddress?.emailAddress ?? "",
  });
  const [status, setStatus] = useState<Status>("idle");

  // Sync email once user loads
  if (user && !form.email) {
    setForm(f => ({ ...f, email: user.primaryEmailAddress?.emailAddress ?? "" }));
  }

  const set = (field: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm(f => ({ ...f, [field]: e.target.value }));

  const canSubmit =
    form.issueType && form.adobeVersion && form.osVersion && form.description.trim().length >= 20 && form.email;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-[600px]">
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          textAlign: "center", gap: "16px",
          padding: "60px 40px",
          background: "#111113",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: "16px",
        }}>
          <CheckCircle2 style={{ width: "44px", height: "44px", color: "#39FF6A" }} />
          <h2 style={{ fontSize: "20px", fontWeight: 600, color: "white", margin: 0 }}>
            Ticket submitted
          </h2>
          <p style={{ fontSize: "13px", color: "#6B7280", maxWidth: "340px", margin: 0, lineHeight: 1.65 }}>
            We&apos;ve received your report and will get back to you at{" "}
            <span style={{ color: "#D1D5DB" }}>{form.email}</span> within 24 hours.
          </p>
          <button
            onClick={() => { setStatus("idle"); setForm(f => ({ ...f, issueType: "", adobeVersion: "", osVersion: "", pluginVersion: "", description: "" })); }}
            style={{
              marginTop: "8px", padding: "9px 20px",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px", fontSize: "13px",
              color: "#9CA3AF", cursor: "pointer",
            }}
          >
            Submit another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-[680px]">
      {/* Header */}
      <div className="mb-8">
        <h1 style={{ fontSize: "28px", fontWeight: 600, color: "white", letterSpacing: "-0.5px", marginBottom: "6px" }}>
          Support
        </h1>
        <p style={{ fontSize: "14px", color: "#6B7280" }}>
          Report a bug or technical issue. We respond within 24 hours.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Section: Issue info */}
        <p style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.10em", color: "#374151", marginBottom: "12px" }}>
          Issue details
        </p>

        <div style={{ background: "#111113", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px", padding: "20px", marginBottom: "20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px" }}>

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
                value={form.description}
                onChange={set("description")}
                required
                minLength={20}
              />
            </Field>
          </div>
        </div>

        {/* Section: Environment */}
        <p style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.10em", color: "#374151", marginBottom: "12px" }}>
          Your environment
        </p>

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

        {/* Section: Contact */}
        <p style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.10em", color: "#374151", marginBottom: "12px" }}>
          Contact
        </p>

        <div style={{ background: "#111113", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px", padding: "20px", marginBottom: "28px" }}>
          <Field label="Reply-to email *">
            <input
              type="email"
              style={inputStyle}
              value={form.email}
              onChange={set("email")}
              required
              placeholder="your@email.com"
            />
          </Field>
          <p style={{ fontSize: "11px", color: "#374151", marginTop: "8px" }}>
            We&apos;ll reply to this address. Pre-filled from your account.
          </p>
        </div>

        {status === "error" && (
          <div style={{
            display: "flex", alignItems: "center", gap: "8px",
            padding: "12px 14px", borderRadius: "8px",
            background: "rgba(239,68,68,0.06)",
            border: "1px solid rgba(239,68,68,0.15)",
            marginBottom: "16px",
          }}>
            <AlertCircle style={{ width: "14px", height: "14px", color: "#EF4444", flexShrink: 0 }} />
            <span style={{ fontSize: "13px", color: "#FCA5A5" }}>Something went wrong. Please try again.</span>
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit || status === "loading"}
          style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            padding: "11px 28px",
            background: canSubmit ? "#39FF6A" : "#1a1a1a",
            border: "none",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: 600,
            color: canSubmit ? "#000" : "#333",
            cursor: canSubmit ? "pointer" : "not-allowed",
            transition: "background 150ms, color 150ms",
          }}
        >
          {status === "loading" && <Loader2 style={{ width: "14px", height: "14px", animation: "spin 0.7s linear infinite" }} />}
          {status === "loading" ? "Submitting..." : "Submit ticket"}
        </button>
      </form>

      <style>{`
        select option { background: #111113; color: #D1D5DB; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
