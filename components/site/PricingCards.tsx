"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Check, Zap, Sparkles, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface PricingTier {
  id: string;
  name: string;
  price: number;
  period: string;
  description: string;
  icon: React.ElementType;
  featured?: boolean;
  badge?: string;
  bullets: string[];
  cta: string;
  ctaHref: string;
  limits?: string;
}

export const pricingTiers: PricingTier[] = [
  {
    id: "cutsync",
    name: "CutSync",
    price: 39,
    period: "/mo",
    description: "AI auto editing for solo creators and growing channels.",
    icon: Zap,
    bullets: [
      "Silence removal",
      "Beat-synced cuts",
      "Smart jump cuts",
      "Auto pacing engine",
      "Up to 60 min of footage/mo",
      "Premiere panel access",
    ],
    limits: "60 min/mo · 1 seat",
    cta: "Start CutSync",
    ctaHref: "/sign-up",
  },
  {
    id: "motionforge",
    name: "MotionForge",
    price: 79,
    period: "/mo",
    description: "AI VFX generation for motion designers and editors.",
    icon: Sparkles,
    bullets: [
      "Text-to-VFX generation",
      "Cinematic particle effects",
      "Alpha-channel overlays",
      "Render packs included",
      "100 effect generations/mo",
      "Premiere panel access",
    ],
    limits: "100 generations/mo · 1 seat",
    cta: "Start MotionForge",
    ctaHref: "/sign-up",
  },
  {
    id: "suite",
    name: "Creator Suite",
    price: 99,
    period: "/mo",
    description: "Full access to CutSync + MotionForge — best value.",
    icon: Package,
    featured: true,
    badge: "Best value",
    bullets: [
      "Everything in CutSync",
      "Everything in MotionForge",
      "120 min of footage/mo",
      "150 VFX generations/mo",
      "Priority render queue",
      "2 seats included",
    ],
    limits: "120 min + 150 gen/mo · 2 seats",
    cta: "Start Suite",
    ctaHref: "/sign-up",
  },
];

interface PricingCardsProps {
  compact?: boolean;
}

export default function PricingCards({ compact = false }: PricingCardsProps) {
  return (
    <div className={cn("grid gap-5", compact ? "lg:grid-cols-3" : "lg:grid-cols-3")}>
      {pricingTiers.map((tier, i) => {
        const Icon = tier.icon;
        return (
          <motion.div
            key={tier.id}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{
              duration: 0.5,
              delay: i * 0.09,
              ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
            }}
            className="relative h-full"
          >
            <div
              className={cn(
                "relative h-full rounded-card border flex flex-col overflow-hidden transition-all duration-300 hover:-translate-y-0.5",
                tier.featured
                  ? "border-accent/22 bg-[linear-gradient(160deg,rgba(163,255,18,0.07)_0%,rgba(34,255,176,0.03)_100%)] hover:border-accent/32 shadow-glow-card"
                  : "border-white/8 bg-surface-1 hover:border-white/14 hover:shadow-card-hover"
              )}
            >
              {/* Featured top line */}
              {tier.featured && (
                <div
                  className="absolute top-0 inset-x-0 h-[1.5px]"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, #A3FF12 40%, #22FFB0 60%, transparent)",
                  }}
                  aria-hidden="true"
                />
              )}

              <div className="p-7 flex flex-col gap-6 flex-1">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-9 h-9 rounded-xl flex items-center justify-center",
                        tier.featured
                          ? "bg-accent/[0.10] border border-accent/20"
                          : "bg-white/[0.05] border border-white/8"
                      )}
                    >
                      <Icon
                        className={cn(
                          "w-4 h-4",
                          tier.featured ? "text-accent" : "text-ink-muted"
                        )}
                      />
                    </div>
                    <p
                      className={cn(
                        "text-sm font-semibold",
                        tier.featured ? "text-ink" : "text-ink-muted"
                      )}
                    >
                      {tier.name}
                    </p>
                  </div>
                  {tier.badge && (
                    <Badge variant="accent" className="text-[10px]">
                      {tier.badge}
                    </Badge>
                  )}
                </div>

                {/* Price */}
                <div>
                  <div className="flex items-end gap-1">
                    <span className="font-heading text-[40px] font-semibold text-ink leading-none tracking-tight">
                      ${tier.price}
                    </span>
                    <span className="text-ink-muted pb-1">{tier.period}</span>
                  </div>
                  <p className="mt-2 text-[13px] text-ink-subtle">{tier.description}</p>
                </div>

                {/* Bullets */}
                <ul className="space-y-2.5 flex-1">
                  {tier.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2.5">
                      <Check
                        className={cn(
                          "w-3.5 h-3.5 mt-0.5 flex-shrink-0",
                          tier.featured ? "text-accent" : "text-ink-subtle"
                        )}
                      />
                      <span className="text-[13px] text-ink-subtle">{b}</span>
                    </li>
                  ))}
                </ul>

                {/* Limit note */}
                {tier.limits && (
                  <p className="text-[11px] text-ink-faint border-t border-white/[0.05] pt-4">
                    {tier.limits}
                  </p>
                )}

                <Button
                  variant={tier.featured ? "default" : "outline"}
                  className="w-full"
                  asChild
                >
                  <Link href={tier.ctaHref}>{tier.cta}</Link>
                </Button>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
