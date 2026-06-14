"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import LazyVideo from "@/components/media/LazyVideo";
import { videoPoster, withAssetVersion } from "@/hooks/useInView";

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];

export type CapabilityMode = {
  id: string;
  number: string;
  title: string;
  description: string;
  examplePrompt: string;
  benefits: string[];
  videos: string[];
  layout: "split-content-left" | "split-content-right";
};

export const CAPABILITY_MODES: CapabilityMode[] = [
  {
    id: "relight",
    number: "01",
    title: "Relight",
    description:
      "Change the light without rebuilding the grade. Identity and motion stay locked to your source clip.",
    examplePrompt: "warm backlight, late afternoon haze",
    benefits: [
      "Adjust mood from a single prompt",
      "Subject stays consistent shot to shot",
      "Ready to drop back on your timeline",
    ],
    videos: [withAssetVersion("/primjeri/slider1.mp4"), withAssetVersion("/primjeri/slider2.mp4")],
    layout: "split-content-left",
  },
  {
    id: "background",
    number: "02",
    title: "Background",
    description:
      "Replace any backdrop in seconds. No green screen, no rotoscoping, no round-trip to another app.",
    examplePrompt: "neon city at night, soft bokeh",
    benefits: [
      "Swap environments from a text prompt",
      "Optional reference image for precise looks",
      "Clean edges without manual masking",
    ],
    videos: [withAssetVersion("/primjeri/slide1.mp4"), withAssetVersion("/primjeri/slide2.mp4")],
    layout: "split-content-right",
  },
  {
    id: "vfx",
    number: "03",
    title: "VFX",
    description:
      "Fire, rain, smoke, and object removal. Production-ready effects without leaving your edit.",
    examplePrompt: "heavy rain, keep subject dry",
    benefits: [
      "Describe the effect in one sentence",
      "4K output sized for real timelines",
      "Overlay above your edit, original preserved",
    ],
    videos: [withAssetVersion("/primjeri/vfx1.mp4"), withAssetVersion("/primjeri/vfx2.mp4")],
    layout: "split-content-left",
  },
];

