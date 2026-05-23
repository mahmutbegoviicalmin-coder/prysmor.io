"use client";

import { SignIn } from "@clerk/nextjs";
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
    cardBox:  { boxShadow: "none", width: "100%" },
    rootBox:  { width: "100%" },
    footer: {
      background: "transparent",
      border:     "none",
      borderTop:  "1px solid #1a1a1a",
      marginTop:  "8px",
      paddingTop: "16px",
    },
  },
};

const FEATURES = [
  { icon: "⚡", label: "Generate in minutes, not hours" },
  { icon: "🎬", label: "Works inside Adobe Premiere Pro" },
  { icon: "✦",  label: "Background, Relight, VFX modes" },
];

export default function SignInPage() {
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
            Welcome back
          </p>
          <h1 style={{ fontSize: "clamp(28px, 3.5vw, 42px)", fontWeight: 800, color: "#fff", letterSpacing: "-1.5px", lineHeight: 1.1, margin: "0 0 14px" }}>
            VFX that used to<br />take hours.
          </h1>
          <p style={{ fontSize: "clamp(22px, 2.8vw, 34px)", fontWeight: 800, color: "#39FF6A", letterSpacing: "-1px", lineHeight: 1.1, margin: "0 0 48px" }}>
            Now takes minutes.
          </p>

          {/* Features */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {FEATURES.map(({ icon, label }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{
                  width: "32px", height: "32px", borderRadius: "8px", flexShrink: 0,
                  background: "rgba(57,255,106,0.07)", border: "1px solid rgba(57,255,106,0.15)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "14px",
                }}>
                  {icon}
                </div>
                <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom quote */}
        <div style={{ marginTop: "auto", paddingTop: "40px" }}>
          <div style={{
            background: "rgba(255,255,255,0.02)", border: "1px solid #1a1a1a",
            borderRadius: "10px", padding: "16px 18px",
          }}>
            <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)", lineHeight: 1.6, margin: "0 0 10px", fontStyle: "italic" }}>
              &ldquo;Cut my VFX workflow from 4 hours to 15 minutes.&rdquo;
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: "#1a1a1a", overflow: "hidden", position: "relative" }}>
                <Image src="/chris-boustet.jpg" alt="" fill sizes="22px" style={{ objectFit: "cover" }} />
              </div>
              <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.2)", fontWeight: 500 }}>Chris B. — Freelance Editor</span>
            </div>
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
            Sign in
          </h2>
          <p style={{ fontSize: "13px", color: "#444", margin: "0 0 28px", lineHeight: 1.5 }}>
            Continue to your Prysmor dashboard.
          </p>

          <SignIn forceRedirectUrl="/auth-redirect" appearance={clerkAppearance} />
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
