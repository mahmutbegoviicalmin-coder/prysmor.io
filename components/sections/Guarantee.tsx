"use client";

import { motion } from "framer-motion";
import { ShieldCheck, RotateCcw, Zap } from "lucide-react";

interface GuaranteeProps {
  title?: string;
}

const perks = [
  {
    icon: RotateCcw,
    title: "7-day money-back",
    desc: "Not what you expected? Email us within 7 days for a full refund, no questions asked.",
  },
  {
    icon: Zap,
    title: "24-hour free trial",
    desc: "Try the full product free for 24 hours before committing to any plan.",
  },
  {
    icon: ShieldCheck,
    title: "No lock-in",
    desc: "Cancel anytime from your dashboard. Your exported files are always yours.",
  },
];

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];

export default function Guarantee({ title = "Zero risk. Serious results." }: GuaranteeProps) {
  return (
    <section className="relative py-24">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
      <div className="mx-auto max-w-container px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="mb-10 text-center"
        >
          <h2 className="font-heading text-[28px] sm:text-[34px] font-bold text-white tracking-tight">{title}</h2>
        </motion.div>
        <div className="grid sm:grid-cols-3 gap-5">
          {perks.map((p, i) => {
            const Icon = p.icon;
            return (
              <motion.div
                key={p.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.45, delay: i * 0.08, ease }}
                className="rounded-[18px] border border-accent/[0.15] bg-accent/[0.04] p-6 text-center flex flex-col items-center gap-4"
              >
                <div className="w-12 h-12 rounded-full border border-accent/25 bg-accent/[0.09] flex items-center justify-center">
                  <Icon className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h3 className="font-heading text-[15px] font-semibold text-white mb-1.5">{p.title}</h3>
                  <p className="text-[13px] text-ink-muted leading-relaxed">{p.desc}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