function ModeCopy({ mode }: { mode: CapabilityMode }) {
  return (
    <div>
      <p className="font-mono text-[11px] tracking-wide text-[#39FF6A]/45">{mode.number}</p>
      <h3 className="mt-2 text-2xl font-semibold tracking-tight text-white lg:text-4xl">
        {mode.title}
      </h3>
      <p className="mt-3 max-w-md text-[15px] leading-7 text-white/60">
        {mode.description}
      </p>
      <p className="mt-5 max-w-md font-mono text-[13px] leading-6">
        <span className="text-[#39FF6A]/50">Example:</span>{" "}
        <span className="text-white/45">{mode.examplePrompt}</span>
      </p>
      <ul
        className="mt-6 max-w-md space-y-2.5"
        aria-label={`${mode.title} benefits`}
      >
        {mode.benefits.map((benefit) => (
          <li
            key={benefit}
            className="flex items-start gap-2.5 text-[14px] leading-6 text-white/55"
          >
            <span
              className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#39FF6A]/65"
              aria-hidden
            />
            {benefit}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ThumbnailRow({
  mode,
  activeIndex,
  onSelect,
}: {
  mode: CapabilityMode;
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  if (mode.videos.length < 2) return null;

  const thumbClass = (active: boolean) =>
    `relative aspect-video min-h-[44px] overflow-hidden rounded-xl border bg-[#0a0a0a] transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#39FF6A]/40 ${
      active ? "border-[#39FF6A]/35 ring-1 ring-[#39FF6A]/15" : "border-white/10 hover:border-white/20"
    }`;

  const renderThumb = (src: string, index: number, className: string) => {
    const active = index === activeIndex;
    return (
      <button
        key={src}
        type="button"
        role="tab"
        aria-selected={active}
        aria-label={`Show ${mode.title} example ${index + 1}`}
        onClick={() => onSelect(index)}
        className={`${thumbClass(active)} ${className}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={videoPoster(src)}
          alt=""
          decoding="async"
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover opacity-80"
        />
      </button>
    );
  };

  return (
    <>
      <div
        className="hidden grid-cols-2 gap-3 sm:grid"
        role="tablist"
        aria-label={`${mode.title} examples`}
      >
        {mode.videos.map((src, index) => renderThumb(src, index, ""))}
      </div>

      <div
        className="flex gap-3 overflow-x-auto pb-1 sm:hidden snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label={`${mode.title} examples`}
      >
        {mode.videos.map((src, index) =>
          renderThumb(src, index, "w-[44vw] max-w-[220px] shrink-0 snap-start"),
        )}
      </div>
    </>
  );
}

function ModeMedia({
  mode,
  activeIndex,
  onSelect,
  eager = false,
}: {
  mode: CapabilityMode;
  activeIndex: number;
  onSelect: (index: number) => void;
  eager?: boolean;
}) {
  const [fading, setFading] = useState(false);
  const [heroSrc, setHeroSrc] = useState(mode.videos[0]);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectVideo = useCallback(
    (index: number) => {
      if (index === activeIndex) return;
      onSelect(index);
      const next = mode.videos[index];
      if (!next || next === heroSrc) return;

      setFading(true);
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
      fadeTimer.current = setTimeout(() => {
        setHeroSrc(next);
        setFading(false);
      }, 180);
    },
    [activeIndex, heroSrc, mode.videos, onSelect],
  );

  useEffect(() => () => {
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
  }, []);

  useEffect(() => {
    setHeroSrc(mode.videos[activeIndex] ?? mode.videos[0]);
  }, [mode.videos, activeIndex]);

  return (
    <div className="space-y-3 lg:space-y-4">
      <div
        className={`relative transition-opacity duration-200 ${fading ? "opacity-0" : "opacity-100"}`}
      >
        <div
          className="pointer-events-none absolute -inset-6 rounded-[1.75rem] opacity-60 blur-2xl"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(57,255,106,0.08) 0%, transparent 68%)",
          }}
          aria-hidden
        />
        <LazyVideo
          key={heroSrc}
          src={heroSrc}
          label={`${mode.title} demo`}
          eager={eager}
          className="relative aspect-video rounded-2xl border border-white/10 ring-1 ring-[#39FF6A]/10"
        />
      </div>
      <ThumbnailRow mode={mode} activeIndex={activeIndex} onSelect={selectVideo} />
    </div>
  );
}

function SplitModeBlock({ mode, eager = false }: { mode: CapabilityMode; eager?: boolean }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const mediaLeft = mode.layout === "split-content-right";

  return (
    <motion.article
      id={`capability-${mode.id}`}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.45, ease }}
      className="border-t border-white/[0.06] py-16 first:border-t-0 first:pt-0 lg:py-20"
    >
      <div
        className={`grid gap-10 xl:items-start xl:gap-14 ${
          mediaLeft
            ? "xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.9fr)]"
            : "xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.05fr)]"
        }`}
      >
        <div
          className={`order-2 md:order-1 xl:order-none ${
            mediaLeft ? "xl:col-start-2" : ""
          }`}
        >
          <ModeCopy mode={mode} />
        </div>

        <div
          className={`order-1 md:order-2 xl:order-none ${
            mediaLeft ? "xl:col-start-1 xl:row-start-1" : ""
          }`}
        >
          <ModeMedia
            mode={mode}
            activeIndex={activeIndex}
            onSelect={setActiveIndex}
            eager={eager}
          />
        </div>
      </div>
    </motion.article>
  );
}

export default function CapabilitiesSection() {
  return (
    <section
      id="examples"
      aria-labelledby="capabilities-heading"
      className="border-b border-white/[0.06] bg-[#080808]"
    >
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.45, ease }}
          className="mb-14 max-w-2xl lg:mb-16"
        >
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#39FF6A]/45">
            Capabilities
          </p>
          <h2
            id="capabilities-heading"
            className="mt-3 text-3xl font-semibold tracking-tight text-white lg:text-4xl"
          >
            Three modes.{" "}
            <span className="text-[#39FF6A]/90">One panel.</span>
          </h2>
          <p className="mt-4 text-[15px] leading-7 text-white/55">
            Relight, replace backgrounds, and add VFX from the same Adobe panel.
            Each mode keeps your clip on the timeline.
          </p>
        </motion.header>

        <div>
          {CAPABILITY_MODES.map((mode, index) => (
            <SplitModeBlock key={mode.id} mode={mode} eager={index === 0} />
          ))}
        </div>
      </div>
    </section>
  );
}
