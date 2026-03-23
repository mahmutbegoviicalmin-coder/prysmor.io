"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FinalCTAProps {
  title: string;
  subtitle?: string;
  primaryLabel?: string;
  primaryHref?: string;
  onPrimaryClick?: () => void;
  secondaryLabel?: string;
  secondaryHref?: string;
}

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];

export default function FinalCTA({
  title,
  subtitle,
  primaryLabel = "Get Started",
  primaryHref = "/sign-up",
  onPrimaryClick,
  secondaryLabel,
  secondaryHref = "/pricing",
}: FinalCTAProps) {
  return (
    <section className="relative py-28 overflow-hidden">
      <div
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-[700px] h-[400px] rounded-full blur-[120px]"
        style={{ background: "radial-gradient(ellipse,rgba(163,255,18,0.09) 0%,transparent 65%)" }}
        aria-hidden="true"
      />
      <div className="mx-auto max-w-container px-4 sm:px-6 lg:px-8 text-center relative">
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease }}
          className="flex flex-col items-center gap-6"
        >
          <h2 className="font-heading text-[36px] sm:text-[50px] lg:text-[58px] font-bold tracking-tight leading-[1.07]">
            <span className="text-white">{title.split("today")[0]}</span>
            {title.includes("today") && (
              <span className="text-gradient-lime">today.</span>
            )}
          </h2>
          {subtitle && (
            <p className="text-ink-muted text-[15px] max-w-sm">{subtitle}</p>
          )}
          <div className="flex flex-wrap justify-center gap-3">
            {onPrimaryClick ? (
              <Button size="lg" onClick={onPrimaryClick}>
                {primaryLabel}
                <ArrowRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button size="lg" asChild>
                <Link href={primaryHref}>
                  {primaryLabel}
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            )}
            {secondaryLabel && (
              <Button size="lg" variant="outline" asChild>
                <Link href={secondaryHref}>{secondaryLabel}</Link>
              </Button>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
