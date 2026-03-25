"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

export interface PriceTier {
  id: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice?: number;      // total yearly price (e.g. 299)
  yearlyPerDay?: string;     // e.g. "0.87"
  yearlySave?: number;       // e.g. 49
  description: string;
  unit?: string;             // monthly units label
  yearlyUnit?: string;       // yearly units label (bigger allowance)
  featured?: boolean;
  badge?: string;
  bullets: string[];
  cta: string;
  ctaHref: string;
  onCtaClick?: () => void;
}

interface PricingSectionProps {
  title?: string;
  subtitle?: string;
  tiers: PriceTier[];
  showToggle?: boolean;
  footerNote?: string;
  infoContent?: string;
  onCtaClick?: () => void;
}

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];

export default function PricingSection({
  title = "Pick your plan",
  subtitle,
  tiers,
  showToggle = false,
  footerNote,
  infoContent,
  onCtaClick,
}: PricingSectionProps) {
  const [yearly, setYearly] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <section className="relative py-24 overflow-hidden" id="pricing">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
      <div
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-0 w-[800px] h-[400px] rounded-full blur-[130px]"
        style={{ background: "radial-gradient(ellipse,rgba(163,255,18,0.05) 0%,transparent 65%)" }}
        aria-hidden="true"
      />
      <div className="mx-auto max-w-container px-4 sm:px-6 lg:px-8 relative">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="mb-12 flex flex-col items-start gap-5"
        >
          <div className="flex items-center gap-4 flex-wrap">
            <h2 className="font-heading text-[28px] sm:text-[36px] font-bold text-white tracking-tight">{title}</h2>
            {infoContent && (
              <button
                onClick={() => setInfoOpen(true)}
                className="flex items-center gap-1.5 text-[12px] text-ink-muted hover:text-accent transition-colors border border-white/[0.10] rounded-full px-3 py-1.5 hover:border-accent/30"
              >
                <Info className="w-3.5 h-3.5" />
                What are seconds?
              </button>
            )}
          </div>
          {subtitle && <p className="text-ink-muted text-[14px] max-w-lg">{subtitle}</p>}

          {showToggle && (
            <div className="inline-flex items-center p-1 rounded-xl bg-white/[0.05] border border-white/[0.08]">
              <button
                onClick={() => setYearly(false)}
                className={cn(
                  "relative px-5 py-2 rounded-lg text-[13px] font-medium transition-all duration-200",
                  !yearly
                    ? "bg-white text-black shadow-sm"
                    : "text-ink-muted hover:text-white"
                )}
              >
                Monthly
              </button>
              <button
                onClick={() => setYearly(true)}
                className={cn(
                  "relative flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-medium transition-all duration-200",
                  yearly
                    ? "bg-white text-black shadow-sm"
                    : "text-ink-muted hover:text-white"
                )}
              >
                Yearly
                <span className={cn(
                  "text-[10px] font-bold px-1.5 py-0.5 rounded-md transition-all duration-200",
                  yearly ? "bg-accent text-black" : "bg-accent/20 text-accent"
                )}>
                  Save 30%
                </span>
              </button>
            </div>
          )}
        </motion.div>

        <div className={cn(
          "grid gap-5",
          tiers.length === 2 ? "lg:grid-cols-2" : "lg:grid-cols-3"
        )}>
          {tiers.map((tier, i) => {
            const isYearly = yearly && !!tier.yearlyPrice;
            const price    = isYearly ? tier.yearlyPrice! : tier.monthlyPrice;
            const suffix   = isYearly ? "/yr" : "/mo";
            const origYr   = tier.monthlyPrice * 12; // e.g. $348
            return (
              <motion.div
                key={tier.id}
                initial={{ opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, delay: i * 0.09, ease }}
                className="relative h-full"
              >
                {tier.featured && (
                  <div
                    className="pointer-events-none absolute -inset-px rounded-[20px] blur-lg"
                    style={{ background: "rgba(163,255,18,0.06)" }}
                  />
                )}
                <div className={cn(
                  "relative h-full rounded-[18px] border flex flex-col overflow-hidden transition-all duration-300",
                  "hover:-translate-y-0.5",
                  tier.featured
                    ? "border-accent/25 bg-[linear-gradient(160deg,rgba(163,255,18,0.07)_0%,rgba(15,16,18,1)_55%)] shadow-glow-card"
                    : "border-white/[0.08] bg-surface hover:border-white/[0.14]"
                )}>
                  {tier.featured && (
                    <div
                      className="absolute top-0 inset-x-0 h-[1.5px]"
                      style={{ background: "linear-gradient(90deg,transparent,#A3FF12 40%,#22FFB0 60%,transparent)" }}
                    />
                  )}
                  <div className="p-7 flex flex-col gap-6 flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className={cn("text-[14px] font-semibold", tier.featured ? "text-accent" : "text-ink-muted")}>
                          {tier.name}
                        </p>
                        {tier.badge && (
                          <Badge variant="accent" className="mt-1 text-[10px]">{tier.badge}</Badge>
                        )}
                      </div>
                    </div>
                    <div>
                      {/* Price — all elements grouped under same key so they switch atomically */}
                      <div key={isYearly ? "yr" : "mo"}>
                        <div className="flex items-end gap-1.5">
                          <span className="font-heading text-[42px] font-bold text-white leading-none tracking-tight tabular-nums">
                            ${price}
                          </span>
                          <span className="text-ink-muted pb-1 text-[14px]">{suffix}</span>
                        </div>

                        {/* Per-day always visible as a teaser; Save + strikethrough only on yearly */}
                        {tier.yearlyPerDay && (
                          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                            <span className="text-[12px] text-ink-faint">${tier.yearlyPerDay}/day</span>
                            {isYearly && (
                              <>
                                <span className="text-[12px] text-ink-faint line-through">${origYr}</span>
                                {tier.yearlySave && (
                                  <span className="text-[11px] font-semibold text-accent bg-accent/10 px-1.5 py-0.5 rounded-md">
                                    Save ${tier.yearlySave}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      {(() => {
                        const activeUnit = isYearly && tier.yearlyUnit ? tier.yearlyUnit : tier.unit;
                        return activeUnit ? (
                          <div key={isYearly ? "unit-yr" : "unit-mo"} className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.07]">
                            <span className="text-[13px] font-semibold text-white">{activeUnit.split(" ")[0]}</span>
                            <span className="text-[11px] text-ink-faint">{activeUnit.split(" ").slice(1).join(" ")}</span>
                          </div>
                        ) : null;
                      })()}
                      <p className="mt-2.5 text-[13px] text-ink-subtle leading-relaxed">{tier.description}</p>
                    </div>
                    <ul className="space-y-2.5 flex-1">
                      {tier.bullets.map((b) => (
                        <li key={b} className="flex items-start gap-2.5">
                          <Check className={cn("w-3.5 h-3.5 mt-0.5 flex-shrink-0", tier.featured ? "text-accent" : "text-ink-subtle")} />
                          <span className="text-[13px] text-ink-subtle">{b}</span>
                        </li>
                      ))}
                    </ul>
                    {(tier.onCtaClick ?? onCtaClick) ? (
                      <Button
                        variant={tier.featured ? "default" : "outline"}
                        className="w-full mt-auto"
                        onClick={tier.onCtaClick ?? onCtaClick}
                      >
                        {tier.cta}
                      </Button>
                    ) : (
                      <Button variant={tier.featured ? "default" : "outline"} className="w-full mt-auto" asChild>
                        <Link href={tier.ctaHref}>{tier.cta}</Link>
                      </Button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {footerNote && (
          <p className="mt-6 text-center text-[12px] text-ink-faint">{footerNote}</p>
        )}
      </div>

      {/* Info modal */}
      <AnimatePresence>
        {infoOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setInfoOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-sm w-full rounded-[20px] border border-white/[0.12] bg-surface-1 p-7 shadow-[0_24px_60px_rgba(0,0,0,0.7)]"
            >
              <button onClick={() => setInfoOpen(false)} className="absolute top-4 right-4 text-ink-muted hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
              <h3 className="font-heading text-[18px] font-bold text-white mb-3">What are seconds?</h3>
              <p className="text-[13px] text-ink-muted leading-relaxed">
                {infoContent ?? "In MotionForge, \"seconds\" refers to the total duration of video effects you can generate per month. A 5-second particle explosion = 5 seconds used. Credits reset on your billing date."}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
