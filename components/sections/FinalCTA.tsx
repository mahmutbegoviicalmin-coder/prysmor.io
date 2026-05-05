"use client";

import { motion } from "framer-motion";

interface FinalCTAProps {
  title?: string;
  subtitle?: string;
  primaryLabel?: string;
  primaryHref?: string;
  onPrimaryClick?: () => void;
}

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];
const GREEN = "#39FF6A";

export default function FinalCTA({
  primaryLabel = "Get Started",
  onPrimaryClick,
}: FinalCTAProps) {
  return (
    <section
      style={{
        position: "relative",
        overflow: "hidden",
        padding: "120px 40px",
        borderTop: "1px solid #0f0f0f",
        background: [
          "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(57,255,106,0.08) 0%, rgba(57,255,106,0.02) 40%, transparent 70%)",
          "#080808",
        ].join(", "),
        textAlign: "center",
      }}
    >
      {/* Grid lines */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: [
            "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px)",
            "linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
          ].join(", "),
          backgroundSize: "80px 80px",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* Edge fade */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: [
            "linear-gradient(to right, #080808 0%, transparent 20%, transparent 80%, #080808 100%)",
            "linear-gradient(to bottom, #080808 0%, transparent 20%, transparent 80%, #080808 100%)",
          ].join(", "),
          pointerEvents: "none",
          zIndex: 1,
        }}
      />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 10 }}>
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease }}
          className="flex flex-col items-center"
        >
          <h2
            style={{
              fontSize: "clamp(40px, 5.5vw, 72px)",
              fontWeight: 800,
              letterSpacing: "-2.5px",
              lineHeight: 1.05,
              textAlign: "center",
              margin: 0,
            }}
          >
            <span style={{ color: "white", display: "block" }}>
              Stop hiring VFX artists.
            </span>
            <span style={{ color: GREEN, display: "block" }}>
              Start typing.
            </span>
          </h2>

          {onPrimaryClick ? (
            <button
              onClick={onPrimaryClick}
              style={{
                background: GREEN,
                color: "#000",
                borderRadius: "8px",
                padding: "14px 36px",
                fontSize: "15px",
                fontWeight: 700,
                border: "none",
                cursor: "pointer",
                marginTop: "36px",
                boxShadow: "0 0 40px rgba(57,255,106,0.25)",
                transition: "box-shadow 200ms, transform 200ms",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.boxShadow = "0 0 60px rgba(57,255,106,0.4)";
                el.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.boxShadow = "0 0 40px rgba(57,255,106,0.25)";
                el.style.transform = "translateY(0)";
              }}
            >
              {primaryLabel} →
            </button>
          ) : null}

          <p style={{
            fontSize: "12px",
            color: "#2a2a2a",
            marginTop: "14px",
            fontWeight: 300,
          }}>
            7-day money-back guarantee · Cancel anytime
          </p>
        </motion.div>
      </div>
    </section>
  );
}
