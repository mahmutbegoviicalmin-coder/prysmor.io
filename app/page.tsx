"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, Sparkles, Check, Type, Clock, PanelLeft, Users,
  Package, Download, Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/Badge";
import FeatureGrid, { type FeatureItem } from "@/components/sections/FeatureGrid";
import HowItWorks, { type Step } from "@/components/sections/HowItWorks";
import Comparison, { type ComparisonRow } from "@/components/sections/Comparison";
import PricingSection, { type PriceTier } from "@/components/sections/PricingSection";
import Testimonials, { type Testimonial } from "@/components/sections/Testimonials";
import FAQ, { type FAQItem } from "@/components/sections/FAQ";
import FinalCTA from "@/components/sections/FinalCTA";
import VideoCard from "@/components/sections/VideoCard";

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];

const PROMPTS = [
  "add fire around the car",
  "set the forest on fire",
  "add an explosion",
  "add a boat in the water",
  "remove the subject",
  "add electric lightning arc",
  "replace the sky at sunset",
];

/* ── deterministic particle data (no random, no hydration mismatch) ── */
const PARTICLES = Array.from({ length: 60 }, (_, i) => {
  const left   = ((i * 17.3 + 3.7) % 96) + 2;
  const startY = ((i * 11.7 + 10)  % 65) + 20;
  const sizes  = [1, 1, 1, 1.5, 1.5, 2, 2.5] as const;
  const size   = sizes[i % sizes.length];
  const delay  = (i * 0.19) % 9;
  const dur    = 4.5 + (i % 7) * 1.1;
  const accent = i % 7 === 0 || i % 13 === 0;
  const rise   = i % 3 !== 2;
  const alt    = i % 5 === 0;
  return { id: i, left, startY, size, delay, dur, accent, rise, alt };
});

