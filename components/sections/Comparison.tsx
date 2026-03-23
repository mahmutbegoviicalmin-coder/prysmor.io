"use client";

import { motion } from "framer-motion";
import { Check, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

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

function OursCell({ value }: { value: boolean | string }) {
  if (typeof value === "boolean") {
    return value ? (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-accent/15 ring-1 ring-accent/30">
        <Check className="w-3.5 h-3.5 text-accent" strokeWidth={2.5} />
      </span>
    ) : (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/[0.04]">
        <X className="w-3 h-3 text-ink-faint" strokeWidth={2} />
      </span>
    );
  }
  return (
    <span className="text-[13px] font-semibold text-accent tabular-nums">{value}</span>
  );
}

function TheirsCell({ value }: { value: boolean | string }) {
  if (typeof value === "boolean") {
    return value ? (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/[0.06]">
        <Check className="w-3.5 h-3.5 text-ink-muted" strokeWidth={2.5} />
      </span>
    ) : (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/[0.04]">
        <X className="w-3 h-3 text-ink-faint/50" strokeWidth={2} />
      </span>
    );
  }
  return (
    <span className="text-[13px] text-ink-faint tabular-nums">{value}</span>
  );
}

export default function Comparison({ title, subtitle, ourLabel, theirLabel, rows }: ComparisonProps) {
  return (
    <section className="relative py-24 overflow-hidden">
      {/* Top separator */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />

      {/* Subtle bg glow */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-accent/[0.03] blur-[120px]" />

      <div className="relative mx-auto max-w-container-sm px-4 sm:px-6 lg:px-8">

        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="mb-12 text-center"
        >
          <h2 className="font-heading text-[28px] sm:text-[36px] font-bold text-white tracking-tight leading-tight">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-3 text-ink-muted text-[15px] max-w-md mx-auto">{subtitle}</p>
          )}
        </motion.div>

        {/* Table */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="overflow-hidden rounded-2xl border border-white/[0.08] shadow-[0_0_80px_-20px_rgba(0,0,0,0.6)]"
        >
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_1fr_1fr] bg-white/[0.03] border-b border-white/[0.08]">
            {/* Empty feature col */}
            <div className="px-5 py-4" />

            {/* Our col header — highlighted */}
            <div className="relative px-4 py-4 flex flex-col items-center justify-center border-x border-accent/20 bg-accent/[0.06]">
              <div className="absolute -top-px left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
              <p className="text-[13px] font-bold text-accent tracking-wide">{ourLabel}</p>
              <span className="text-[10px] text-accent/50 font-medium">what our users use</span>
            </div>

            {/* Their col header */}
            <div className="px-4 py-4 flex items-center justify-center">
              <p className="text-[13px] font-semibold text-ink-faint">{theirLabel}</p>
            </div>
          </div>

          {/* Rows */}
          {rows.map((row, i) => (
            <motion.div
              key={row.feature}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: 0.05 * i }}
              className={cn(
                "grid grid-cols-[1fr_1fr_1fr] group",
                i < rows.length - 1 && "border-b border-white/[0.05]",
                "hover:bg-white/[0.02] transition-colors duration-150"
              )}
            >
              {/* Feature name */}
              <div className="px-5 py-4 flex items-center">
                <span className="text-[13px] sm:text-[14px] text-ink-subtle group-hover:text-ink-muted transition-colors">
                  {row.feature}
                </span>
              </div>

              {/* Our value */}
              <div className="px-4 py-4 flex items-center justify-center border-x border-accent/10 bg-accent/[0.04]">
                <OursCell value={row.ours} />
              </div>

              {/* Their value */}
              <div className="px-4 py-4 flex items-center justify-center">
                <TheirsCell value={row.theirs} />
              </div>
            </motion.div>
          ))}

          {/* Footer CTA strip */}
          <div className="grid grid-cols-[1fr_1fr_1fr] border-t border-white/[0.07] bg-white/[0.02]">
            <div className="px-5 py-4 flex items-center">
              <span className="text-[12px] text-ink-faint">7-day money-back guarantee</span>
            </div>
            <div className="px-4 py-4 flex items-center justify-center border-x border-accent/10 bg-accent/[0.05]">
              <span className="text-[12px] font-semibold text-accent">✓ Included</span>
            </div>
            <div className="px-4 py-4 flex items-center justify-center">
              <span className="text-[12px] text-ink-faint">✗ No</span>
            </div>
          </div>
        </motion.div>

      </div>
    </section>
  );
}
