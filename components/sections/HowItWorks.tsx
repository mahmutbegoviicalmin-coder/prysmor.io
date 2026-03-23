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

export default function HowItWorks({ title = "How it works", steps }: HowItWorksProps) {
  return (
    <section className="relative py-24">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
      <div className="mx-auto max-w-container px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="mb-14 text-center"
        >
          <h2 className="font-heading text-[28px] sm:text-[36px] font-bold text-white tracking-tight">{title}</h2>
        </motion.div>

        <div className="grid sm:grid-cols-3 gap-6 relative">
          {/* connector line */}
          <div className="hidden sm:block absolute top-10 left-1/6 right-1/6 h-px"
            style={{ background: "linear-gradient(90deg,transparent,rgba(163,255,18,0.18),rgba(163,255,18,0.18),transparent)" }} />

          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.1, ease }}
                className="flex flex-col items-center text-center gap-4 relative"
              >
                {/* Step circle */}
                <div className="relative z-10 w-14 h-14 rounded-full border border-accent/25 bg-accent/[0.08] flex items-center justify-center flex-shrink-0">
                  <Icon className="w-6 h-6 text-accent" />
                  <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-accent text-background text-[10px] font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                </div>
                <h3 className="font-heading text-[16px] font-semibold text-white">{step.title}</h3>
                <p className="text-[13px] text-ink-muted leading-relaxed max-w-[220px]">{step.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
