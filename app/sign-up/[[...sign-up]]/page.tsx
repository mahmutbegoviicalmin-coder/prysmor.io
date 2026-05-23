"use client";

import { SignUp } from "@clerk/nextjs";
import Image from "next/image";

const clerkAppearance = {
  elements: {
    header:         { display: "none" },
    headerTitle:    { display: "none" },
    headerSubtitle: { display: "none" },
    card: {
      background:   "transparent",
      border:       "none",
      boxShadow:    "none",
      borderRadius: "0",
      padding:      "0",
      width:        "100%",
    },
    cardBox:              { boxShadow: "none", width: "100%" },
    rootBox:              { width: "100%" },
    footer: {
      background: "transparent",
      border:     "none",
      borderTop:  "1px solid #1a1a1a",
      marginTop:  "8px",
      paddingTop: "16px",
    },
  },
};

const STEPS = [
  { n: "01", title: "Create your account",   desc: "Free — no credit card required"         },
  { n: "02", title: "Download the panel",    desc: "One-click installer for Windows & Mac"   },
  { n: "03", title: "Generate your first VFX", desc: "Type a prompt, hit generate — done"   },
];

export default function SignUpPage() {
  return (
    <div className="auth-root">
      {/* ── LEFT PANEL ─────────────────────────────────────────── */}
      <div className="auth-left">
        {/* Glow */}
        <div className="auth-glow" />

        {/* Logo */}
        <div className="auth-logo">
          <Image src="/logo/logo-icon.png" alt="Prysmor" width={26} height={26} style={{ objectFit: "contain" }} />
        </div>

        {/* Headline */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <p style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "3px", textTransform: "uppercase", color: "#39FF6A", marginBottom: "16px", opacity: 0.7 }}>
            Get started
          </p>
          <h1 style={{ fontSize: "clamp(28px, 3.5vw, 42px)", fontWeight: 800, color: "#fff", letterSpacing: "-1.5px", lineHeight: 1.1, margin: "0 0 14px" }}>
            AI VFX inside<br />Premiere Pro.
          </h1>
          <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.28)", lineHeight: 1.65, margin: "0 0 52px", maxWidth: "300px" }}>
            Replace backgrounds, relight scenes and add VFX — all from a text prompt. No After Effects needed.
          </p>

          {/* Steps */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {STEPS.map(({ n, title, desc }) => (
              <div key={n} style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
                <div style={{
                  width: "32px", height: "32px", borderRadius: "50%", flexShrink: 0,
                  background: "rgba(57,255,106,0.08)", border: "1px solid rgba(57,255,106,0.2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ fontSize: "10px", fontWeight: 700, color: "#39FF6A", fontFamily: "ui-monospace,monospace" }}>{n}</span>
                </div>
                <div>
                  <p style={{ fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.85)", margin: "0 0 3px", lineHeight: 1.3 }}>{title}</p>
                  <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.25)", margin: 0, lineHeight: 1.5 }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom badge */}
        <div style={{ marginTop: "auto", paddingTop: "40px" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            background: "rgba(57,255,106,0.06)", border: "1px solid rgba(57,255,106,0.12)",
            borderRadius: "8px", padding: "8px 14px",
          }}>
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#39FF6A", boxShadow: "0 0 6px #39FF6A" }} />
            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>1 free generation — no card needed</span>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL ────────────────────────────────────────── */}
      <div className="auth-right">
        {/* Mobile logo */}
        <div className="auth-mobile-header">
          <Image src="/logo/logo-icon.png" alt="Prysmor" width={22} height={22} style={{ objectFit: "contain" }} />
          <span style={{ fontSize: "13px", color: "#555" }}>prysmor.io</span>
        </div>

        <div style={{ width: "100%", maxWidth: "380px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, color: "#fff", letterSpacing: "-0.5px", margin: "0 0 6px" }}>
            Create account
          </h2>
          <p style={{ fontSize: "13px", color: "#444", margin: "0 0 28px", lineHeight: 1.5 }}>
            Join thousands of editors already using Prysmor.
          </p>

          <SignUp forceRedirectUrl="/auth-redirect" appearance={clerkAppearance} />
        </div>
      </div>

      <style>{`
        .auth-root {
          min-height: 100vh;
          display: flex;
          background: #070709;
          font-family: var(--font-outfit), system-ui, sans-serif;
        }
        .auth-left {
          position: relative;
          width: 42%;
          min-height: 100vh;
          padding: clamp(32px, 5vw, 60px) clamp(32px, 5vw, 60px);
          display: flex;
          flex-direction: column;
          background: #08090c;
          border-right: 1px solid #131318;
          overflow: hidden;
        }
        .auth-glow {
          position: absolute;
          top: -100px; left: -100px;
          width: 500px; height: 500px;
          background: radial-gradient(ellipse, rgba(57,255,106,0.10) 0%, transparent 65%);
          pointer-events: none;
        }
        .auth-logo {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 42px; height: 42px;
          background: rgba(57,255,106,0.08);
          border: 1px solid rgba(57,255,106,0.15);
          border-radius: 12px;
          margin-bottom: 48px;
          flex-shrink: 0;
        }
        .auth-right {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: clamp(32px, 5vw, 60px) clamp(24px, 4vw, 60px);
          overflow-y: auto;
        }
        .auth-mobile-header {
          display: none;
          align-items: center;
          gap: 8px;
          margin-bottom: 36px;
        }
        @media (max-width: 768px) {
          .auth-root { flex-direction: column; }
          .auth-left  { display: none; }
          .auth-right { min-height: 100vh; justify-content: flex-start; padding-top: 40px; }
          .auth-mobile-header { display: flex; }
        }
      `}</style>
    </div>
  );
}
