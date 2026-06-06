"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { track } from "@vercel/analytics";
import LazyVideo from "@/components/media/LazyVideo";

const CAPABILITIES = ["Relight", "Background", "VFX"];

export default function HeroSection() {
  return (
    <section
      className="border-b border-white/[0.06] bg-[#080808]"
      style={{ paddingTop: "calc(120px + var(--bar-h, 0px))" }}
    >
      <div className="mx-auto grid max-w-[1200px] gap-12 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-14 lg:pb-20 lg:pt-14 xl:px-8">
        {/* Copy */}
        <div className="max-w-xl">
          <div className="flex flex-wrap items-center gap-2.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/45">
              AI VFX panel for
            </p>
            <div className="flex items-center gap-2">
              <Image
                src="/pr.png"
                alt="Premiere Pro"
                width={18}
                height={18}
                className="h-[18px] w-[18px] object-contain opacity-80"
                priority
              />
              <Image
                src="/ae.png"
                alt="After Effects"
                width={18}
                height={18}
                className="h-[18px] w-[18px] object-contain opacity-80"
                priority
              />
            </div>
          </div>

          <h1 className="mt-5 text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.08] tracking-tight text-white">
            Generate VFX on your{" "}
            <span className="text-[#39FF6A]/90">Adobe timeline</span>.
          </h1>

          <p className="mt-5 max-w-md text-[15px] leading-7 text-white/55">
            Select a clip, describe the effect, and get a 4K result back on your
            timeline. Prysmor runs inside Premiere Pro and After Effects, not in
            a browser.
          </p>

          <div className="mt-8 flex flex-wrap items-center border-y border-white/[0.06] py-4 text-[13px] text-white/70">
            {CAPABILITIES.map((item, index) => (
              <span key={item} className="flex items-center gap-2">
                {index > 0 && (
                  <span className="mx-4 hidden h-3 w-px bg-white/10 sm:inline-block" aria-hidden />
                )}
                <span
                  className="h-1 w-1 shrink-0 rounded-full bg-[#39FF6A]/70"
                  aria-hidden
                />
                {item}
              </span>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-4 text-[12px] text-white/40">
            <div className="flex items-center gap-2">
              <Image src="/pr.png" alt="" width={16} height={16} className="opacity-70" aria-hidden />
              <Image src="/ae.png" alt="" width={16} height={16} className="opacity-70" aria-hidden />
              <span>Premiere Pro & After Effects</span>
            </div>
            <span className="hidden h-3 w-px bg-white/10 sm:block" aria-hidden />
            <span>macOS & Windows</span>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              href="/sign-up"
              onClick={() => track("get_started", { location: "hero" })}
              className="inline-flex items-center gap-2 rounded-lg bg-[#39FF6A] px-5 py-3 text-[14px] font-semibold text-black transition-opacity hover:opacity-90"
            >
              Get Started
              <ArrowRight size={15} strokeWidth={2.5} />
            </Link>
            <button
              type="button"
              onClick={() => {
                track("see_pricing", { location: "hero" });
                document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="inline-flex items-center rounded-lg border border-white/10 px-5 py-3 text-[14px] font-medium text-white/65 transition-colors hover:border-white/20 hover:text-white"
            >
              See pricing
            </button>
          </div>

          <p className="mt-4 text-[12px] text-white/30">
            Free account · Install both panels · 7-day money-back on paid plans
          </p>
        </div>

        {/* Product proof */}
        <div className="relative w-full">
          <div
            className="pointer-events-none absolute -inset-10 rounded-[2rem] opacity-70 blur-3xl"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(57,255,106,0.10) 0%, transparent 68%)",
            }}
            aria-hidden
          />
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0a] ring-1 ring-[#39FF6A]/10">
            <LazyVideo
              src="/vfx.mp4"
              poster="/vfx-poster.jpg"
              label="Prysmor VFX output example"
              eager
              className="aspect-video w-full"
              videoClassName="absolute inset-0 h-full w-full object-cover"
            />
          </div>
          <p className="mt-3 text-center text-[12px] text-white/30 lg:text-left">
            Clip → prompt → result on your timeline
          </p>
        </div>
      </div>
    </section>
  );
}
