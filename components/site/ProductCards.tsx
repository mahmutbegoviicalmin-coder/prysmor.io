"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Zap, Sparkles, Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const products = [
  {
    id: "cutsync",
    name: "CutSync",
    tagline: "AI Auto Editing Engine",
    description:
      "Upload your footage, set the pacing — CutSync handles silence removal, beat-sync, smart jump cuts, and auto pacing automatically.",
    icon: Zap,
    href: "/cutsync",
    featured: true,
    badge: "Most used",
    bullets: [
      "Silence removal at scale",
      "Beat-synced cuts from any audio",
      "Smart jump cuts",
      "Auto pacing engine",
    ],
    accent: "from-accent/10 to-transparent",
    borderAccent: "border-accent/20",
    glowColor: "rgba(163,255,18,0.07)",
  },
  {
    id: "motionforge",
    name: "MotionForge",
    tagline: "AI VFX Generator",
    description:
      "Type the effect you want. MotionForge generates cinematic particles, overlays, and tracking-ready VFX — ready to drop into your timeline.",
    icon: Sparkles,
    href: "/motionforge",
    featured: false,
    badge: null,
    bullets: [
      "Text-to-VFX generation",
      "Cinematic particle systems",
      "Tracking-ready alpha exports",
      "Render packs included",
    ],
    accent: "from-[rgba(34,255,176,0.08)] to-transparent",
    borderAccent: "border-white/10",
    glowColor: "rgba(34,255,176,0.06)",
  },
];

interface ProductCardsProps {
  compact?: boolean;
}

export default function ProductCards({ compact = false }: ProductCardsProps) {
  return (
    <div className={cn("grid gap-5", compact ? "lg:grid-cols-2" : "lg:grid-cols-[1.15fr_1fr]")}>
      {products.map((p, i) => {
        const Icon = p.icon;
        return (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{
              duration: 0.5,
              delay: i * 0.1,
              ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
            }}
            className="relative"
          >
            {/* Glow behind featured card */}
            {p.featured && (
              <div
                className="pointer-events-none absolute -inset-px rounded-card blur-xl"
                style={{ background: p.glowColor }}
                aria-hidden="true"
              />
            )}
            <div
              className={cn(
                "relative rounded-card border bg-surface-1 flex flex-col overflow-hidden",
                "transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover",
                p.featured ? p.borderAccent : "border-white/8",
                p.featured && "shadow-glow-card"
              )}
            >
              {/* Top gradient */}
              <div
                className={cn(
                  "absolute inset-x-0 top-0 h-40 bg-gradient-to-b pointer-events-none",
                  p.accent
                )}
                aria-hidden="true"
              />

              {/* Content */}
              <div className="relative p-7 flex flex-col gap-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center",
                        p.featured
                          ? "bg-accent/[0.12] border border-accent/25"
                          : "bg-white/[0.06] border border-white/10"
                      )}
                    >
                      <Icon
                        className={cn("w-5 h-5", p.featured ? "text-accent" : "text-ink-muted")}
                      />
                    </div>
                    <div>
                      <h3 className="font-heading text-lg font-semibold text-ink tracking-tight">
                        {p.name}
                      </h3>
                      <p className="text-[12px] text-ink-faint">{p.tagline}</p>
                    </div>
                  </div>
                  {p.badge && (
                    <Badge variant="accent" className="text-[10px]">
                      {p.badge}
                    </Badge>
                  )}
                </div>

                <p className="text-[14px] text-ink-muted leading-relaxed">{p.description}</p>

                <ul className="space-y-2.5">
                  {p.bullets.map((b) => (
                    <li key={b} className="flex items-center gap-2.5">
                      <Check
                        className={cn(
                          "w-3.5 h-3.5 flex-shrink-0",
                          p.featured ? "text-accent" : "text-ink-muted"
                        )}
                      />
                      <span className="text-[13px] text-ink-subtle">{b}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  variant={p.featured ? "default" : "outline"}
                  className="w-full mt-1 gap-2"
                  asChild
                >
                  <Link href={p.href}>
                    View {p.name}
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
