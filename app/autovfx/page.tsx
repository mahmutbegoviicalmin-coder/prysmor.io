"use client";

import { useState } from "react";
import Link from "next/link";
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

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];

/* ── hero demo card ── */
function PromptDemo() {
  const stages = ["Idle", "Generating…", "Rendering…", "Done ✓"] as const;
  const [stage, setStage] = useState<number>(0);
  const [prompt, setPrompt] = useState("add fire around the car");

  const run = () => {
    setStage(1);
    setTimeout(() => setStage(2), 1400);
    setTimeout(() => setStage(3), 2600);
    setTimeout(() => setStage(0), 4500);
  };

  return (
    <div className="rounded-[20px] border border-white/[0.09] bg-[#0A0C0F] overflow-hidden shadow-[0_48px_90px_rgba(0,0,0,0.70)]">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] bg-[#090B0E]">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="w-2.5 h-2.5 rounded-full bg-white/10" />
          ))}
        </div>
        <span className="ml-3 text-[10px] text-ink-faint font-mono tracking-wider">
          VFXPilot — generate
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              stage > 0 && stage < 3 ? "bg-accent animate-pulse" : "bg-white/20"
            }`}
          />
          <span
            className={`text-[10px] font-mono ${
              stage > 0 && stage < 3 ? "text-accent/70" : "text-ink-faint"
            }`}
          >
            {stages[stage]}
          </span>
        </span>
      </div>

      <div className="p-5 space-y-3">
        <div>
          <p className="text-[10px] text-ink-faint mb-1.5">Prompt</p>
          <div className="flex items-center gap-2 rounded-[12px] border border-white/[0.08] bg-surface px-3.5 py-2.5">
            <Sparkles className="w-3.5 h-3.5 text-accent/60 flex-shrink-0" />
            <input
              className="flex-1 bg-transparent text-[12px] text-ink outline-none placeholder:text-ink-faint font-mono"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe your effect..."
            />
          </div>
        </div>

        <div className="rounded-[12px] border border-white/[0.07] bg-surface p-4 min-h-[88px] flex items-center justify-center">
          <AnimatePresence mode="wait">
            {stage === 0 && (
              <motion.p
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-[12px] text-ink-faint text-center"
              >
                Press Generate to apply your VFX
              </motion.p>
            )}
            {stage === 1 && (
              <motion.div
                key="gen"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-2 w-full"
              >
                <p className="text-[11px] text-ink-muted">Analysing scene…</p>
                <div className="w-full h-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <motion.div
                    className="h-full bg-accent/50 rounded-full"
                    initial={{ width: "0%" }}
                    animate={{ width: "45%" }}
                    transition={{ duration: 1.3, ease: "easeOut" }}
                  />
                </div>
              </motion.div>
            )}
            {stage === 2 && (
              <motion.div
                key="render"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-2 w-full"
              >
                <p className="text-[11px] text-ink-muted">Compositing effect…</p>
                <div className="w-full h-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <motion.div
                    className="h-full bg-accent rounded-full"
                    initial={{ width: "45%" }}
                    animate={{ width: "90%" }}
                    transition={{ duration: 1.1, ease: "easeOut" }}
                  />
                </div>
              </motion.div>
            )}
            {stage === 3 && (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-2"
              >
                <div className="w-10 h-10 rounded-full bg-accent/[0.12] border border-accent/30 flex items-center justify-center">
                  <Check className="w-5 h-5 text-accent" />
                </div>
                <p className="text-[12px] font-medium text-accent">Effect applied — 3.2 seconds</p>
                <p className="text-[11px] text-ink-faint">Dropped directly into your timeline</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button
          onClick={run}
          disabled={stage > 0 && stage < 3}
          className="w-full py-2.5 rounded-[12px] text-[12px] font-semibold text-background transition-all disabled:opacity-60"
          style={{ background: "linear-gradient(135deg,#A3FF12 0%,#22FFB0 100%)" }}
        >
          {stage === 0 ? "Generate Effect" : stage === 3 ? "Generate Again" : "Generating…"}
        </button>
      </div>
    </div>
  );
}

/* ── examples section ── */
const vfxExamples = [
  { prompt: "set the forest on fire" },
  { prompt: "add a boat in the water" },
  { prompt: "replace the tree with a car" },
  { prompt: "add pictures to the walls" },
  { prompt: "add an explosion" },
  { prompt: "remove the subject" },
];

function ExamplesGrid() {
  return (
    <section className="relative py-24" id="examples">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
      <div className="mx-auto max-w-container px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="mb-10"
        >
          <h2 className="font-heading text-[28px] sm:text-[36px] font-bold text-white tracking-tight">
            See what&apos;s possible
          </h2>
          <p className="mt-2 text-ink-muted text-[14px]">
            Real VFX created by typing simple prompts. Each one took less than 5 minutes to generate.
          </p>
        </motion.div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {vfxExamples.map((ex, i) => (
            <motion.div
              key={ex.prompt}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.4, delay: i * 0.06, ease }}
              className="rounded-[16px] border border-white/[0.07] bg-surface p-5 flex items-center gap-3"
            >
              <div className="w-8 h-8 rounded-xl bg-accent/[0.08] border border-accent/20 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-accent" />
              </div>
              <p className="text-[13px] text-ink-subtle font-mono leading-snug">
                &ldquo;{ex.prompt}&rdquo;
              </p>
            </motion.div>
          ))}
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
    desc: "Your effect renders and drops directly onto your timeline — no export, no round-tripping.",
  },
];

const compRows: ComparisonRow[] = [
  { feature: "Cost", ours: "from $29/month", theirs: "$500–2,000/project" },
  { feature: "Time per effect", ours: "2-5 minutes", theirs: "1-3 days" },
  { feature: "Learning curve", ours: "None", theirs: "6+ months" },
  { feature: "Works in your editor", ours: true, theirs: false },
  { feature: "Unlimited revisions", ours: true, theirs: "Costs extra" },
  { feature: "7-day money-back", ours: true, theirs: false },
];

const pricingTiers: PriceTier[] = [
  {
    id: "starter",
    name: "Starter",
    monthlyPrice: 29,
    yearlyPrice: 20,
    description: "Perfect for individual creators",
    unit: "250s of AI VFX ≈ 4 min",
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
    yearlyPrice: 34,
    description: "Most Popular",
    unit: "500s of AI VFX ≈ 8 min",
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
    yearlyPrice: 90,
    description: "For studios & teams",
    unit: "1000s of AI VFX ≈ 17 min",
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
    quote:
      "This is insane. I can literally finish an entire music video in under an hour now. The AI just gets it — I type \"add fire\" and boom, perfect fire that actually looks real. Game changer.",
    name: "Jakob / TINY TAPES",
    role: "Music Video Editor",
  },
  {
    quote:
      "The fact that it works right inside After Effects is what sold me. I don't have to export, upload, download, and re-import. It's just there. The quality is surprisingly good too.",
    name: "Sarah Miller",
    role: "VFX Artist",
  },
  {
    quote:
      "I was skeptical at first, but the \"remove object\" feature alone is worth the price. Saved me hours of rotoscoping on my last project.",
    name: "Mike Chen",
    role: "Content Creator",
  },
  {
    quote:
      "Finally an AI tool that actually fits into a professional workflow. It's not a gimmick, it's a genuine time-saver. Highly recommended.",
    name: "Alex Rivera",
    role: "Director",
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
    a: "You can generate fire, explosions, smoke, lightning, glows, atmospheric effects, object replacements, removals, and much more — all from a text prompt.",
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
  return (
    <>
      {/* ── HERO ── */}
      <section className="relative min-h-[90vh] flex items-center pt-[64px] overflow-hidden">
        <div
          className="pointer-events-none absolute -top-48 right-1/4 w-[700px] h-[500px] rounded-full blur-[130px] animate-glow-pulse"
          style={{ background: "radial-gradient(ellipse,rgba(34,255,176,0.08) 0%,transparent 65%)" }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute bottom-0 left-0 w-[500px] h-[400px] rounded-full blur-[100px]"
          style={{ background: "radial-gradient(ellipse,rgba(163,255,18,0.06) 0%,transparent 65%)" }}
          aria-hidden="true"
        />

        <div className="mx-auto w-full max-w-container px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-14 lg:gap-20 items-center py-24 lg:py-32">
            <div className="flex flex-col gap-7">
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease }}
              >
                <Badge variant="accent" className="w-fit gap-1.5">
                  <Sparkles className="w-3 h-3" /> Premiere Pro &amp; After Effects
                </Badge>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.58, delay: 0.08, ease }}
                className="font-heading text-[42px] sm:text-[54px] lg:text-[62px] font-extrabold leading-[1.04] tracking-tighter text-white"
              >
                Turn text into VFX,{" "}
                <span className="text-gradient-lime">directly inside Adobe.</span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.52, delay: 0.17, ease }}
                className="text-[16px] sm:text-[17px] text-ink-muted max-w-[420px] leading-relaxed"
              >
                The AI plugin that makes professional VFX as easy as typing a sentence.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.25, ease }}
                className="flex flex-wrap gap-2"
              >
                {["300+ creators", "7-day money-back guarantee"].map((b) => (
                  <span
                    key={b}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.09] bg-white/[0.03] px-3 py-1.5 text-[11px] text-ink-muted"
                  >
                    <Check className="w-2.5 h-2.5 text-accent" /> {b}
                  </span>
                ))}
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.32, ease }}
                className="flex flex-wrap gap-3"
              >
                <Button size="lg" asChild>
                  <Link href="/sign-up">
                    Get Started <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <a href="#examples">Examples</a>
                </Button>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.75, delay: 0.22, ease }}
            >
              <PromptDemo />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── EXAMPLES ── */}
      <ExamplesGrid />

      {/* ── FEATURES ── */}
      <FeatureGrid
        title="VFX that actually makes sense"
        subtitle="Forget spending weeks learning complex software or hiring expensive VFX artists. Just describe what you want and watch it happen."
        features={features}
        cols={2}
      />

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
      <PricingSection
        title="Pick your plan"
        subtitle="Same features, different amounts of VFX credits. Start small or go big — you can always change later."
        tiers={pricingTiers}
        showToggle={true}
        footerNote="7-Day Money-Back Guarantee · Cancel Anytime"
      />

      {/* ── TESTIMONIALS ── */}
      <Testimonials
        title="Don't just take our word for it"
        items={testimonials}
      />

      {/* ── FAQ ── */}
      <FAQ title="Frequently Asked Questions" items={faqItems} />

      {/* ── FINAL CTA ── */}
      <FinalCTA
        title="Get started today"
        subtitle="VFXPilot starts at $29/mo. 7-day money-back guarantee included."
        primaryLabel="Get Started"
        primaryHref="/sign-up"
        secondaryLabel="View Pricing"
        secondaryHref="#pricing"
      />
    </>
  );
}
