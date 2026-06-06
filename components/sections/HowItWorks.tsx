"use client";

import { motion } from "framer-motion";

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];

const STEPS = [
  {
    number: "01",
    title: "Select a clip",
    description:
      "Choose a clip on your Premiere Pro or After Effects timeline. Prysmor reads your in and out points from the panel.",
  },
  {
    number: "02",
    title: "Describe the effect",
    description:
      "Write what you want: relight, a new background, rain, fire, or removal. Optional reference image for precise looks.",
  },
  {
    number: "03",
    title: "Get a result on your timeline",
    description:
      "Prysmor renders at up to 4K and places the result back on your edit. No export, no round-trip, no separate app.",
  },
];

export default function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="border-b border-white/[0.06] bg-[#080808]"
    >
      <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.45, ease }}
          className="max-w-xl"
        >
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/45">
            How it works
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white lg:text-4xl">
            Three steps. Stays inside Adobe.
          </h2>
          <p className="mt-4 text-[15px] leading-7 text-white/55">
            The workflow editors already use, with AI generation built into the
            panel.
          </p>
        </motion.header>

        <div className="mt-14 grid gap-0 lg:mt-16 lg:grid-cols-3 lg:gap-8">
          {STEPS.map((step, index) => (
            <motion.article
              key={step.number}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.45, delay: index * 0.06, ease }}
              className="border-t border-white/[0.06] py-8 lg:border-t-0 lg:py-0 lg:pr-6"
            >
              <p className="font-mono text-[11px] text-white/30">{step.number}</p>
              <h3 className="mt-3 text-lg font-semibold tracking-tight text-white">
                {step.title}
              </h3>
              <p className="mt-2 text-[14px] leading-7 text-white/55">
                {step.description}
              </p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
