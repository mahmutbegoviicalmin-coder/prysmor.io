"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

export interface Step {
  icon: LucideIcon;
  number: string;
  title: string;
  desc: string;
}

interface HowItWorksProps {
  title?: string;
  steps: Step[];
}

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];
const GREEN = "#39FF6A";

const STEP_TITLES = [
  "Pick the clip.",
  "Type the shot.",
  "It's on your timeline.",
];

const STEP_DESCS = [
  "Select your in/out point on the Premiere timeline. One click sends the clip to the Prysmor panel. Nothing else moves.",
  "Write the effect in plain language. Hard to describe? Drop a reference image and Prysmor matches the light, color, and mood exactly.",
  "Your effect renders at 4K and lands back on the timeline automatically. No exporting, no round-trips, no lost progress.",
];

const STEP_NUMBERS = ["01", "02", "03"];

export default function HowItWorks({ steps }: HowItWorksProps) {
  return (
    <section
      className="hiw-section"
      style={{
        background: "radial-gradient(ellipse 60% 40% at 50% 50%, rgba(57,255,106,0.04) 0%, transparent 65%), #080808",
        padding: "100px 0px 100px 40px",
        borderTop: "1px solid #0f0f0f",
        borderLeft: "2px solid rgba(57,255,106,0.15)",
        paddingLeft: "40px",
      }}
    >
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>

        {/* Section label + heading */}
        <motion.div
          initial={{ opacity: 1, y: 0 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="hiw-heading"
          style={{ marginBottom: "64px" }}
        >
          <div className="flex items-center gap-3" style={{ marginBottom: "20px" }}>
            <div style={{ width: "4px", height: "16px", borderRadius: "100px", background: GREEN }} />
            <span
              className="font-bold uppercase"
              style={{ fontSize: "11px", letterSpacing: "0.14em", color: GREEN }}
            >
              // THREE STEPS
            </span>
          </div>
          <h2
            className="font-extrabold text-white"
            style={{
              fontSize: "clamp(32px, 4vw, 52px)",
              letterSpacing: "-1.5px",
              lineHeight: 1.1,
            }}
          >
            Simple by design.
          </h2>
        </motion.div>

        {/* Step rows */}
        <div className="hiw-cards-wrap">
        {steps.map((step, i) => (
          <motion.div key={step.number}>
            {/* Gradient divider */}
            <div className="hiw-divider" style={{
              height: "1px",
              background: "linear-gradient(90deg, rgba(57,255,106,0.08) 0%, #111 30%, #111 70%, transparent 100%)",
            }} />

            <motion.div
              initial={{ opacity: 1, y: 0 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.45, delay: i * 0.08, ease }}
              className="group step-row"
              style={{
                display: "grid",
                gridTemplateColumns: "80px 1fr 1fr",
                alignItems: "start",
                padding: "36px 0",
              }}
            >
              {/* Step number + green dot */}
              <span
                className="step-number"
                style={{
                  fontSize: "12px",
                  color: "#555",
                  fontWeight: 600,
                  letterSpacing: "2px",
                  fontFamily: "ui-monospace, SFMono-Regular, monospace",
                  paddingTop: "4px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <span style={{
                  width: "4px",
                  height: "4px",
                  borderRadius: "50%",
                  background: "rgba(57,255,106,0.5)",
                  display: "inline-block",
                  flexShrink: 0,
                }} />
                {STEP_NUMBERS[i]}
              </span>

              {/* Title — green on hover */}
              <h3
                className="transition-colors duration-200 group-hover:text-[#39FF6A] step-title"
                style={{
                  fontSize: "18px",
                  fontWeight: 600,
                  color: "white",
                  letterSpacing: "-0.5px",
                  lineHeight: 1.2,
                  paddingRight: "40px",
                  margin: 0,
                }}
              >
                {STEP_TITLES[i]}
              </h3>

              {/* Description */}
              <p
                className="step-desc"
                style={{
                  fontSize: "14px",
                  color: "#777",
                  fontWeight: 300,
                  lineHeight: 1.75,
                  margin: 0,
                }}
              >
                {STEP_DESCS[i]}
              </p>
            </motion.div>
          </motion.div>
        ))}
        </div>
        {/* Final bottom divider */}
        <div className="hiw-divider" style={{
          height: "1px",
          background: "linear-gradient(90deg, rgba(57,255,106,0.08) 0%, #111 30%, #111 70%, transparent 100%)",
        }} />
      </div>
    </section>
  );
}
