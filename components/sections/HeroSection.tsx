"use client";

import Link from "next/link";
import { track } from "@vercel/analytics";
import { motion } from "framer-motion";
import LazyVideo from "@/components/media/LazyVideo";
import { HERO_VIDEO_POSTER, HERO_VIDEO_SRC } from "@/lib/heroMedia";

const ease = [0.22, 1, 0.36, 1] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, delay, ease },
  }),
};

export default function HeroSection() {
  return (
    <section className="bg-black px-3 pb-4 pt-[calc(var(--bar-h,0px)+4.25rem)] sm:px-4 sm:pb-5 sm:pt-[calc(var(--bar-h,0px)+4.75rem)] md:px-5">
      <div className="relative mx-auto grid min-h-[min(780px,calc(100svh-5.5rem))] max-w-[1400px] overflow-hidden rounded-[20px] border border-white/[0.07] sm:min-h-[min(820px,calc(100svh-6rem))] sm:rounded-[28px]">
        {/* Video */}
        <div className="relative col-start-1 row-start-1 min-h-[inherit]">
          <div className="absolute inset-0">
            <div className="hero-ken-burns absolute inset-[-3%]">
              <LazyVideo
                src={HERO_VIDEO_SRC}
                poster={HERO_VIDEO_POSTER}
                label="Prysmor VFX generation demo"
                eager
                className="h-full w-full min-h-full"
                videoClassName="absolute inset-0 h-full w-full object-cover"
              />
            </div>

            <div className="pointer-events-none absolute inset-0 bg-black/15" aria-hidden />
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.45) 32%, rgba(0,0,0,0.08) 58%, transparent 100%)",
              }}
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(to right, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.28) 42%, transparent 72%)",
              }}
              aria-hidden
            />
            <div className="hero-grain pointer-events-none absolute inset-0 opacity-[0.035]" aria-hidden />
          </div>
        </div>

        {/* Copy — bottom-left, video stays visible above */}
        <div className="relative z-10 col-start-1 row-start-1 flex min-h-[inherit] items-end px-5 pb-10 pt-24 sm:px-8 sm:pb-12 md:px-12 md:pb-14 lg:pb-16">
          <div className="flex w-full max-w-[640px] flex-col items-start text-left lg:max-w-[680px]">
            <motion.h1
              custom={0}
              initial="hidden"
              animate="show"
              variants={fadeUp}
              className="text-balance text-[clamp(1.875rem,4.2vw,3.25rem)] font-medium leading-[1.08] tracking-[-0.035em] text-white"
            >
              VFX from a prompt on your timeline.
            </motion.h1>

            <motion.p
              custom={0.1}
              initial="hidden"
              animate="show"
              variants={fadeUp}
              className="mt-4 max-w-[540px] text-pretty text-[15px] font-normal leading-[1.65] text-white/62 sm:mt-5 sm:text-[16px] sm:leading-[1.7] lg:max-w-[580px]"
            >
              Select a clip in Premiere Pro or After Effects, describe relight,
              background, or VFX, and get a 4K result placed back on your edit.
              No browser tab, no export round-trip.
            </motion.p>

            <motion.div
              custom={0.2}
              initial="hidden"
              animate="show"
              variants={fadeUp}
              className="mt-7 flex w-full flex-col gap-2.5 sm:mt-8 sm:w-auto sm:flex-row sm:items-center sm:gap-3"
            >
              <Link
                href="/checkout"
                onClick={() => track("get_started", { location: "hero" })}
                className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#39FF6A] px-7 text-[14px] font-semibold tracking-[-0.01em] text-black transition-opacity hover:opacity-90 sm:w-auto sm:px-8"
              >
                Buy Prysmor
              </Link>
              <button
                type="button"
                onClick={() => {
                  track("see_pricing", { location: "hero" });
                  document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
                }}
                className="inline-flex h-11 w-full items-center justify-center rounded-full border border-white/30 bg-transparent px-7 text-[14px] font-medium tracking-[-0.01em] text-white/88 transition-colors hover:border-white/50 hover:bg-white/[0.06] sm:w-auto sm:px-8"
              >
                See Pricing
              </button>
            </motion.div>

            <motion.p
              custom={0.28}
              initial="hidden"
              animate="show"
              variants={fadeUp}
              className="mt-5 text-[11px] leading-relaxed tracking-[0.01em] text-white/30 sm:mt-6"
            >
              $99 lifetime · Never expires · 200s AI VFX · Premiere + After Effects
            </motion.p>
          </div>
        </div>
      </div>
    </section>
  );
}
