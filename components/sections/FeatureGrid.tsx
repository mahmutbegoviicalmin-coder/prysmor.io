"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface FeatureItem {
  icon: LucideIcon;
  title: string;
  desc: string;
}

interface FeatureGridProps {
  title: string;
  subtitle?: string;
  features: FeatureItem[];
  accentColor?: string;
  cols?: 2 | 3;
}

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];

export default function FeatureGrid({
  title,
  subtitle,
  features,
  accentColor = "#A3FF12",
  cols = 3,
}: FeatureGridProps) {
  return (
    <section className="relative py-24 overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/[0.06]" />
      <div className="mx-auto max-w-container px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="mb-12"
        >
          <h2 className="font-heading text-[32px] sm:text-[42px] font-bold text-white tracking-[-0.03em]">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-3 text-ink-muted text-[15px] max-w-lg font-light">{subtitle}</p>
          )}
        </motion.div>

        <div className={cn(
          "grid gap-4",
          cols === 3
            ? "sm:grid-cols-2 lg:grid-cols-3"
            : "sm:grid-cols-2"
        )}>
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.45, delay: i * 0.07, ease }}
                className="group rounded-[14px] border border-white/[0.07] bg-surface p-6 hover:border-white/[0.12] transition-colors duration-200"
              >
                <div className="w-10 h-10 rounded-[10px] flex items-center justify-center mb-4 border border-white/[0.09] bg-white/[0.04]">
                  <Icon className="w-5 h-5 text-accent" />
                </div>
                <h3 className="font-heading text-[15px] font-bold text-white mb-2">{f.title}</h3>
                <p className="text-[13px] text-ink-muted leading-relaxed font-light">{f.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
