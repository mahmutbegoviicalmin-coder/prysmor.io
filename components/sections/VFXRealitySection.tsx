"use client";

import { motion } from "framer-motion";

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];

const WORKFLOW_STEPS = ["Export", "Upload", "Wait", "Download", "Import"];

function WorkflowSteps() {
  return (
    <div>
      <ol className="space-y-0">
        {WORKFLOW_STEPS.map((step, index) => (
          <li key={step} className="relative flex items-center gap-3 py-[5px]">
            {index < WORKFLOW_STEPS.length - 1 && (
              <span
                className="absolute left-[5px] top-[18px] h-[calc(100%+2px)] w-px bg-white/[0.08]"
                aria-hidden
              />
            )}
            <span
              className="relative z-10 flex h-[11px] w-[11px] shrink-0 items-center justify-center rounded-full border border-white/[0.12] bg-[#111111]"
              aria-hidden
            >
              <span className="h-1 w-1 rounded-full bg-white/25" />
            </span>
            <span className="text-[13px] tracking-[-0.01em] text-white/50">
              {step}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function PainBullets({ items }: { items: readonly string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex items-center gap-2.5 text-[13px] text-white/50">
          <span
            className="h-1 w-1 shrink-0 rounded-full bg-white/20"
            aria-hidden
          />
          {item}
        </li>
      ))}
    </ul>
  );
}

const PAIN_POINTS = [
  {
    title: "Freelancers",
    bullets: [
      "2–5 days per delivery",
      "Brief and files every time",
      "Revisions over email",
      "Waiting on their schedule",
      "Export footage, wait, re-import",
    ],
    label: "External help",
    accent: "rgba(255,255,255,0.06)",
    badge: { value: "$150–600" },
  },
  {
    title: "Too many steps",
    variant: "workflow" as const,
    label: "Outside your NLE",
    accent: "rgba(255,255,255,0.05)",
    badge: null,
  },
] as const;

const SOLUTION_POINTS = [
  "Stays in Premiere Pro and After Effects",
  "No export round-trip",
  "Iterate on the timeline",
];

export default function VFXRealitySection() {
  return (
    <section className="border-b border-white/[0.06] bg-[#080808]">
      <div className="mx-auto max-w-[1120px] px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <motion.header
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.45, ease }}
          className="max-w-xl"
        >
          <h2 className="text-[clamp(1.625rem,3.5vw,2.25rem)] font-semibold leading-[1.12] tracking-[-0.03em] text-white">
            The reality of VFX-heavy projects
          </h2>
          <p className="mt-3 text-[15px] leading-7 text-white/50">
            VFX outside your timeline costs time and money on every request.
          </p>
        </motion.header>

        <div className="mt-10 grid gap-3 md:grid-cols-2 lg:mt-12 lg:grid-cols-3 lg:gap-4">
          {PAIN_POINTS.map((item, index) => (
            <motion.article
              key={item.title}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.4, delay: index * 0.05, ease }}
              className="group relative flex flex-col overflow-hidden rounded-xl border border-white/[0.07] bg-[#0c0c0c] p-5 transition-all duration-300 hover:border-white/[0.12] sm:p-6"
            >
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-60 transition-opacity duration-300 group-hover:opacity-100"
                style={{
                  background: `linear-gradient(90deg, transparent, ${item.accent}, transparent)`,
                }}
                aria-hidden
              />

              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-semibold tracking-[-0.02em] text-white">
                  {item.title}
                </h3>
                {item.badge && (
                  <span className="shrink-0 rounded-md border border-amber-400/15 bg-amber-400/[0.06] px-2.5 py-1 text-[12px] font-semibold tabular-nums tracking-[-0.02em] text-amber-100/75">
                    {item.badge.value}
                  </span>
                )}
              </div>
              <div className="mt-2.5 flex-1 text-[14px] leading-6 text-white/55">
                {"bullets" in item && item.bullets ? (
                  <PainBullets items={item.bullets} />
                ) : "variant" in item && item.variant === "workflow" ? (
                  <WorkflowSteps />
                ) : null}
              </div>
              <p className="mt-5 text-[10px] font-medium uppercase tracking-[0.14em] text-white/30 transition-colors duration-300 group-hover:text-white/45">
                {item.label}
              </p>
            </motion.article>
          ))}

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.45, delay: 0.1, ease }}
            className="group relative flex flex-col overflow-hidden rounded-xl border border-[#39FF6A]/15 bg-[#0a100c] p-5 sm:p-6 md:col-span-2 lg:col-span-1"
          >
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse 90% 80% at 100% 0%, rgba(57,255,106,0.10) 0%, transparent 55%)",
              }}
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-y-0 left-0 w-[2px] bg-gradient-to-b from-[#39FF6A]/60 via-[#39FF6A]/25 to-transparent"
              aria-hidden
            />

            <div className="relative flex flex-1 flex-col">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#39FF6A]/70">
                Prysmor
              </p>
              <h3 className="mt-2 text-base font-semibold tracking-[-0.02em] text-white">
                Stay on the timeline.
              </h3>
              <p className="mt-2.5 flex-1 text-[14px] leading-6 text-white/58">
                Relight, replace backgrounds, and add VFX from a panel inside
                Premiere Pro and After Effects.
              </p>

              <ul className="mt-5 space-y-2 border-t border-[#39FF6A]/10 pt-4">
                {SOLUTION_POINTS.map((point) => (
                  <li
                    key={point}
                    className="flex items-center gap-2.5 text-[13px] text-white/65"
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#39FF6A]/70"
                      aria-hidden
                    />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
