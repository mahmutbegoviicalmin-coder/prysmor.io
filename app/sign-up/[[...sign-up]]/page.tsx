"use client";

import { SignUp } from "@clerk/nextjs";
import Image from "next/image";
import { useSearchParams } from "next/navigation";

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
      outline:      "none",
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

const STEPS = [
  { n: "01", title: "Create your account",      desc: "Free. No credit card required."        },
  { n: "02", title: "Download the panel",        desc: "One-click installer, Windows & Mac."    },
  { n: "03", title: "Generate your first VFX",  desc: "Type a prompt, hit generate. Done."    },
];

export default function SignUpPage() {
  const searchParams = useSearchParams();
  const purchase = searchParams.get("purchase");
  const afterSignUp = purchase && /^[a-f0-9]{64}$/.test(purchase)
    ? `/auth-redirect?purchase=${encodeURIComponent(purchase)}`
    : "/auth-redirect";
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
        /* LEFT */
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
          margin-bottom: 16px;
        }
        .au-sub {
          font-size: 13px; color: rgba(255,255,255,0.22);
          line-height: 1.7; max-width: 290px;
          margin-bottom: 52px;
        }
        .au-steps { display: flex; flex-direction: column; gap: 22px; }
        .au-step  { display: flex; align-items: flex-start; gap: 14px; }
        .au-step-num {
          width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0;
          background: rgba(57,255,106,0.06);
          border: 1px solid rgba(57,255,106,0.18);
          display: flex; align-items: center; justify-content: center;
          font-size: 10px; font-weight: 700; color: rgba(57,255,106,0.7);
          font-family: ui-monospace, monospace;
        }
        .au-step-title { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.75); margin-bottom: 3px; line-height: 1.3; }
        .au-step-desc  { font-size: 12px; color: rgba(255,255,255,0.2); line-height: 1.5; }
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
        /* RESPONSIVE */
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
            <p className="au-eyebrow">Get started</p>
            <h1 className="au-h1">AI VFX inside<br />Premiere Pro.</h1>
            <p className="au-sub">Replace backgrounds, relight scenes and add VFX from a text prompt. Works in Premiere Pro and After Effects.</p>
            <div className="au-steps">
              {STEPS.map(({ n, title, desc }) => (
                <div key={n} className="au-step">
                  <div className="au-step-num">{n}</div>
                  <div>
                    <p className="au-step-title">{title}</p>
                    <p className="au-step-desc">{desc}</p>
                  </div>
                </div>
              ))}
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
            <h2 className="au-form-title">Create account</h2>
            <p className="au-form-sub">Join thousands of editors already using Prysmor.</p>
            <SignUp forceRedirectUrl={afterSignUp} appearance={appearance} />
          </div>
        </div>
      </div>
    </>
  );
}
