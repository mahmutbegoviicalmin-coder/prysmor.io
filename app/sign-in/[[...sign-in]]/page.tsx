"use client";

import { SignIn } from "@clerk/nextjs";
import Image from "next/image";

const appearance = {
  variables: {
    colorPrimary:         "#39FF6A",
    colorBackground:      "#111113",
    colorInputBackground: "#0e0e10",
    colorInputText:       "#ffffff",
    colorText:            "#ffffff",
    colorTextSecondary:   "#555",
    colorNeutral:         "#ffffff",
    colorDanger:          "#F87171",
    colorSuccess:         "#39FF6A",
    borderRadius:         "10px",
    fontFamily:           "var(--font-outfit), system-ui, sans-serif",
    fontSize:             "14px",
  },
  elements: {
    header:         { display: "none" },
    headerTitle:    { display: "none" },
    headerSubtitle: { display: "none" },
    card:    { background: "transparent", border: "none", boxShadow: "none", padding: "0", width: "100%" },
    cardBox: { boxShadow: "none", width: "100%" },
    rootBox: { width: "100%" },
    socialButtonsBlockButton: {
      background:   "#111113",
      border:       "1px solid #232328",
      color:        "#aaa",
      borderRadius: "10px",
      fontSize:     "13px",
      fontWeight:   "500",
      padding:      "11px 20px",
      transition:   "all 200ms",
    },
    socialButtonsBlockButtonText: { color: "#aaa", fontWeight: "500" },
    dividerLine: { background: "#1d1d22" },
    dividerText: { color: "#2d2d32", fontSize: "11px" },
    formFieldLabel: {
      color:         "#3a3a42",
      fontSize:      "11px",
      fontWeight:    "600",
      textTransform: "uppercase",
      letterSpacing: "0.08em",
    },
    formFieldInput: {
      background:   "#0e0e10",
      border:       "1px solid #232328",
      borderRadius: "10px",
      color:        "#fff",
      fontSize:     "14px",
      padding:      "11px 14px",
    },
    formFieldInputShowPasswordButton: { color: "#444" },
    formButtonPrimary: {
      background:    "linear-gradient(135deg, #44ff74 0%, #22c24a 100%)",
      color:         "#040e06",
      fontWeight:    "700",
      fontSize:      "13px",
      letterSpacing: "0.06em",
      borderRadius:  "10px",
      textTransform: "uppercase",
      padding:       "13px 20px",
      boxShadow:     "0 4px 20px rgba(57,255,106,0.25)",
    },
    footerActionLink:          { color: "#39FF6A" },
    identityPreviewEditButton: { color: "#39FF6A" },
    formResendCodeLink:        { color: "#39FF6A" },
    identityPreviewText:       { color: "#666" },
    badge:                     { display: "none" },
    footerPages:               { display: "none" },
    footer: {
      background:  "transparent",
      border:      "none",
      borderTop:   "1px solid #1a1a1f",
      marginTop:   "8px",
      paddingTop:  "16px",
    },
    footerActionText: { color: "#444", fontSize: "12px" },
  },
};

const FEATURES = [
  { label: "Background replacement without a green screen"   },
  { label: "Relight any scene with a single sentence"   },
  { label: "Fire, rain, smoke, object removal from text" },
];

