"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { track } from "@vercel/analytics";
import LazyVideo from "@/components/media/LazyVideo";

const CAPABILITIES = ["Relight", "Background", "VFX"];

const WORKFLOW_STEPS = ["Select Clip", "Describe Effect", "Apply To Timeline"];

export default function HeroSection() {
  return (
    <section
      className="relative border-b border-white/[0.06] bg-[#080808]"
      style={{ paddingTop: "88px" }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[480px] opacity-30"
        style={{
          background:
            "radial-gradient(ellipse 50% 40% at 70% 0%, rgba(57,255,106,0.05) 0%, transparent 70%)",
        }}
        aria-hidden
      />

      <div className="relative mx-auto grid max-w-[1200px] gap-10 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:items-center lg:gap-12 lg:pb-20 lg:pt-12 xl:px-8">
        <div className="max-w-xl lg:py-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/30">
            AI VFX for Premiere Pro & After Effects
          </p>

          <h1 className="mt-3.5 text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.06] tracking-[-0.035em] text-white">
            Generate VFX directly on your{" "}
            <span className="text-[#39FF6A]">timeline.</span>
          </h1>

          <p className="mt-3.5 max-w-md text-[15px] leading-7 text-white/45">
            Select a clip, describe the effect, and get a 4K result back on your
            timeline. Prysmor runs inside Premiere Pro and After Effects, not in
            a browser.
          </p>

          <div className="mt-7 flex flex-wrap gap-2">
            {CAPABILITIES.map((item) => (
              <span
                key={item}
                className="inline-flex items-center rounded-md border border-white/[0.08] bg-white/[0.025] px-3 py-1.5 text-[12px] font-medium tracking-[-0.01em] text-white/58 transition-all duration-200 hover:border-white/[0.14] hover:bg-white/[0.05] hover:text-white/78"
              >
                {item}
              </span>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2">
              <Image
                src="/pr.png"
                alt=""
                width={18}
                height={18}
                className="h-[18px] w-[18px] object-contain opacity-60"
                aria-hidden
              />
              <Image
                src="/ae.png"
                alt=""
                width={18}
                height={18}
                className="h-[18px] w-[18px] object-contain opacity-60"
                aria-hidden
              />
            </div>
            <span className="text-[12px] tracking-[-0.01em] text-white/38">
              Premiere Pro & After Effects
            </span>
          </div>

          <div className="mt-10 border-t border-white/[0.05] pt-8">
            <p className="text-[11px] tracking-[-0.01em] text-white/28">
              Create an account and try Prysmor in Playground.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2.5">
              <Link
                href="/sign-up"
                onClick={() => track("get_started", { location: "hero" })}
                className="inline-flex items-center gap-2 rounded-lg bg-[#39FF6A] px-5 py-2.5 text-[14px] font-semibold tracking-[-0.01em] text-black transition-opacity hover:opacity-90"
              >
                Get Started Free
                <ArrowRight size={15} strokeWidth={2.5} />
              </Link>
              <button
                type="button"
                onClick={() => {
                  track("see_pricing", { location: "hero" });
                  document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
                }}
                className="inline-flex items-center rounded-lg border border-white/[0.09] px-5 py-2.5 text-[14px] font-medium tracking-[-0.01em] text-white/50 transition-colors hover:border-white/[0.16] hover:text-white/75"
              >
                See Pricing
              </button>
            </div>

            <p className="mt-3 text-[10px] leading-relaxed tracking-[0.02em] text-white/24">
              <span>Free account</span>
              <span className="mx-1.5 text-white/15" aria-hidden>
                ·
              </span>
              <span>1 free generation included</span>
              <span className="mx-1.5 text-white/15" aria-hidden>
                ·
              </span>
              <span>No credit card required</span>
            </p>
          </div>
        </div>

        <div className="relative w-full lg:order-none">
          <div
            className="pointer-events-none absolute -inset-14 rounded-[2rem] opacity-60 blur-3xl"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(57,255,106,0.14) 0%, transparent 62%)",
            }}
            aria-hidden
          />

          <div className="relative overflow-hidden rounded-2xl border border-white/[0.12] bg-[#0a0a0a]/80 shadow-[0_28px_90px_rgba(0,0,0,0.62),0_0_0_1px_rgba(255,255,255,0.04)_inset] ring-1 ring-[#39FF6A]/15 backdrop-blur-sm">
            <div
              className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-white/[0.09] via-white/[0.02] to-transparent"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-0 z-10 rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.10),inset_0_-1px_0_rgba(0,0,0,0.35)]"
              aria-hidden
            />
            <LazyVideo
              src="/vfx.mp4"
              poster="/vfx-poster.jpg"
              label="Prysmor VFX output example"
              eager
              className="aspect-video w-full"
              videoClassName="absolute inset-0 h-full w-full object-cover"
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-1 lg:justify-start">
            {WORKFLOW_STEPS.map((step, index) => (
              <span key={step} className="flex items-center gap-1">
                <span className="rounded border border-white/[0.07] bg-white/[0.02] px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-white/35">
                  {step}
                </span>
                {index < WORKFLOW_STEPS.length - 1 && (
                  <span className="text-[10px] text-white/15" aria-hidden>
                    →
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
