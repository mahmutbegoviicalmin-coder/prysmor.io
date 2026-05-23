import { SignIn } from "@clerk/nextjs";
import Image from "next/image";

const hideHeader = {
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
    },
    cardBox: {
      boxShadow: "none",
    },
    footer: {
      background:   "transparent",
      border:       "none",
      borderTop:    "1px solid #1a1a1a",
      marginTop:    "8px",
      paddingTop:   "16px",
    },
  },
};

export default function SignInPage() {
  return (
    <div
      className="relative min-h-screen flex flex-col items-center justify-center px-4 overflow-hidden"
      style={{ background: "#060608" }}
    >
      {/* Grid background */}
      <div
        aria-hidden
        style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.028) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.028) 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse 80% 70% at 50% 40%, black 30%, transparent 100%)",
        }}
      />

      {/* Green glow top */}
      <div
        aria-hidden
        style={{
          position: "absolute", top: "-120px", left: "50%",
          transform: "translateX(-50%)",
          width: "600px", height: "400px",
          background: "radial-gradient(ellipse, rgba(57,255,106,0.09) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Green glow bottom */}
      <div
        aria-hidden
        style={{
          position: "absolute", bottom: "-80px", left: "50%",
          transform: "translateX(-50%)",
          width: "500px", height: "300px",
          background: "radial-gradient(ellipse, rgba(57,255,106,0.05) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Content */}
      <div className="relative z-10 w-full" style={{ maxWidth: "400px" }}>

        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div
            style={{
              width: "48px", height: "48px",
              background: "rgba(57,255,106,0.08)",
              border: "1px solid rgba(57,255,106,0.15)",
              borderRadius: "14px",
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: "20px",
            }}
          >
            <Image src="/logo/logo-icon.png" alt="Prysmor" width={28} height={28} style={{ objectFit: "contain" }} />
          </div>

          <h1 style={{
            fontSize: "26px", fontWeight: 700,
            color: "#ffffff", letterSpacing: "-0.8px",
            margin: "0 0 8px", textAlign: "center",
            fontFamily: "var(--font-outfit), system-ui, sans-serif",
          }}>
            Welcome back
          </h1>
          <p style={{
            fontSize: "14px", color: "#444", margin: 0,
            textAlign: "center", lineHeight: 1.5,
            fontFamily: "var(--font-outfit), system-ui, sans-serif",
          }}>
            Sign in to your Prysmor account
          </p>
        </div>

        {/* Clerk card wrapper */}
        <div
          style={{
            background: "rgba(12,12,12,0.85)",
            border: "1px solid #1c1c1c",
            borderRadius: "18px",
            padding: "28px",
            backdropFilter: "blur(12px)",
            boxShadow: "0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03) inset",
          }}
        >
          <SignIn forceRedirectUrl="/auth-redirect" appearance={hideHeader} />
        </div>

        {/* Trust row */}
        <div className="flex items-center justify-center gap-5 mt-7">
          {[
            "No credit card required",
            "Cancel anytime",
          ].map((t) => (
            <span key={t} style={{
              fontSize: "11px", color: "#2e2e2e",
              display: "flex", alignItems: "center", gap: "5px",
            }}>
              <span style={{ color: "rgba(57,255,106,0.35)", fontSize: "10px" }}>✓</span>
              {t}
            </span>
          ))}
        </div>

      </div>
    </div>
  );
}
