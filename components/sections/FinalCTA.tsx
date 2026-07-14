"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { trackCta } from "@/lib/track";

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];

export default function FinalCTA() {
  return (
    <section className="relative overflow-hidden border-t border-white/[0.06] bg-[#080808]">
      <div
        className="pointer-events-none absolute inset-x-0 top-1/2 h-[420px] -translate-y-1/2 opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 50%, rgba(57,255,106,0.09) 0%, transparent 70%)",
        }}
        aria-hidden
      />

      <div className="relative mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.45, ease }}
          className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0a0a]/80 p-6 ring-1 ring-[#39FF6A]/10 sm:p-8 lg:flex lg:items-center lg:justify-between lg:gap-12 lg:p-12"
        >
          <div
            className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-40 blur-3xl"
            style={{ background: "rgba(57,255,106,0.12)" }}
            aria-hidden
          />

          <div className="relative max-w-xl text-center lg:text-left">
            <div className="flex flex-wrap items-center justify-center gap-2 lg:justify-start">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#39FF6A]/55">
                Get started
              </p>
              <div className="flex items-center gap-1.5">
                <Image
                  src="/pr.png"
                  alt=""
                  width={16}
                  height={16}
                  className="h-4 w-4 object-contain opacity-75"
                  aria-hidden
                />
                <Image
                  src="/ae.png"
                  alt=""
                  width={16}
                  height={16}
                  className="h-4 w-4 object-contain opacity-75"
                  aria-hidden
                />
              </div>
            </div>

            <h2 className="mt-4 text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-[1.12] tracking-tight text-white">
              Install the panel. Generate on{" "}
              <span className="text-[#39FF6A]/90">your timeline</span>.
            </h2>

            <p className="mx-auto mt-4 max-w-md text-[15px] leading-7 text-white/55 lg:mx-0">
              Buy once, install the Premiere Pro and After Effects panels, and
              generate AI VFX on your timeline.
            </p>

            <p className="mt-4 hidden text-[12px] leading-5 text-white/30 lg:block">
              $99 lifetime · Never expires · 200 seconds of AI VFX
            </p>
          </div>

          <div className="relative mt-8 flex flex-col items-center gap-3 lg:mt-0 lg:shrink-0 lg:items-end">
            <Link
              href="/checkout"
              onClick={() => trackCta("final_cta", "get_lifetime")}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#39FF6A] px-6 py-3.5 text-[14px] font-semibold text-black transition-opacity hover:opacity-90 sm:w-auto"
            >
              Get lifetime access
              <ArrowRight size={15} strokeWidth={2.5} />
            </Link>
            <p className="text-center text-[12px] leading-5 text-white/30 lg:hidden">
              $99 lifetime · Never expires · 200 seconds of AI VFX
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
