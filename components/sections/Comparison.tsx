"use client";

import { motion } from "framer-motion";

export interface ComparisonRow {
  feature: string;
  ours: boolean | string;
  theirs: boolean | string;
}

interface ComparisonProps {
  title: string;
  subtitle?: string;
  ourLabel: string;
  theirLabel: string;
  rows: ComparisonRow[];
}

const GREEN = "#39FF6A";
const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];

const THEIR_PAINS = [
  "$500–2,000 per shot",
  "1–3 days turnaround",
  "6+ months to learn",
  "Revision emails, back and forth",
  "Out of your timeline",
  "No guarantee",
];

const OUR_WINS = [
  "From $29.90/month",
  "Done in 3 minutes",
  "Zero learning curve",
  "Unlimited revisions",
  "Stays inside Premiere",
  "7-day money-back guarantee",
];

export default function Comparison({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  title, subtitle, ourLabel, theirLabel, rows,
}: ComparisonProps) {
  return (
    <section
      style={{
        background: [
          "radial-gradient(ellipse 70% 60% at 100% 50%, rgba(57,255,106,0.05) 0%, transparent 60%)",
          "radial-gradient(ellipse 40% 40% at 0% 50%, rgba(57,255,106,0.02) 0%, transparent 60%)",
          "#080808",
        ].join(", "),
        padding: "80px 20px",
        borderTop: "1px solid #111",
      }}
    >
      <div className="mx-auto" style={{ maxWidth: "860px", padding: "0 4px" }}>

        {/* Section label + heading */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          style={{ marginBottom: "56px" }}
        >
          <div className="flex items-center gap-3" style={{ marginBottom: "20px" }}>
            <div style={{ width: "4px", height: "16px", borderRadius: "100px", background: GREEN }} />
            <span
              className="font-bold uppercase"
              style={{ fontSize: "11px", letterSpacing: "0.14em", color: GREEN }}
            >
              // WHY PRYSMOR
            </span>
          </div>
          <h2
            className="font-extrabold"
            style={{
              fontSize: "clamp(28px, 3vw, 42px)",
              letterSpacing: "-1.5px",
              lineHeight: 1.1,
              background: "linear-gradient(135deg, #ffffff 0%, #888 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            The math is obvious.
          </h2>
        </motion.div>

        {/* Two-column layout with vertical divider */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, delay: 0.1, ease }}
          className="comparison-grid"
          style={{ display: "flex", flexDirection: "row", position: "relative" }}
        >
          {/* Vertical divider — hidden on mobile via CSS */}
          <div
            className="comparison-divider"
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              bottom: 0,
              width: "1px",
              background: "linear-gradient(to bottom, transparent, rgba(57,255,106,0.15) 20%, rgba(57,255,106,0.15) 80%, transparent)",
            }}
          />

          {/* LEFT — Hiring a VFX Artist */}
          <div className="comparison-col" style={{ paddingRight: "48px", flex: 1 }}>
            <p
              className="font-medium uppercase"
              style={{
                fontSize: "12px",
                color: "#444",
                letterSpacing: "2px",
                paddingBottom: "20px",
                borderBottom: "1px solid #1a1a1a",
                marginBottom: "24px",
              }}
            >
              Hiring a VFX Artist
            </p>

            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {THEIR_PAINS.map((item, i) => (
                <li
                  key={item}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "13px 0",
                    borderBottom: i < THEIR_PAINS.length - 1 ? "1px solid #111" : "none",
                    lineHeight: 1,
                  }}
                >
                  <span
                    style={{
                      color: "rgba(255,68,68,0.4)",
                      fontSize: "12px",
                      fontWeight: 700,
                      width: "16px",
                      flexShrink: 0,
                    }}
                  >
                    ×
                  </span>
                  <span style={{ fontSize: "14px", color: "#555", fontWeight: 300 }}>
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* RIGHT — Prysmor, subtle green panel */}
          <div
            className="comparison-col comparison-col-right"
            style={{
              paddingLeft: "48px",
              position: "relative",
              flex: 1,
            }}
          >
            <div
              className="comparison-col-bg"
              style={{
                position: "absolute",
                inset: "-20px 0 -20px 24px",
                background: "rgba(57,255,106,0.03)",
                border: "1px solid rgba(57,255,106,0.08)",
                borderRadius: "12px",
                pointerEvents: "none",
              }}
            />
            <div style={{ position: "relative" }}>
              <p
                className="font-medium uppercase"
                style={{
                  fontSize: "12px",
                  color: GREEN,
                  letterSpacing: "2px",
                  paddingBottom: "20px",
                  borderBottom: "1px solid rgba(57,255,106,0.1)",
                  marginBottom: "24px",
                }}
              >
                Prysmor
              </p>

              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {OUR_WINS.map((item, i) => (
                  <li
                    key={item}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "13px 0",
                      borderBottom: i < OUR_WINS.length - 1 ? "1px solid rgba(57,255,106,0.06)" : "none",
                      lineHeight: 1,
                    }}
                  >
                    <span
                      style={{
                        color: GREEN,
                        fontSize: "12px",
                        fontWeight: 700,
                        width: "16px",
                        flexShrink: 0,
                      }}
                    >
                      ✓
                    </span>
                    <span style={{ fontSize: "14px", color: "#aaa", fontWeight: 300 }}>
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