export default function SignInPage() {
  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .au-root {
          min-height: 100vh;
          display: flex;
          background: #09090b;
          font-family: var(--font-outfit), system-ui, sans-serif;
        }
        .au-left {
          position: relative;
          width: 44%;
          flex-shrink: 0;
          min-height: 100vh;
          padding: 52px 52px;
          display: flex;
          flex-direction: column;
          background: #08080a;
          overflow: hidden;
        }
        .au-glow {
          position: absolute;
          top: -160px; left: -160px;
          width: 600px; height: 600px;
          background: radial-gradient(ellipse, rgba(57,255,106,0.08) 0%, transparent 65%);
          pointer-events: none;
        }
        .au-logo-wrap {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 40px; height: 40px;
          background: rgba(57,255,106,0.07);
          border: 1px solid rgba(57,255,106,0.14);
          border-radius: 11px;
          margin-bottom: 52px;
          flex-shrink: 0;
        }
        .au-eyebrow {
          font-size: 10px; font-weight: 700;
          letter-spacing: 0.2em; text-transform: uppercase;
          color: rgba(57,255,106,0.55);
          margin-bottom: 18px;
        }
        .au-h1 {
          font-size: clamp(26px, 3.2vw, 40px);
          font-weight: 800; color: #fff;
          letter-spacing: -1.2px; line-height: 1.1;
          margin-bottom: 10px;
        }
        .au-h1-green {
          font-size: clamp(20px, 2.6vw, 32px);
          font-weight: 800; color: #39FF6A;
          letter-spacing: -1px; line-height: 1.1;
          margin-bottom: 44px;
        }
        .au-features { display: flex; flex-direction: column; gap: 14px; margin-bottom: 52px; }
        .au-feat-row { display: flex; align-items: center; gap: 11px; }
        .au-feat-dot {
          width: 5px; height: 5px; border-radius: 50%;
          background: rgba(57,255,106,0.5); flex-shrink: 0;
        }
        .au-feat-text { font-size: 13px; color: rgba(255,255,255,0.3); line-height: 1.5; }
        .au-quote-card {
          background: rgba(255,255,255,0.02);
          border: 1px solid #181820;
          border-radius: 12px;
          padding: 18px 20px;
          margin-top: auto;
        }
        .au-quote-text {
          font-size: 12px; color: rgba(255,255,255,0.28);
          line-height: 1.65; font-style: italic; margin-bottom: 12px;
        }
        .au-quote-author { display: flex; align-items: center; gap: 9px; }
        .au-quote-avatar {
          width: 24px; height: 24px; border-radius: 50%;
          overflow: hidden; position: relative; flex-shrink: 0;
          background: #1a1a1a;
        }
        .au-quote-name { font-size: 11px; color: rgba(255,255,255,0.18); font-weight: 500; }
        /* RIGHT */
        .au-right {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 52px clamp(24px, 5vw, 80px);
          overflow-y: auto;
          min-height: 100vh;
        }
        .au-form-wrap { width: 100%; max-width: 360px; }
        .au-form-title {
          font-size: 22px; font-weight: 700; color: #fff;
          letter-spacing: -0.5px; margin-bottom: 6px;
        }
        .au-form-sub {
          font-size: 13px; color: #3a3a42; margin-bottom: 28px; line-height: 1.5;
        }
        .au-mobile-logo {
          display: none; align-items: center; gap: 8px; margin-bottom: 40px;
        }
        @media (max-width: 900px) {
          .au-left { width: 38%; padding: 40px 36px; }
          .au-right { padding: 40px 32px; }
        }
        @media (max-width: 700px) {
          .au-left  { display: none; }
          .au-right { justify-content: flex-start; padding-top: 44px; }
          .au-mobile-logo { display: flex; }
        }
      `}</style>

      <div className="au-root">
        {/* LEFT */}
        <div className="au-left">
          <div className="au-glow" />
          <div className="au-logo-wrap">
            <Image src="/logo/logo-icon.png" alt="Prysmor" width={24} height={24} style={{ objectFit: "contain" }} />
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <p className="au-eyebrow">Welcome back</p>
            <h1 className="au-h1">VFX that used to<br />take hours.</h1>
            <p className="au-h1-green">Now takes minutes.</p>
            <div className="au-features">
              {FEATURES.map(({ label }) => (
                <div key={label} className="au-feat-row">
                  <div className="au-feat-dot" />
                  <span className="au-feat-text">{label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="au-quote-card">
            <p className="au-quote-text">&ldquo;Cut my VFX workflow from 4 hours to 15 minutes. Nothing comes close.&rdquo;</p>
            <div className="au-quote-author">
              <div className="au-quote-avatar">
                <Image src="/chris-boustet.jpg" alt="" fill sizes="24px" style={{ objectFit: "cover" }} />
              </div>
              <span className="au-quote-name">Chris B., Freelance Editor</span>
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="au-right">
          <div className="au-mobile-logo">
            <Image src="/logo/logo-icon.png" alt="Prysmor" width={22} height={22} style={{ objectFit: "contain" }} />
            <span style={{ fontSize: "13px", color: "#444" }}>prysmor.io</span>
          </div>
          <div className="au-form-wrap">
            <h2 className="au-form-title">Sign in</h2>
            <p className="au-form-sub">Continue to your Prysmor dashboard.</p>
            <SignIn forceRedirectUrl="/auth-redirect" appearance={appearance} />
          </div>
        </div>
      </div>
    </>
  );
}