function HeroParticles() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {PARTICLES.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.left}%`,
            top: p.rise ? `${p.startY + 38}%` : `${p.startY}%`,
            width:  `${p.size}px`,
            height: `${p.size}px`,
            background: p.accent ? "#A3FF12" : `rgba(255,255,255,${0.25 + (p.id % 5) * 0.08})`,
            boxShadow: p.accent
              ? `0 0 ${p.size * 3}px rgba(163,255,18,0.8)`
              : p.size >= 2 ? `0 0 4px rgba(255,255,255,0.3)` : "none",
            animation: p.rise
              ? `${p.alt ? "particleRise2" : "particleRise"} ${p.dur}s ${p.delay}s infinite linear`
              : `particleTwinkle ${p.dur * 0.7}s ${p.delay}s infinite ease-in-out`,
          }}
        />
      ))}

      {/* light beams — 3 sweeping diagonal streaks */}
      {[
        { left: "15%", delay: "0s",   dur: "9s",  opacity: 0.018 },
        { left: "55%", delay: "3.5s", dur: "11s", opacity: 0.014 },
        { left: "80%", delay: "7s",   dur: "8s",  opacity: 0.016 },
      ].map((b, i) => (
        <div
          key={i}
          className="absolute top-0 bottom-0 w-[180px]"
          style={{
            left: b.left,
            background: `linear-gradient(180deg, transparent 0%, rgba(163,255,18,${b.opacity}) 40%, rgba(34,255,176,${b.opacity}) 60%, transparent 100%)`,
            animation: `beamSlide ${b.dur} ${b.delay} infinite ease-in-out`,
          }}
        />
      ))}
    </div>
  );
}

/* ── live prompt bar ── */
function PromptBar() {
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState(0);
  const { openSignIn } = useClerk();

  useEffect(() => {
    if (busy || done) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % PROMPTS.length), 2600);
    return () => clearInterval(id);
  }, [busy, done]);

  const generate = () => {
    openSignIn({ afterSignInUrl: "/dashboard" });
  };

  return (
    <div className="w-full max-w-[560px] px-0">
      {/* main bar */}
      <div
        className="flex items-center gap-3 rounded-[18px] border bg-surface-1 p-2 pl-5 shadow-[0_16px_60px_rgba(0,0,0,0.55)] transition-all duration-300"
        style={{ borderColor: busy || done ? "rgba(163,255,18,0.30)" : "rgba(255,255,255,0.09)" }}
      >
        <Sparkles className={`w-4 h-4 flex-shrink-0 transition-colors ${busy || done ? "text-accent" : "text-accent/50"}`} />
        <div className="flex-1 overflow-hidden text-left min-w-0">
          <AnimatePresence mode="wait">
            <motion.span
              key={idx}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="block text-[15px] text-ink-subtle font-mono truncate"
            >
              &ldquo;{PROMPTS[idx]}&rdquo;
            </motion.span>
          </AnimatePresence>
        </div>
        <button
          onClick={generate}
          disabled={busy}
          className="flex-shrink-0 rounded-[13px] px-5 py-2.5 text-[13px] font-bold text-background transition-all duration-200 disabled:opacity-70 hover:scale-[1.03] active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg,#A3FF12 0%,#22FFB0 100%)" }}
        >
          {busy ? "Generating…" : done ? "Done ✓" : "Try it →"}
        </button>
      </div>

      {/* progress */}
      <div className="mt-2.5 h-0.5 rounded-full bg-white/[0.05] overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: "linear-gradient(90deg,#A3FF12,#22FFB0)" }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>

      {/* quick-pick chips */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}
        className="mt-4 flex flex-wrap justify-center gap-2"
      >
        {PROMPTS.slice(0, 5).map((p, i) => (
          <button
            key={p}
            onClick={() => { setIdx(i); openSignIn({ afterSignInUrl: "/dashboard" }); }}
            className={`rounded-full px-3.5 py-1 text-[12px] border transition-all duration-200 ${idx === i ? "border-accent/40 bg-accent/[0.09] text-accent" : "border-white/[0.07] bg-white/[0.02] text-ink-faint hover:border-white/[0.16] hover:text-ink-muted"}`}
          >
            {p}
          </button>
        ))}
      </motion.div>
    </div>
  );
}


/* ── examples section ── */
const vfxExamples = [
  { src: "/editovani/1.mp4",   prompt: "add cinematic neon club lighting" },
  { src: "/editovani/1_1.mp4", prompt: "add dramatic volumetric god rays" },
  { src: "/editovani/1_2.mp4", prompt: "replace background with dark cinematic studio" },
  { src: "/editovani/1_3.mp4", prompt: "surround with massive fire and embers" },
  { src: "/editovani/1_4.mp4", prompt: "transport to Miami at night with city lights" },
  { src: "/editovani/1_5.mp4", prompt: "replace sky with galaxy and full moon" },
];

function ExamplesGrid() {
  return (
    <section className="relative py-24 overflow-hidden" id="examples">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />

      {/* ambient background glow */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[500px] rounded-full blur-[160px] opacity-20"
        style={{ background: "radial-gradient(ellipse, rgba(163,255,18,0.15) 0%, rgba(34,255,176,0.06) 50%, transparent 70%)" }} />

      <div className="mx-auto max-w-container px-4 sm:px-6 lg:px-8">
        {/* header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="mb-10"
        >
          <h2 className="font-heading text-[28px] sm:text-[38px] font-bold text-white tracking-tight leading-tight">
            See what&apos;s possible
          </h2>
          <p className="mt-2.5 text-ink-muted text-[14px] max-w-md">
            Real VFX created by typing simple prompts. Each one took under 5 minutes.
          </p>
        </motion.div>

        {/* bento grid — alternating wide/narrow rhythm */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">

          {/* Row 1 — wide left, narrow right */}
          <div className="lg:col-span-7 h-[300px] sm:h-[360px]">
            <VideoCard src={vfxExamples[0].src} prompt={vfxExamples[0].prompt} index={0} featured />
          </div>
          <div className="lg:col-span-5 h-[300px] sm:h-[360px]">
            <VideoCard src={vfxExamples[1].src} prompt={vfxExamples[1].prompt} index={1} />
          </div>

          {/* Row 2 — narrow left, wide right */}
          <div className="lg:col-span-5 h-[260px] sm:h-[300px]">
            <VideoCard src={vfxExamples[2].src} prompt={vfxExamples[2].prompt} index={2} />
          </div>
          <div className="lg:col-span-7 h-[260px] sm:h-[300px]">
            <VideoCard src={vfxExamples[3].src} prompt={vfxExamples[3].prompt} index={3} />
          </div>

          {/* Row 3 — equal halves */}
          <div className="lg:col-span-6 h-[240px] sm:h-[280px]">
            <VideoCard src={vfxExamples[4].src} prompt={vfxExamples[4].prompt} index={4} />
          </div>
          <div className="lg:col-span-6 h-[240px] sm:h-[280px]">
            <VideoCard src={vfxExamples[5].src} prompt={vfxExamples[5].prompt} index={5} />
          </div>

        </div>
      </div>
    </section>
  );
}

/* ── data ── */
const features: FeatureItem[] = [
  {
    icon: Type,
    title: "Just type what you want",
    desc: "No complex menus or settings. Just tell our AI what effect you need and it handles the rest.",
  },
  {
    icon: Clock,
    title: "Done in minutes",
    desc: "What used to take days now happens in 2-5 minutes. Seriously.",
  },
  {
    icon: PanelLeft,
    title: "Drops right into your timeline",
    desc: "No importing, no converting. Effects appear exactly where you need them in Premiere or After Effects.",
  },
  {
    icon: Users,
    title: "Made by editors, for editors",
    desc: "We know your workflow because we live it too. Every feature is built to save you time.",
  },
];

const steps: Step[] = [
  {
    icon: Package,
    number: "01",
    title: "Install the plugin",
    desc: "Download VFXPilot and install it directly into Premiere Pro or After Effects in seconds.",
  },
  {
    icon: Wand2,
    number: "02",
    title: "Type your effect",
    desc: "Open the VFXPilot panel and describe the effect you want in plain language.",
  },
  {
    icon: Download,
    number: "03",
    title: "Apply to timeline",
    desc: "Your effect renders and drops directly onto your timeline. No export, no round-tripping.",
  },
];

const compRows: ComparisonRow[] = [
  { feature: "Cost", ours: "from $29/month", theirs: "$500–2,000/project" },
  { feature: "Time per effect", ours: "2–5 minutes", theirs: "1–3 days" },
  { feature: "Learning curve", ours: "None", theirs: "6+ months" },
  { feature: "Works in your editor", ours: true, theirs: false },
  { feature: "Unlimited revisions", ours: true, theirs: "Costs extra" },
  { feature: "AI-powered generation", ours: true, theirs: false },
];

const pricingTiers: PriceTier[] = [
  {
    id: "starter",
    name: "Starter",
    monthlyPrice: 29,
    yearlyPrice: 299,   // $299/yr — save $49 vs monthly ($348)
    yearlyPerDay: "0.87",
    yearlySave: 49,
    description: "Perfect for individual creators",
    unit: "250s of AI VFX ≈ 4 min",
    yearlyUnit: "3000s of AI VFX ≈ 48 min",
    bullets: [
      "Premiere Pro & After Effects plugin",
      "Latest AI video generation",
      "AI prompt enhancement",
      "Timeline integration",
      "4K output quality",
    ],
    cta: "Get Started",
    ctaHref: "/sign-up",
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: 49,
    yearlyPrice: 499,   // $499/yr — save $89 vs monthly ($588)
    yearlyPerDay: "1.37",
    yearlySave: 89,
    description: "For serious creators",
    unit: "500s of AI VFX ≈ 8 min",
    yearlyUnit: "6000s of AI VFX ≈ 98 min",
    featured: true,
    badge: "Most Popular",
    bullets: [
      "Premiere Pro & After Effects plugin",
      "Latest AI video generation",
      "AI prompt enhancement",
      "Timeline integration",
      "4K output quality",
    ],
    cta: "Get Started",
    ctaHref: "/sign-up",
  },
  {
    id: "exclusive",
    name: "Exclusive",
    monthlyPrice: 129,
    yearlyPrice: 1299,  // $1299/yr — save $249 vs monthly ($1548)
    yearlyPerDay: "3.56",
    yearlySave: 249,
    description: "For studios & teams",
    unit: "1000s of AI VFX ≈ 17 min",
    yearlyUnit: "12000s of AI VFX ≈ 204 min",
    bullets: [
      "Premiere Pro & After Effects plugin",
      "Latest AI video generation",
      "AI prompt enhancement",
      "Timeline integration",
      "4K output quality",
      "Priority support included",
    ],
    cta: "Get Started",
    ctaHref: "/sign-up",
  },
];

const testimonials: Testimonial[] = [
  {
    badge: "Saves 10+ hours a week",
    quote:
      "I knocked out a full music video in one afternoon. Typed the effect, hit generate, done. The fire looked so real my client assumed I had a whole VFX team behind me.",
    name: "Marcus W.",
    role: "Music Video Director",
  },
  {
    badge: "Cut VFX time by 90%",
    quote:
      "No exporting, no round trips, no wasted time. It lives right inside Premiere and behaves exactly how you want it to. That alone made it worth it.",
    name: "Jordan Park",
    role: "Motion Designer",
  },
  {
    badge: "ROI on first project",
    quote:
      "Replaced the background on 40 clips in a single sitting. What used to take me two days of green screen cleanup now takes under an hour and honestly looks better.",
    name: "Dre Santos",
    role: "Filmmaker",
  },
  {
    badge: "Uses it daily",
    quote:
      "I was skeptical going in. The god rays result genuinely surprised me. What I would have built manually in three hours inside After Effects was ready in four minutes.",
    name: "Leah Torres",
    role: "VFX Artist",
  },
  {
    badge: "Grew channel 3x",
    quote:
      "My montages look like a completely different show now. I add cinematic atmosphere in minutes and my audience genuinely thinks I brought on someone new.",
    name: "Tyson Blake",
    role: "Gaming Creator",
  },
  {
    badge: "Raised freelance rates",
    quote:
      "As a solo editor I could never touch proper VFX work. Now I offer it as a service. My rates went up and clients actually pay them. That says everything.",
    name: "Mia Chen",
    role: "Freelance Video Editor",
  },
];

const faqItems: FAQItem[] = [
  {
    q: "What is VFXPilot?",
    a: "VFXPilot is an AI-powered plugin for Premiere Pro and After Effects that lets you generate professional visual effects by typing a simple text prompt. No VFX experience required.",
  },
  {
    q: "Is VFXPilot worth it if I only edit occasionally?",
    a: "Absolutely. Even occasional editors save hours per project. The Starter plan at $29/month gives you enough VFX credits for most part-time workflows, and you can cancel anytime.",
  },
  {
    q: "What if I'm not satisfied?",
    a: "We offer a 7-day money-back guarantee with no questions asked. If VFXPilot isn't the right fit, just reach out within 7 days of purchase for a full refund.",
  },
  {
    q: "Why is this so much cheaper than hiring a VFX artist?",
    a: "Traditional VFX work requires skilled artists, expensive software, and hours of rendering. VFXPilot automates the heavy lifting with AI, allowing us to offer professional-quality results at a fraction of the cost.",
  },
  {
    q: "Do my credits expire at the end of the month?",
    a: "Yes, VFX credits reset on your monthly billing date and do not roll over. We recommend choosing a plan that matches your typical monthly usage.",
  },
  {
    q: "What software is VFXPilot compatible with?",
    a: "VFXPilot works as a native plugin inside Adobe Premiere Pro and Adobe After Effects. Generated files are standard video formats compatible with any NLE.",
  },
  {
    q: "What types of effects can I create?",
    a: "You can generate fire, explosions, smoke, lightning, glows, atmospheric effects, object replacements, removals, and much more. All from a text prompt.",
  },
  {
    q: "How long does it take to generate effects?",
    a: "Most effects render in 2–5 minutes from the moment you submit your prompt. Complex or longer effects may take slightly longer.",
  },
  {
    q: "Do I need any VFX experience?",
    a: "None at all. VFXPilot is designed for editors of all skill levels. If you can type a sentence, you can create professional VFX.",
  },
  {
    q: "What happens after I purchase?",
    a: "You'll receive an email with your plugin download link and license key. Installation takes under a minute, and you can start generating effects immediately.",
  },
  {
    q: "Can I cancel my subscription anytime?",
    a: "Yes. There are no contracts or lock-in periods. You can cancel your subscription at any time from your account settings.",
  },
  {
    q: "What if I need help after purchasing?",
    a: "Our support team is available via email. Exclusive plan subscribers receive priority support with faster response times.",
  },
];

export default function VFXPilotPage() {
  const { openSignUp } = useClerk();
  return (
    <>
      {/* ── HERO ── */}
      <section className="relative min-h-[100svh] flex flex-col items-center justify-center pt-[100px] sm:pt-[120px] pb-16 sm:pb-24 overflow-hidden text-center">

        {/* ── backgrounds ── */}

        {/* particles */}
        <HeroParticles />

        {/* dot grid */}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true"
          style={{
            backgroundImage: "radial-gradient(rgba(163,255,18,0.07) 1px, transparent 1px)",
            backgroundSize: "38px 38px",
            maskImage: "radial-gradient(ellipse 80% 70% at 50% 30%, black 0%, transparent 100%)",
          }}
        />
        {/* aurora glow — top center */}
        <div className="pointer-events-none absolute -top-[200px] left-1/2 -translate-x-1/2 w-[1100px] h-[700px] rounded-full blur-[160px]" aria-hidden="true"
          style={{ background: "radial-gradient(ellipse, rgba(163,255,18,0.14) 0%, rgba(34,255,176,0.07) 45%, transparent 68%)" }} />
        {/* side orbs */}
        <div className="pointer-events-none absolute bottom-[-80px] left-[-80px] w-[600px] h-[600px] rounded-full blur-[140px]" aria-hidden="true"
          style={{ background: "radial-gradient(ellipse, rgba(80,50,255,0.08) 0%, transparent 65%)" }} />
        <div className="pointer-events-none absolute bottom-[5%] right-[-60px] w-[500px] h-[500px] rounded-full blur-[130px]" aria-hidden="true"
          style={{ background: "radial-gradient(ellipse, rgba(34,255,176,0.07) 0%, transparent 65%)" }} />
        {/* top horizontal glow line */}
        <div className="pointer-events-none absolute top-[64px] inset-x-0 h-px" aria-hidden="true"
          style={{ background: "linear-gradient(90deg,transparent 5%,rgba(163,255,18,0.25) 35%,rgba(34,255,176,0.25) 65%,transparent 95%)" }} />

        {/* ── main content ── */}
        <div className="relative z-10 flex flex-col items-center gap-8 sm:gap-12 px-4 sm:px-8 max-w-[860px] mx-auto w-full">


          {/* headline */}
          <div className="space-y-2">
            <motion.h1
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.1, ease }}
              className="font-heading text-[40px] sm:text-[72px] lg:text-[92px] font-extrabold leading-[1.05] tracking-[-0.04em] text-white"
            >
              Text to <span className="text-gradient-lime">VFX</span>
            </motion.h1>
            <motion.div
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.22, ease }}
              className="font-heading text-[40px] sm:text-[72px] lg:text-[92px] font-extrabold leading-[1.05] tracking-[-0.04em] text-white"
            >
              Inside <span className="text-gradient-lime">Adobe.</span> Instantly.
            </motion.div>
          </div>

          {/* subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.38, ease }}
            className="text-[17px] sm:text-[19px] text-ink-muted max-w-[500px] leading-[1.7]"
          >
            The AI plugin that makes professional VFX as easy as{" "}
            <em className="not-italic text-ink-subtle">typing a sentence.</em>
          </motion.p>

          {/* live prompt bar */}
          <motion.div
            className="w-full flex justify-center"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.5, ease }}
          >
            <PromptBar />
          </motion.div>

          {/* CTA buttons */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.64, ease }}
            className="flex flex-wrap justify-center gap-3"
          >
            <Button size="lg"
              onClick={() => openSignUp({ afterSignUpUrl: "/dashboard" })}
              className="h-12 px-7 text-[15px] font-bold rounded-[14px] gap-2 shadow-[0_8px_32px_rgba(163,255,18,0.25)]">
              Get Started <ArrowRight className="w-4 h-4" />
            </Button>
            <Button size="lg" variant="outline" asChild
              className="h-12 px-7 text-[15px] rounded-[14px]">
              <a href="#examples">See Examples</a>
            </Button>
          </motion.div>

          {/* stats */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.82 }}
            className="flex flex-wrap justify-center items-center gap-x-6 gap-y-2 sm:gap-x-8"
          >
            {[
              { value: "300+", label: "creators" },
              { value: "2–5 min", label: "per effect" },
              { value: "4K", label: "output" },
              { value: "7-day", label: "guarantee" },
            ].map(({ value, label }, i) => (
              <div key={label} className="flex items-baseline gap-1.5">
                {i > 0 && <span className="hidden sm:inline-block mr-4 w-px h-3.5 bg-white/[0.10]" />}
                <span className="text-[15px] sm:text-[16px] font-bold text-white font-heading">{value}</span>
                <span className="text-[12px] text-ink-faint">{label}</span>
              </div>
            ))}
          </motion.div>

        </div>

        {/* bottom fade into next section */}
        <div className="pointer-events-none absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-background via-background/70 to-transparent" />

        {/* scroll hint */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4, duration: 0.6 }}
        >
          <span className="text-[11px] text-ink-faint tracking-widest uppercase">Scroll</span>
          <motion.div
            className="w-px h-8 origin-top"
            style={{ background: "linear-gradient(to bottom, rgba(163,255,18,0.5), transparent)" }}
            animate={{ scaleY: [0, 1, 0] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
          />
        </motion.div>

      </section>

      {/* ── EXAMPLES ── */}
      <div id="examples">
        <ExamplesGrid />
      </div>

      {/* ── FEATURES ── */}
      <div id="features">
        <FeatureGrid
          title="VFX that actually makes sense"
          subtitle="Forget spending weeks learning complex software or hiring expensive VFX artists. Just describe what you want and watch it happen."
          features={features}
          cols={2}
        />
      </div>

      {/* ── HOW IT WORKS ── */}
      <HowItWorks title="How VFXPilot works" steps={steps} />

      {/* ── COMPARISON ── */}
      <Comparison
        title="VFXPilot vs The Alternatives"
        subtitle="See why creators choose VFXPilot over traditional methods."
        ourLabel="VFXPilot"
        theirLabel="Hiring VFX Artist"
        rows={compRows}
      />

      {/* ── PRICING ── */}
      <div id="pricing" />
      <PricingSection
        title="Pick your plan"
        subtitle="Same features, different amounts of VFX credits. Start small or go big, you can always change later."
        tiers={pricingTiers}
        showToggle={true}
        footerNote="7-Day Money-Back Guarantee · Cancel Anytime"
        onCtaClick={() => openSignUp({ afterSignUpUrl: "/dashboard" })}
      />

      {/* ── TESTIMONIALS ── */}
      <Testimonials
        title="Don't just take our word for it"
        items={testimonials}
      />

      {/* ── FAQ ── */}
      <div id="faq">
        <FAQ title="Frequently Asked Questions" items={faqItems} />
      </div>

      {/* ── FINAL CTA ── */}
      <FinalCTA
        title="Get started today"
        subtitle="Generate cinematic VFX directly inside Adobe Premiere Pro. No plugins to learn, no complex workflows."
        primaryLabel="Get Started"
        onPrimaryClick={() => openSignUp({ afterSignUpUrl: "/dashboard" })}
        secondaryLabel="View Pricing"
        secondaryHref="#pricing"
      />
    </>
  );
}
